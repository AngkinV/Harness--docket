// src/resource-worker.js
import { parentPort, workerData } from "node:worker_threads";

// src/storage.js
import { hostname } from "node:os";
import { constants, openSync, closeSync, writeFileSync, readFileSync, lstatSync, unlinkSync, renameSync, fsyncSync, existsSync } from "node:fs";
import { mkdir, open, unlink, lstat, rename } from "node:fs/promises";

// src/http.js
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};

// src/storage.js
var nofollow = constants.O_NOFOLLOW || 0;
var ownHost = hostname();
async function readFileBounded(path, maxBytes) {
  const file = await open(path, constants.O_RDONLY | nofollow);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new HttpError(409, "\u6587\u4EF6\u65E0\u6548\u6216\u8D85\u8FC7\u5927\u5C0F\u9650\u5236");
    const data = await file.readFile();
    if (data.length > maxBytes) throw new HttpError(409, "\u6587\u4EF6\u8BFB\u53D6\u671F\u95F4\u53D1\u751F\u53D8\u5316");
    return data;
  } finally {
    await file.close();
  }
}

// src/avatar-validation.js
import { createHash } from "node:crypto";
var MAX_MODEL_BYTES = 50 * 1024 * 1024;
var AvatarError = class extends HttpError {
};
var requireModel = (ok, message) => {
  if (!ok) throw new AvatarError(422, message);
};
var finite = (values) => Array.isArray(values) && values.every(Number.isFinite);
var widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
var components = { 5120: [1, "readInt8"], 5121: [1, "readUInt8"], 5122: [2, "readInt16LE"], 5123: [2, "readUInt16LE"], 5125: [4, "readUInt32LE"], 5126: [4, "readFloatLE"] };
var requiredBones = ["hips", "spine", "head", ...["left", "right"].flatMap((side) => ["UpperArm", "LowerArm", "Hand", "UpperLeg", "LowerLeg", "Foot"].map((part) => side + part))];
var boneParents = { spine: "hips", chest: "spine", upperChest: "chest", neck: "upperChest", head: "neck", leftEye: "head", rightEye: "head", jaw: "head" };
for (const side of ["left", "right"]) {
  Object.assign(boneParents, { [side + "Shoulder"]: "upperChest", [side + "UpperArm"]: side + "Shoulder", [side + "LowerArm"]: side + "UpperArm", [side + "Hand"]: side + "LowerArm", [side + "UpperLeg"]: "hips", [side + "LowerLeg"]: side + "UpperLeg", [side + "Foot"]: side + "LowerLeg", [side + "Toes"]: side + "Foot" });
  for (const finger of ["Thumb", "Index", "Middle", "Ring", "Little"]) {
    boneParents[side + finger + "Proximal"] = finger === "Thumb" ? side + "ThumbMetacarpal" : side + "Hand";
    boneParents[side + finger + "Intermediate"] = side + finger + "Proximal";
    boneParents[side + finger + "Distal"] = side + finger + "Intermediate";
  }
  boneParents[side + "ThumbMetacarpal"] = side + "Hand";
}
function determinant(m) {
  const [a, b, c, d, e, f, g, h, i, j, k, l, n, o, p, q] = m;
  return a * (f * (k * q - l * p) - g * (j * q - l * o) + h * (j * p - k * o)) - b * (e * (k * q - l * p) - g * (i * q - l * n) + h * (i * p - k * n)) + c * (e * (j * q - l * o) - f * (i * q - l * n) + h * (i * o - j * n)) - d * (e * (j * p - k * o) - f * (i * p - k * n) + g * (i * o - j * n));
}
function validateAvatar(bytes, filename = "model.glb") {
  requireModel(Buffer.isBuffer(bytes) && bytes.length >= 20 && bytes.length <= MAX_MODEL_BYTES, "\u6A21\u578B\u4E3A\u7A7A\u3001\u5DF2\u635F\u574F\u6216\u8D85\u8FC7 50 MB");
  requireModel(bytes.readUInt32LE(0) === 1179937895 && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, "\u9700\u8981\u5B8C\u6574\u7684 GLB 2.0 \u6216 VRM \u6587\u4EF6");
  let json, binary = Buffer.alloc(0), seenBinary = false;
  for (let offset = 12; offset < bytes.length; ) {
    requireModel(offset + 8 <= bytes.length, "\u6A21\u578B\u6570\u636E\u5757\u4E0D\u5B8C\u6574");
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    requireModel(length % 4 === 0 && offset + 8 + length <= bytes.length, "\u6A21\u578B\u6570\u636E\u5757\u957F\u5EA6\u65E0\u6548");
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset === 12) {
      requireModel(type === 1313821514 && length <= 8 * 1024 * 1024, "\u6A21\u578B JSON \u6570\u636E\u65E0\u6548\u6216\u8FC7\u5927");
      try {
        json = JSON.parse(chunk.toString("utf8"));
      } catch {
        throw new AvatarError(422, "\u6A21\u578B JSON \u5DF2\u635F\u574F");
      }
    } else {
      requireModel(type === 5130562 && !seenBinary, "\u4E0D\u652F\u6301\u6B64\u6A21\u578B\u6570\u636E\u5757");
      binary = chunk;
      seenBinary = true;
    }
    offset += 8 + length;
  }
  requireModel(json?.asset?.version === "2.0", "\u4EC5\u652F\u6301 glTF 2.0");
  const { nodes = [], skins = [], meshes = [], accessors = [], bufferViews = [], buffers = [], images = [], animations = [] } = json;
  for (const array of [nodes, skins, meshes, accessors, bufferViews, buffers, images, animations]) requireModel(Array.isArray(array), "\u6A21\u578B\u6570\u7EC4\u7ED3\u6784\u65E0\u6548");
  requireModel(nodes.length <= 2048 && skins.length <= 128 && meshes.length <= 256 && accessors.length <= 8192 && images.length <= 128 && animations.length <= 128, "\u6A21\u578B\u8FC7\u4E8E\u590D\u6742\uFF0C\u8BF7\u7CBE\u7B80\u9AA8\u9ABC\u3001\u7F51\u683C\u6216\u7EB9\u7406");
  requireModel(buffers.length <= 1 && buffers.every((b) => !b.uri && Number.isInteger(b.byteLength) && b.byteLength >= 0 && b.byteLength <= binary.length && binary.length - b.byteLength <= 3), "\u8BF7\u5C06\u6240\u6709\u6A21\u578B\u6570\u636E\u5D4C\u5165\u5355\u4E2A\u6587\u4EF6");
  const allowedExtensions = /* @__PURE__ */ new Set(["VRM", "VRMC_vrm", "VRMC_springBone", "VRMC_node_constraint", "VRMC_materials_mtoon", "VRMC_materials_hdr_emissiveMultiplier", "KHR_materials_unlit", "KHR_texture_transform", "KHR_materials_emissive_strength", "KHR_materials_specular", "KHR_materials_ior", "KHR_materials_clearcoat", "KHR_materials_transmission", "KHR_materials_volume", "KHR_materials_sheen", "KHR_materials_iridescence", "KHR_materials_anisotropy"]);
  for (const ext of json.extensionsUsed ?? []) requireModel(allowedExtensions.has(ext), "\u6682\u4E0D\u652F\u6301\u6A21\u578B\u6269\u5C55\uFF1A" + ext + "\uFF1B\u8BF7\u5BFC\u51FA\u672A\u538B\u7F29\u3001\u5185\u5D4C\u7EB9\u7406\u7684\u6A21\u578B");
  const ref = (array, index, label) => {
    requireModel(Number.isInteger(index) && index >= 0 && index < array.length, label + "\u5F15\u7528\u8D8A\u754C");
    return array[index];
  };
  for (const view of bufferViews) {
    requireModel(view.buffer === 0 && buffers.length === 1 && Number.isInteger(view.byteLength) && view.byteLength >= 0 && Number.isInteger(view.byteOffset ?? 0) && (view.byteOffset ?? 0) >= 0 && (view.byteOffset ?? 0) + view.byteLength <= buffers[0].byteLength, "\u6A21\u578B\u7F13\u51B2\u533A\u8D8A\u754C");
  }
  const readers = accessors.map((a) => {
    const component = components[a.componentType], width = widths[a.type];
    requireModel(component && width && Number.isInteger(a.count) && a.count >= 0 && a.count <= 2e6, "\u9876\u70B9\u6570\u636E\u683C\u5F0F\u6216\u6570\u91CF\u65E0\u6548");
    requireModel(!a.sparse, "\u6682\u4E0D\u652F\u6301\u7A00\u758F\u9876\u70B9\u6570\u636E\uFF0C\u8BF7\u5BFC\u51FA\u5B8C\u6574\u9876\u70B9\u6570\u636E");
    const view = ref(bufferViews, a.bufferView, "\u9876\u70B9\u7F13\u51B2\u533A"), stride = view.byteStride ?? component[0] * width, offset = a.byteOffset ?? 0;
    requireModel(Number.isInteger(stride) && stride >= component[0] * width && stride <= 252 && stride % component[0] === 0 && Number.isInteger(offset) && offset >= 0 && offset % component[0] === 0, "\u9876\u70B9\u6570\u636E\u6B65\u957F\u6216\u504F\u79FB\u65E0\u6548");
    requireModel(!a.type.startsWith("MAT") || a.componentType === 5126, "\u77E9\u9635\u5FC5\u987B\u4F7F\u7528\u6D6E\u70B9\u683C\u5F0F");
    requireModel(offset + (a.count ? (a.count - 1) * stride + component[0] * width : 0) <= view.byteLength, "\u9876\u70B9\u6570\u636E\u957F\u5EA6\u8D8A\u754C");
    const start = (view.byteOffset ?? 0) + offset;
    return (index, column = 0) => {
      let value = binary[component[1]](start + index * stride + column * component[0]);
      if (a.normalized && a.componentType !== 5126) value = a.componentType === 5121 ? value / 255 : a.componentType === 5123 ? value / 65535 : a.componentType === 5120 ? Math.max(-1, value / 127) : Math.max(-1, value / 32767);
      return value;
    };
  });
  const parent = /* @__PURE__ */ new Map();
  nodes.forEach((node, i) => {
    for (const [key, length] of [["translation", 3], ["rotation", 4], ["scale", 3], ["matrix", 16]]) if (node[key]) requireModel(finite(node[key]) && node[key].length === length, "\u9AA8\u9ABC\u53D8\u6362\u5305\u542B\u65E0\u6548\u6570\u503C");
    requireModel(!node.matrix || !(node.translation || node.rotation || node.scale), "\u8282\u70B9\u4E0D\u80FD\u540C\u65F6\u5B9A\u4E49\u77E9\u9635\u548C\u5206\u91CF\u53D8\u6362");
    if (node.rotation) requireModel(Math.abs(node.rotation.reduce((sum, v) => sum + v * v, 0) - 1) < 0.03, "\u9AA8\u9ABC\u65CB\u8F6C\u56DB\u5143\u6570\u672A\u5F52\u4E00");
    for (const child of node.children ?? []) {
      ref(nodes, child, "\u5B50\u9AA8\u9ABC");
      requireModel(child !== i && !parent.has(child), "\u9AA8\u67B6\u5C42\u7EA7\u5FAA\u73AF\u6216\u4E00\u4E2A\u9AA8\u9ABC\u6709\u591A\u4E2A\u7236\u8282\u70B9");
      parent.set(child, i);
    }
    if (node.mesh !== void 0) ref(meshes, node.mesh, "\u7F51\u683C");
    if (node.skin !== void 0) ref(skins, node.skin, "\u8499\u76AE");
  });
  nodes.forEach((_, i) => {
    const chain = /* @__PURE__ */ new Set();
    for (let n = i; n !== void 0; n = parent.get(n)) {
      requireModel(!chain.has(n), "\u9AA8\u67B6\u5C42\u7EA7\u51FA\u73B0\u5FAA\u73AF");
      chain.add(n);
    }
  });
  for (const scene of json.scenes ?? []) for (const index of scene.nodes ?? []) {
    ref(nodes, index, "\u573A\u666F");
    requireModel(!parent.has(index), "\u573A\u666F\u6839\u8282\u70B9\u4E0D\u80FD\u6709\u7236\u8282\u70B9");
  }
  if (json.scene !== void 0) ref(json.scenes ?? [], json.scene, "\u9ED8\u8BA4\u573A\u666F");
  for (const skin of skins) {
    requireModel(Array.isArray(skin.joints) && skin.joints.length > 0 && skin.joints.length <= 1024 && new Set(skin.joints).size === skin.joints.length, "\u8499\u76AE\u9AA8\u9ABC\u5217\u8868\u65E0\u6548");
    for (const joint of skin.joints) ref(nodes, joint, "\u8499\u76AE\u9AA8\u9ABC");
    if (skin.skeleton !== void 0) ref(nodes, skin.skeleton, "\u9AA8\u67B6\u6839\u8282\u70B9");
    if (skin.inverseBindMatrices !== void 0) {
      const a = ref(accessors, skin.inverseBindMatrices, "\u7ED1\u5B9A\u77E9\u9635");
      requireModel(a.type === "MAT4" && a.componentType === 5126 && a.count === skin.joints.length, "\u7ED1\u5B9A\u77E9\u9635\u6570\u91CF\u4E0E\u9AA8\u9ABC\u6570\u91CF\u4E0D\u4E00\u81F4");
      for (let i = 0; i < a.count; i++) {
        const matrix = Array.from({ length: 16 }, (_, c) => readers[skin.inverseBindMatrices](i, c));
        requireModel(matrix.every(Number.isFinite) && Math.abs(determinant(matrix)) > 1e-12, "\u7ED1\u5B9A\u77E9\u9635\u5305\u542B\u65E0\u6548\u6570\u503C\u6216\u4E0D\u53EF\u9006");
      }
    }
  }
  let triangles = 0, vertices = 0;
  meshes.forEach((mesh) => {
    requireModel(Array.isArray(mesh.primitives) && mesh.primitives.length <= 256, "\u7F51\u683C\u7ED3\u6784\u65E0\u6548");
    for (const p of mesh.primitives) {
      const position = ref(accessors, p.attributes?.POSITION, "\u9876\u70B9\u4F4D\u7F6E");
      requireModel(position.type === "VEC3" && position.componentType === 5126, "\u9876\u70B9\u4F4D\u7F6E\u683C\u5F0F\u65E0\u6548");
      vertices += position.count;
      triangles += (p.indices !== void 0 ? ref(accessors, p.indices, "\u4E09\u89D2\u5F62").count : position.count) / 3;
      requireModel(vertices <= 1e6 && triangles <= 5e5, "\u6A21\u578B\u9762\u6570\u8FC7\u591A\uFF0C\u8BF7\u964D\u4F4E\u81F3 50 \u4E07\u9762\u4EE5\u5185");
      for (let i = 0; i < position.count; i++) for (let c = 0; c < 3; c++) requireModel(Number.isFinite(readers[p.attributes.POSITION](i, c)), "\u9876\u70B9\u4F4D\u7F6E\u5305\u542B\u65E0\u6548\u6570\u503C");
      for (const id of Object.values(p.attributes)) requireModel(ref(accessors, id, "\u9876\u70B9\u5C5E\u6027").count === position.count, "\u9876\u70B9\u5C5E\u6027\u6570\u91CF\u4E0D\u4E00\u81F4");
      if (p.indices !== void 0) {
        const a = accessors[p.indices];
        requireModel(a.type === "SCALAR" && [5121, 5123, 5125].includes(a.componentType), "\u4E09\u89D2\u5F62\u7D22\u5F15\u683C\u5F0F\u65E0\u6548");
        for (let i = 0; i < a.count; i++) requireModel(readers[p.indices](i) < position.count, "\u4E09\u89D2\u5F62\u9876\u70B9\u7D22\u5F15\u8D8A\u754C");
      }
      for (const target of p.targets ?? []) for (const id of Object.values(target)) requireModel(ref(accessors, id, "\u8868\u60C5\u9876\u70B9").count === position.count, "\u8868\u60C5\u9876\u70B9\u6570\u91CF\u4E0D\u4E00\u81F4");
    }
  });
  for (const node of nodes.filter((n) => n.skin !== void 0)) {
    requireModel(node.mesh !== void 0, "\u8499\u76AE\u7F3A\u5C11\u5173\u8054\u7F51\u683C");
    for (const p of meshes[node.mesh].primitives) {
      const sets = Object.keys(p.attributes).filter((k) => /^JOINTS_\d+$/.test(k));
      requireModel(sets.includes("JOINTS_0") && sets.length <= 2, "\u8499\u76AE\u7F3A\u5C11\u5173\u8282\u7D22\u5F15\u6216\u5F71\u54CD\u9AA8\u9ABC\u8FC7\u591A");
      for (const key of Object.keys(p.attributes).filter((k) => /^WEIGHTS_/.test(k))) requireModel(sets.includes(key.replace("WEIGHTS_", "JOINTS_")), "\u8499\u76AE\u6743\u91CD\u7F3A\u5C11\u5BF9\u5E94\u9AA8\u9ABC");
      const count = accessors[p.attributes.POSITION].count;
      const pairs = sets.map((key) => {
        const j = p.attributes[key], w = p.attributes[key.replace("JOINTS_", "WEIGHTS_")];
        const ja = ref(accessors, j, "\u8499\u76AE\u5173\u8282"), wa = ref(accessors, w, "\u8499\u76AE\u6743\u91CD");
        requireModel(ja.type === "VEC4" && [5121, 5123].includes(ja.componentType) && !ja.normalized && wa.type === "VEC4" && (wa.componentType === 5126 || [5121, 5123].includes(wa.componentType) && wa.normalized), "\u8499\u76AE\u5173\u8282\u6216\u6743\u91CD\u683C\u5F0F\u65E0\u6548");
        return [readers[j], readers[w]];
      });
      for (let i = 0; i < count; i++) {
        let total = 0;
        for (const [joint, weight] of pairs) for (let c = 0; c < 4; c++) {
          requireModel(joint(i, c) < skins[node.skin].joints.length, "\u9876\u70B9\u5173\u8282\u7D22\u5F15\u8D8A\u754C");
          const value = weight(i, c);
          requireModel(Number.isFinite(value) && value >= 0 && value <= 1.001, "\u8499\u76AE\u6743\u91CD\u65E0\u6548");
          total += value;
        }
        requireModel(Math.abs(total - 1) <= 0.03, "\u8499\u76AE\u6743\u91CD\u672A\u5F52\u4E00\uFF0C\u8BF7\u4FEE\u590D\u540E\u91CD\u65B0\u5BFC\u51FA");
      }
    }
  }
  const vrm1 = json.extensions?.VRMC_vrm, vrm0 = json.extensions?.VRM;
  requireModel(!(vrm1 && vrm0), "\u4E0D\u80FD\u540C\u65F6\u5305\u542B\u4E24\u4E2A\u7248\u672C\u7684 VRM \u4EBA\u5F62\u5B9A\u4E49");
  requireModel(!filename.toLowerCase().endsWith(".vrm") || vrm1 || vrm0, "\u6587\u4EF6\u6CA1\u6709 VRM \u4EBA\u5F62\u4FE1\u606F");
  let bones = {}, format = "GLB", meta = {};
  if (vrm1 || vrm0) {
    const vrm = vrm1 ?? vrm0;
    requireModel(vrm1 ? vrm.specVersion === "1.0" : ["0.0", "0"].includes(vrm.specVersion), "\u6682\u4E0D\u652F\u6301\u6B64 VRM \u7248\u672C");
    format = vrm1 ? "VRM 1.0" : "VRM 0.x";
    meta = vrm.meta ?? {};
    const map = vrm.humanoid?.humanBones;
    requireModel(map && (vrm1 ? !Array.isArray(map) : Array.isArray(map)), "VRM \u4EBA\u5F62\u6620\u5C04\u65E0\u6548");
    const entries = vrm1 ? Object.entries(map).map(([name, item]) => [name, item.node]) : map.map((item) => [item.bone, item.node]);
    requireModel(new Set(entries.map(([name]) => name)).size === entries.length && new Set(entries.map(([, node]) => node)).size === entries.length, "VRM \u4EBA\u5F62\u9AA8\u9ABC\u5B58\u5728\u91CD\u590D\u6620\u5C04");
    bones = Object.fromEntries(entries);
    for (const bone of requiredBones) requireModel(bones[bone] !== void 0, "\u7F3A\u5C11\u5FC5\u9700\u4EBA\u5F62\u9AA8\u9ABC\uFF1A" + bone);
    for (const [bone, index] of entries) {
      ref(nodes, index, "\u4EBA\u5F62\u9AA8\u9ABC " + bone);
      let ancestor = boneParents[bone];
      while (ancestor && bones[ancestor] === void 0) ancestor = boneParents[ancestor];
      if (ancestor) {
        let n = parent.get(index);
        while (n !== void 0 && n !== bones[ancestor]) n = parent.get(n);
        requireModel(n === bones[ancestor], "\u4EBA\u5F62\u9AA8\u9ABC\u7956\u5148\u5173\u7CFB\u9519\u8BEF\uFF1A" + bone + " \u2192 " + ancestor);
      }
    }
    requireModel(skins.length > 0, "VRM \u7F3A\u5C11\u8499\u76AE\u9AA8\u67B6");
  }
  for (const animation of animations) {
    for (const sampler of animation.samplers ?? []) {
      const input = ref(accessors, sampler.input, "\u52A8\u753B\u65F6\u95F4"), output = ref(accessors, sampler.output, "\u52A8\u753B\u6570\u636E");
      requireModel(input.type === "SCALAR" && input.componentType === 5126 && output.componentType === 5126, "\u52A8\u753B\u6570\u636E\u683C\u5F0F\u65E0\u6548");
      for (let i = 0; i < input.count; i++) requireModel(Number.isFinite(readers[sampler.input](i)) && (i === 0 ? readers[sampler.input](i) >= 0 : readers[sampler.input](i) > readers[sampler.input](i - 1)), "\u52A8\u753B\u65F6\u95F4\u5E8F\u5217\u65E0\u6548");
      for (let i = 0; i < output.count; i++) for (let c = 0; c < widths[output.type]; c++) requireModel(Number.isFinite(readers[sampler.output](i, c)), "\u52A8\u753B\u5305\u542B\u65E0\u6548\u6570\u503C");
    }
    for (const channel of animation.channels ?? []) {
      ref(animation.samplers ?? [], channel.sampler, "\u52A8\u753B\u91C7\u6837\u5668");
      ref(nodes, channel.target?.node, "\u52A8\u753B\u9AA8\u9ABC");
      requireModel(["translation", "rotation", "scale", "weights"].includes(channel.target.path), "\u52A8\u753B\u76EE\u6807\u5C5E\u6027\u65E0\u6548");
    }
  }
  let pixels = 0;
  for (const image of images) {
    requireModel(!image.uri && ["image/png", "image/jpeg"].includes(image.mimeType), "\u7EB9\u7406\u987B\u4EE5 PNG \u6216 JPEG \u5D4C\u5165\u6A21\u578B\u6587\u4EF6");
    const view = ref(bufferViews, image.bufferView, "\u7EB9\u7406"), data = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    let width = 0, height = 0;
    if (image.mimeType === "image/png") {
      requireModel(data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "PNG \u7EB9\u7406\u635F\u574F");
      width = data.readUInt32BE(16);
      height = data.readUInt32BE(20);
    } else {
      requireModel(data[0] === 255 && data[1] === 216, "JPEG \u7EB9\u7406\u635F\u574F");
      for (let o = 2; o + 4 < data.length; ) {
        requireModel(data[o] === 255, "JPEG \u7EB9\u7406\u6807\u8BB0\u65E0\u6548");
        const marker = data[o + 1];
        if (marker === 218 || marker === 217) break;
        if (marker === 255) {
          o++;
          continue;
        }
        const length = data.readUInt16BE(o + 2);
        requireModel(length >= 2 && o + 2 + length <= data.length, "JPEG \u7EB9\u7406\u4E0D\u5B8C\u6574");
        if ([192, 193, 194].includes(marker)) {
          requireModel(length >= 8, "JPEG \u5C3A\u5BF8\u65E0\u6548");
          height = data.readUInt16BE(o + 5);
          width = data.readUInt16BE(o + 7);
          break;
        }
        o += length + 2;
      }
    }
    requireModel(width > 0 && height > 0 && width <= 4096 && height <= 4096, "\u7EB9\u7406\u5C3A\u5BF8\u65E0\u6548\u6216\u8D85\u8FC7 4096 \u50CF\u7D20");
    pixels += width * height;
    requireModel(pixels <= 96e6, "\u7EB9\u7406\u603B\u91CF\u8FC7\u5927\uFF0C\u8BF7\u538B\u7F29\u8D34\u56FE");
  }
  const infoText = (value) => typeof value === "string" ? value.slice(0, 200) : "";
  return { format, rigged: skins.length > 0, human: Boolean(vrm1 || vrm0), boneCount: Object.keys(bones).length, joints: skins.reduce((n, s) => n + s.joints.length, 0), triangles: Math.ceil(triangles), animations: animations.length, texturePixels: pixels, bytes: bytes.length, version: createHash("sha256").update(bytes).digest("hex"), title: infoText(meta.name ?? meta.title), author: infoText(meta.authors?.join(", ") ?? meta.author), license: infoText(meta.licenseName ?? meta.licenseUrl) };
}

// ../../../../packages/harness-docket/node_modules/three/examples/jsm/libs/fflate.module.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var zls = function(d, dict) {
  if ((d[0] & 15) != 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31)
    err(6, "invalid zlib data");
  if ((d[1] >> 5 & 1) == +!dict)
    err(6, "invalid zlib data: " + (d[1] & 32 ? "need" : "unexpected") + " dictionary");
  return (d[1] >> 3 & 4) + 2;
};
var Inflate = /* @__PURE__ */ (function() {
  function Inflate2(opts, cb) {
    if (typeof opts == "function")
      cb = opts, opts = {};
    this.ondata = cb;
    var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
    this.s = { i: 0, b: dict ? dict.length : 0 };
    this.o = new u8(32768);
    this.p = new u8(0);
    if (dict)
      this.o.set(dict);
  }
  Inflate2.prototype.e = function(c) {
    if (!this.ondata)
      err(5);
    if (this.d)
      err(4);
    if (!this.p.length)
      this.p = c;
    else if (c.length) {
      var n = new u8(this.p.length + c.length);
      n.set(this.p), n.set(c, this.p.length), this.p = n;
    }
  };
  Inflate2.prototype.c = function(final) {
    this.s.i = +(this.d = final || false);
    var bts = this.s.b;
    var dt = inflt(this.p, this.s, this.o);
    this.ondata(slc(dt, bts, this.s.b), this.d);
    this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
    this.p = slc(this.p, this.s.p / 8 | 0), this.s.p &= 7;
  };
  Inflate2.prototype.push = function(chunk, final) {
    this.e(chunk), this.c(final);
  };
  return Inflate2;
})();
var Unzlib = /* @__PURE__ */ (function() {
  function Unzlib2(opts, cb) {
    Inflate.call(this, opts, cb);
    this.v = opts && opts.dictionary ? 2 : 1;
  }
  Unzlib2.prototype.push = function(chunk, final) {
    Inflate.prototype.e.call(this, chunk);
    if (this.v) {
      if (this.p.length < 6 && !final)
        return;
      this.p = this.p.subarray(zls(this.p, this.v - 1)), this.v = 0;
    }
    if (final) {
      if (this.p.length < 4)
        err(6, "invalid zlib data");
      this.p = this.p.subarray(0, -4);
    }
    Inflate.prototype.c.call(this, final);
  };
  return Unzlib2;
})();
function unzlibSync(data, opts) {
  return inflt(data.subarray(zls(data, opts && opts.dictionary), -4), { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}

// src/fbx-validation.js
var MAX_BYTES = 50 * 1024 ** 2;
var MAX_ARRAY_BYTES = 128 * 1024 ** 2;
function validateFbxEnvelope(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const fail = () => {
    throw new Error("FBX \u6570\u636E\u4E0D\u5B8C\u6574\u6216\u590D\u6742\u5EA6\u8D85\u8FC7\u9650\u5236\uFF0C\u8BF7\u7CBE\u7B80\u540E\u91CD\u65B0\u5BFC\u51FA");
  };
  if (bytes.length < 27 || bytes.length > MAX_BYTES) fail();
  const head = new TextDecoder().decode(bytes.subarray(0, 8192));
  if (!head.startsWith("Kaydara FBX Binary  \0\0")) {
    if (bytes.length > 8 * 1024 ** 2 || !/FBXHeaderExtension\s*:/.test(head)) fail();
    return [];
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const wide = view.getUint32(23, true) >= 7500, header = wide ? 25 : 13;
  const integer = (offset2) => {
    if (offset2 + (wide ? 8 : 4) > bytes.length) fail();
    const n = wide ? Number(view.getBigUint64(offset2, true)) : view.getUint32(offset2, true);
    if (!Number.isSafeInteger(n)) fail();
    return n;
  };
  const compressedArrays = [];
  let nodes = 0, allocation = 0;
  function node(offset2, depth) {
    if (depth > 64 || ++nodes > 5e4 || offset2 + header > bytes.length) fail();
    const end = integer(offset2), count = integer(offset2 + (wide ? 8 : 4)), length = integer(offset2 + (wide ? 16 : 8));
    if (!end) return { next: offset2 + header, terminal: true };
    const start = offset2 + header + bytes[offset2 + header - 1], propertyEnd = start + length;
    if (end <= offset2 || end > bytes.length || propertyEnd > end || count > 16384) fail();
    let cursor = start;
    for (let i = 0; i < count; i++) {
      if (cursor >= propertyEnd) fail();
      const type = String.fromCharCode(bytes[cursor++]);
      const scalar = { Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 }[type];
      if (scalar) cursor += scalar;
      else if (type === "S" || type === "R") {
        if (cursor + 4 > propertyEnd) fail();
        const size = view.getUint32(cursor, true);
        cursor += 4 + size;
      } else {
        const width = { f: 4, d: 8, l: 8, i: 4, b: 1, c: 1 }[type];
        if (!width || cursor + 12 > propertyEnd) fail();
        const elements = view.getUint32(cursor, true), encoding = view.getUint32(cursor + 4, true), compressed = view.getUint32(cursor + 8, true);
        allocation += elements * width;
        if (allocation > MAX_ARRAY_BYTES || elements > 16e6 || encoding > 1) fail();
        const payload = encoding ? compressed : elements * width;
        if (!encoding && compressed !== payload) fail();
        if (encoding) compressedArrays.push({ offset: cursor + 12, length: payload, bytes: elements * width });
        cursor += 12 + payload;
      }
      if (cursor > propertyEnd) fail();
    }
    if (cursor !== propertyEnd) fail();
    while (cursor < end) {
      const child = node(cursor, depth + 1);
      cursor = child.next;
      if (child.terminal) break;
    }
    if (cursor !== end) fail();
    return { next: end, terminal: false };
  }
  let offset = 27, top = 0;
  while (offset + header <= bytes.length) {
    const entry = node(offset, 0);
    offset = entry.next;
    if (entry.terminal) break;
    top++;
  }
  if (!top) fail();
  return compressedArrays;
}

// ../../../../packages/harness-docket/node_modules/three/build/three.module.js
var REVISION = "164";
var FrontSide = 0;
var BackSide = 1;
var NormalBlending = 1;
var AddEquation = 100;
var SrcAlphaFactor = 204;
var OneMinusSrcAlphaFactor = 205;
var LessEqualDepth = 3;
var MultiplyOperation = 0;
var AttachedBindMode = "attached";
var DetachedBindMode = "detached";
var UVMapping = 300;
var EquirectangularReflectionMapping = 303;
var RepeatWrapping = 1e3;
var ClampToEdgeWrapping = 1001;
var MirroredRepeatWrapping = 1002;
var NearestFilter = 1003;
var LinearFilter = 1006;
var LinearMipmapLinearFilter = 1008;
var UnsignedByteType = 1009;
var UnsignedIntType = 1014;
var FloatType = 1015;
var UnsignedInt248Type = 1020;
var RGBAFormat = 1023;
var DepthFormat = 1026;
var DepthStencilFormat = 1027;
var InterpolateDiscrete = 2300;
var InterpolateLinear = 2301;
var InterpolateSmooth = 2302;
var ZeroCurvatureEnding = 2400;
var ZeroSlopeEnding = 2401;
var WrapAroundEnding = 2402;
var NormalAnimationBlendMode = 2500;
var TangentSpaceNormalMap = 0;
var NoColorSpace = "";
var SRGBColorSpace = "srgb";
var LinearSRGBColorSpace = "srgb-linear";
var DisplayP3ColorSpace = "display-p3";
var LinearDisplayP3ColorSpace = "display-p3-linear";
var LinearTransfer = "linear";
var SRGBTransfer = "srgb";
var Rec709Primaries = "rec709";
var P3Primaries = "p3";
var KeepStencilOp = 7680;
var AlwaysStencilFunc = 519;
var LessEqualCompare = 515;
var StaticDrawUsage = 35044;
var WebGLCoordinateSystem = 2e3;
var WebGPUCoordinateSystem = 2001;
var EventDispatcher = class {
  addEventListener(type, listener) {
    if (this._listeners === void 0) this._listeners = {};
    const listeners = this._listeners;
    if (listeners[type] === void 0) {
      listeners[type] = [];
    }
    if (listeners[type].indexOf(listener) === -1) {
      listeners[type].push(listener);
    }
  }
  hasEventListener(type, listener) {
    if (this._listeners === void 0) return false;
    const listeners = this._listeners;
    return listeners[type] !== void 0 && listeners[type].indexOf(listener) !== -1;
  }
  removeEventListener(type, listener) {
    if (this._listeners === void 0) return;
    const listeners = this._listeners;
    const listenerArray = listeners[type];
    if (listenerArray !== void 0) {
      const index = listenerArray.indexOf(listener);
      if (index !== -1) {
        listenerArray.splice(index, 1);
      }
    }
  }
  dispatchEvent(event) {
    if (this._listeners === void 0) return;
    const listeners = this._listeners;
    const listenerArray = listeners[event.type];
    if (listenerArray !== void 0) {
      event.target = this;
      const array = listenerArray.slice(0);
      for (let i = 0, l = array.length; i < l; i++) {
        array[i].call(this, event);
      }
      event.target = null;
    }
  }
};
var _lut = ["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0a", "0b", "0c", "0d", "0e", "0f", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "1a", "1b", "1c", "1d", "1e", "1f", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2a", "2b", "2c", "2d", "2e", "2f", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "3a", "3b", "3c", "3d", "3e", "3f", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "4a", "4b", "4c", "4d", "4e", "4f", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "5a", "5b", "5c", "5d", "5e", "5f", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "6a", "6b", "6c", "6d", "6e", "6f", "70", "71", "72", "73", "74", "75", "76", "77", "78", "79", "7a", "7b", "7c", "7d", "7e", "7f", "80", "81", "82", "83", "84", "85", "86", "87", "88", "89", "8a", "8b", "8c", "8d", "8e", "8f", "90", "91", "92", "93", "94", "95", "96", "97", "98", "99", "9a", "9b", "9c", "9d", "9e", "9f", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "aa", "ab", "ac", "ad", "ae", "af", "b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "ba", "bb", "bc", "bd", "be", "bf", "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "ca", "cb", "cc", "cd", "ce", "cf", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "da", "db", "dc", "dd", "de", "df", "e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "ea", "eb", "ec", "ed", "ee", "ef", "f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "fa", "fb", "fc", "fd", "fe", "ff"];
var _seed = 1234567;
var DEG2RAD = Math.PI / 180;
var RAD2DEG = 180 / Math.PI;
function generateUUID() {
  const d0 = Math.random() * 4294967295 | 0;
  const d1 = Math.random() * 4294967295 | 0;
  const d2 = Math.random() * 4294967295 | 0;
  const d3 = Math.random() * 4294967295 | 0;
  const uuid = _lut[d0 & 255] + _lut[d0 >> 8 & 255] + _lut[d0 >> 16 & 255] + _lut[d0 >> 24 & 255] + "-" + _lut[d1 & 255] + _lut[d1 >> 8 & 255] + "-" + _lut[d1 >> 16 & 15 | 64] + _lut[d1 >> 24 & 255] + "-" + _lut[d2 & 63 | 128] + _lut[d2 >> 8 & 255] + "-" + _lut[d2 >> 16 & 255] + _lut[d2 >> 24 & 255] + _lut[d3 & 255] + _lut[d3 >> 8 & 255] + _lut[d3 >> 16 & 255] + _lut[d3 >> 24 & 255];
  return uuid.toLowerCase();
}
function clamp(value, min, max2) {
  return Math.max(min, Math.min(max2, value));
}
function euclideanModulo(n, m) {
  return (n % m + m) % m;
}
function mapLinear(x, a1, a2, b1, b2) {
  return b1 + (x - a1) * (b2 - b1) / (a2 - a1);
}
function inverseLerp(x, y, value) {
  if (x !== y) {
    return (value - x) / (y - x);
  } else {
    return 0;
  }
}
function lerp(x, y, t) {
  return (1 - t) * x + t * y;
}
function damp(x, y, lambda, dt) {
  return lerp(x, y, 1 - Math.exp(-lambda * dt));
}
function pingpong(x, length = 1) {
  return length - Math.abs(euclideanModulo(x, length * 2) - length);
}
function smoothstep(x, min, max2) {
  if (x <= min) return 0;
  if (x >= max2) return 1;
  x = (x - min) / (max2 - min);
  return x * x * (3 - 2 * x);
}
function smootherstep(x, min, max2) {
  if (x <= min) return 0;
  if (x >= max2) return 1;
  x = (x - min) / (max2 - min);
  return x * x * x * (x * (x * 6 - 15) + 10);
}
function randInt(low, high) {
  return low + Math.floor(Math.random() * (high - low + 1));
}
function randFloat(low, high) {
  return low + Math.random() * (high - low);
}
function randFloatSpread(range) {
  return range * (0.5 - Math.random());
}
function seededRandom(s) {
  if (s !== void 0) _seed = s;
  let t = _seed += 1831565813;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function degToRad(degrees) {
  return degrees * DEG2RAD;
}
function radToDeg(radians) {
  return radians * RAD2DEG;
}
function isPowerOfTwo(value) {
  return (value & value - 1) === 0 && value !== 0;
}
function ceilPowerOfTwo(value) {
  return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}
function floorPowerOfTwo(value) {
  return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
}
function setQuaternionFromProperEuler(q, a, b, c, order) {
  const cos = Math.cos;
  const sin = Math.sin;
  const c2 = cos(b / 2);
  const s2 = sin(b / 2);
  const c13 = cos((a + c) / 2);
  const s13 = sin((a + c) / 2);
  const c1_3 = cos((a - c) / 2);
  const s1_3 = sin((a - c) / 2);
  const c3_1 = cos((c - a) / 2);
  const s3_1 = sin((c - a) / 2);
  switch (order) {
    case "XYX":
      q.set(c2 * s13, s2 * c1_3, s2 * s1_3, c2 * c13);
      break;
    case "YZY":
      q.set(s2 * s1_3, c2 * s13, s2 * c1_3, c2 * c13);
      break;
    case "ZXZ":
      q.set(s2 * c1_3, s2 * s1_3, c2 * s13, c2 * c13);
      break;
    case "XZX":
      q.set(c2 * s13, s2 * s3_1, s2 * c3_1, c2 * c13);
      break;
    case "YXY":
      q.set(s2 * c3_1, c2 * s13, s2 * s3_1, c2 * c13);
      break;
    case "ZYZ":
      q.set(s2 * s3_1, s2 * c3_1, c2 * s13, c2 * c13);
      break;
    default:
      console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: " + order);
  }
}
function denormalize(value, array) {
  switch (array.constructor) {
    case Float32Array:
      return value;
    case Uint32Array:
      return value / 4294967295;
    case Uint16Array:
      return value / 65535;
    case Uint8Array:
      return value / 255;
    case Int32Array:
      return Math.max(value / 2147483647, -1);
    case Int16Array:
      return Math.max(value / 32767, -1);
    case Int8Array:
      return Math.max(value / 127, -1);
    default:
      throw new Error("Invalid component type.");
  }
}
function normalize(value, array) {
  switch (array.constructor) {
    case Float32Array:
      return value;
    case Uint32Array:
      return Math.round(value * 4294967295);
    case Uint16Array:
      return Math.round(value * 65535);
    case Uint8Array:
      return Math.round(value * 255);
    case Int32Array:
      return Math.round(value * 2147483647);
    case Int16Array:
      return Math.round(value * 32767);
    case Int8Array:
      return Math.round(value * 127);
    default:
      throw new Error("Invalid component type.");
  }
}
var MathUtils = {
  DEG2RAD,
  RAD2DEG,
  generateUUID,
  clamp,
  euclideanModulo,
  mapLinear,
  inverseLerp,
  lerp,
  damp,
  pingpong,
  smoothstep,
  smootherstep,
  randInt,
  randFloat,
  randFloatSpread,
  seededRandom,
  degToRad,
  radToDeg,
  isPowerOfTwo,
  ceilPowerOfTwo,
  floorPowerOfTwo,
  setQuaternionFromProperEuler,
  normalize,
  denormalize
};
var Vector2 = class _Vector2 {
  constructor(x = 0, y = 0) {
    _Vector2.prototype.isVector2 = true;
    this.x = x;
    this.y = y;
  }
  get width() {
    return this.x;
  }
  set width(value) {
    this.x = value;
  }
  get height() {
    return this.y;
  }
  set height(value) {
    this.y = value;
  }
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    return this;
  }
  setX(x) {
    this.x = x;
    return this;
  }
  setY(y) {
    this.y = y;
    return this;
  }
  setComponent(index, value) {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      default:
        throw new Error("index is out of range: " + index);
    }
    return this;
  }
  getComponent(index) {
    switch (index) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      default:
        throw new Error("index is out of range: " + index);
    }
  }
  clone() {
    return new this.constructor(this.x, this.y);
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }
  addScalar(s) {
    this.x += s;
    this.y += s;
    return this;
  }
  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    return this;
  }
  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }
  subScalar(s) {
    this.x -= s;
    this.y -= s;
    return this;
  }
  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    return this;
  }
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    return this;
  }
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    return this;
  }
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  applyMatrix3(m) {
    const x = this.x, y = this.y;
    const e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6];
    this.y = e[1] * x + e[4] * y + e[7];
    return this;
  }
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    return this;
  }
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    return this;
  }
  clamp(min, max2) {
    this.x = Math.max(min.x, Math.min(max2.x, this.x));
    this.y = Math.max(min.y, Math.min(max2.y, this.y));
    return this;
  }
  clampScalar(minVal, maxVal) {
    this.x = Math.max(minVal, Math.min(maxVal, this.x));
    this.y = Math.max(minVal, Math.min(maxVal, this.y));
    return this;
  }
  clampLength(min, max2) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max2, length)));
  }
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    return this;
  }
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    return this;
  }
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    return this;
  }
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    return this;
  }
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }
  dot(v) {
    return this.x * v.x + this.y * v.y;
  }
  cross(v) {
    return this.x * v.y - this.y * v.x;
  }
  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y);
  }
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  angle() {
    const angle = Math.atan2(-this.y, -this.x) + Math.PI;
    return angle;
  }
  angleTo(v) {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(clamp(theta, -1, 1));
  }
  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v));
  }
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y;
    return dx * dx + dy * dy;
  }
  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y);
  }
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    return this;
  }
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    return this;
  }
  equals(v) {
    return v.x === this.x && v.y === this.y;
  }
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    return this;
  }
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    return array;
  }
  fromBufferAttribute(attribute, index) {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    return this;
  }
  rotateAround(center, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const x = this.x - center.x;
    const y = this.y - center.y;
    this.x = x * c - y * s + center.x;
    this.y = x * s + y * c + center.y;
    return this;
  }
  random() {
    this.x = Math.random();
    this.y = Math.random();
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
  }
};
var Matrix3 = class _Matrix3 {
  constructor(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
    _Matrix3.prototype.isMatrix3 = true;
    this.elements = [
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1
    ];
    if (n11 !== void 0) {
      this.set(n11, n12, n13, n21, n22, n23, n31, n32, n33);
    }
  }
  set(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
    const te = this.elements;
    te[0] = n11;
    te[1] = n21;
    te[2] = n31;
    te[3] = n12;
    te[4] = n22;
    te[5] = n32;
    te[6] = n13;
    te[7] = n23;
    te[8] = n33;
    return this;
  }
  identity() {
    this.set(
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1
    );
    return this;
  }
  copy(m) {
    const te = this.elements;
    const me = m.elements;
    te[0] = me[0];
    te[1] = me[1];
    te[2] = me[2];
    te[3] = me[3];
    te[4] = me[4];
    te[5] = me[5];
    te[6] = me[6];
    te[7] = me[7];
    te[8] = me[8];
    return this;
  }
  extractBasis(xAxis, yAxis, zAxis) {
    xAxis.setFromMatrix3Column(this, 0);
    yAxis.setFromMatrix3Column(this, 1);
    zAxis.setFromMatrix3Column(this, 2);
    return this;
  }
  setFromMatrix4(m) {
    const me = m.elements;
    this.set(
      me[0],
      me[4],
      me[8],
      me[1],
      me[5],
      me[9],
      me[2],
      me[6],
      me[10]
    );
    return this;
  }
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  multiplyMatrices(a, b) {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;
    const a11 = ae[0], a12 = ae[3], a13 = ae[6];
    const a21 = ae[1], a22 = ae[4], a23 = ae[7];
    const a31 = ae[2], a32 = ae[5], a33 = ae[8];
    const b11 = be[0], b12 = be[3], b13 = be[6];
    const b21 = be[1], b22 = be[4], b23 = be[7];
    const b31 = be[2], b32 = be[5], b33 = be[8];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31;
    te[3] = a11 * b12 + a12 * b22 + a13 * b32;
    te[6] = a11 * b13 + a12 * b23 + a13 * b33;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31;
    te[4] = a21 * b12 + a22 * b22 + a23 * b32;
    te[7] = a21 * b13 + a22 * b23 + a23 * b33;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31;
    te[5] = a31 * b12 + a32 * b22 + a33 * b32;
    te[8] = a31 * b13 + a32 * b23 + a33 * b33;
    return this;
  }
  multiplyScalar(s) {
    const te = this.elements;
    te[0] *= s;
    te[3] *= s;
    te[6] *= s;
    te[1] *= s;
    te[4] *= s;
    te[7] *= s;
    te[2] *= s;
    te[5] *= s;
    te[8] *= s;
    return this;
  }
  determinant() {
    const te = this.elements;
    const a = te[0], b = te[1], c = te[2], d = te[3], e = te[4], f = te[5], g = te[6], h = te[7], i = te[8];
    return a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g;
  }
  invert() {
    const te = this.elements, n11 = te[0], n21 = te[1], n31 = te[2], n12 = te[3], n22 = te[4], n32 = te[5], n13 = te[6], n23 = te[7], n33 = te[8], t11 = n33 * n22 - n32 * n23, t12 = n32 * n13 - n33 * n12, t13 = n23 * n12 - n22 * n13, det = n11 * t11 + n21 * t12 + n31 * t13;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const detInv = 1 / det;
    te[0] = t11 * detInv;
    te[1] = (n31 * n23 - n33 * n21) * detInv;
    te[2] = (n32 * n21 - n31 * n22) * detInv;
    te[3] = t12 * detInv;
    te[4] = (n33 * n11 - n31 * n13) * detInv;
    te[5] = (n31 * n12 - n32 * n11) * detInv;
    te[6] = t13 * detInv;
    te[7] = (n21 * n13 - n23 * n11) * detInv;
    te[8] = (n22 * n11 - n21 * n12) * detInv;
    return this;
  }
  transpose() {
    let tmp;
    const m = this.elements;
    tmp = m[1];
    m[1] = m[3];
    m[3] = tmp;
    tmp = m[2];
    m[2] = m[6];
    m[6] = tmp;
    tmp = m[5];
    m[5] = m[7];
    m[7] = tmp;
    return this;
  }
  getNormalMatrix(matrix4) {
    return this.setFromMatrix4(matrix4).invert().transpose();
  }
  transposeIntoArray(r) {
    const m = this.elements;
    r[0] = m[0];
    r[1] = m[3];
    r[2] = m[6];
    r[3] = m[1];
    r[4] = m[4];
    r[5] = m[7];
    r[6] = m[2];
    r[7] = m[5];
    r[8] = m[8];
    return this;
  }
  setUvTransform(tx, ty, sx, sy, rotation, cx, cy) {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    this.set(
      sx * c,
      sx * s,
      -sx * (c * cx + s * cy) + cx + tx,
      -sy * s,
      sy * c,
      -sy * (-s * cx + c * cy) + cy + ty,
      0,
      0,
      1
    );
    return this;
  }
  //
  scale(sx, sy) {
    this.premultiply(_m3.makeScale(sx, sy));
    return this;
  }
  rotate(theta) {
    this.premultiply(_m3.makeRotation(-theta));
    return this;
  }
  translate(tx, ty) {
    this.premultiply(_m3.makeTranslation(tx, ty));
    return this;
  }
  // for 2D Transforms
  makeTranslation(x, y) {
    if (x.isVector2) {
      this.set(
        1,
        0,
        x.x,
        0,
        1,
        x.y,
        0,
        0,
        1
      );
    } else {
      this.set(
        1,
        0,
        x,
        0,
        1,
        y,
        0,
        0,
        1
      );
    }
    return this;
  }
  makeRotation(theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    this.set(
      c,
      -s,
      0,
      s,
      c,
      0,
      0,
      0,
      1
    );
    return this;
  }
  makeScale(x, y) {
    this.set(
      x,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      1
    );
    return this;
  }
  //
  equals(matrix) {
    const te = this.elements;
    const me = matrix.elements;
    for (let i = 0; i < 9; i++) {
      if (te[i] !== me[i]) return false;
    }
    return true;
  }
  fromArray(array, offset = 0) {
    for (let i = 0; i < 9; i++) {
      this.elements[i] = array[i + offset];
    }
    return this;
  }
  toArray(array = [], offset = 0) {
    const te = this.elements;
    array[offset] = te[0];
    array[offset + 1] = te[1];
    array[offset + 2] = te[2];
    array[offset + 3] = te[3];
    array[offset + 4] = te[4];
    array[offset + 5] = te[5];
    array[offset + 6] = te[6];
    array[offset + 7] = te[7];
    array[offset + 8] = te[8];
    return array;
  }
  clone() {
    return new this.constructor().fromArray(this.elements);
  }
};
var _m3 = /* @__PURE__ */ new Matrix3();
function arrayNeedsUint32(array) {
  for (let i = array.length - 1; i >= 0; --i) {
    if (array[i] >= 65535) return true;
  }
  return false;
}
function createElementNS(name) {
  return document.createElementNS("http://www.w3.org/1999/xhtml", name);
}
var _cache = {};
function warnOnce(message) {
  if (message in _cache) return;
  _cache[message] = true;
  console.warn(message);
}
var LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = /* @__PURE__ */ new Matrix3().set(
  0.8224621,
  0.177538,
  0,
  0.0331941,
  0.9668058,
  0,
  0.0170827,
  0.0723974,
  0.9105199
);
var LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = /* @__PURE__ */ new Matrix3().set(
  1.2249401,
  -0.2249404,
  0,
  -0.0420569,
  1.0420571,
  0,
  -0.0196376,
  -0.0786361,
  1.0982735
);
var COLOR_SPACES = {
  [LinearSRGBColorSpace]: {
    transfer: LinearTransfer,
    primaries: Rec709Primaries,
    toReference: (color) => color,
    fromReference: (color) => color
  },
  [SRGBColorSpace]: {
    transfer: SRGBTransfer,
    primaries: Rec709Primaries,
    toReference: (color) => color.convertSRGBToLinear(),
    fromReference: (color) => color.convertLinearToSRGB()
  },
  [LinearDisplayP3ColorSpace]: {
    transfer: LinearTransfer,
    primaries: P3Primaries,
    toReference: (color) => color.applyMatrix3(LINEAR_DISPLAY_P3_TO_LINEAR_SRGB),
    fromReference: (color) => color.applyMatrix3(LINEAR_SRGB_TO_LINEAR_DISPLAY_P3)
  },
  [DisplayP3ColorSpace]: {
    transfer: SRGBTransfer,
    primaries: P3Primaries,
    toReference: (color) => color.convertSRGBToLinear().applyMatrix3(LINEAR_DISPLAY_P3_TO_LINEAR_SRGB),
    fromReference: (color) => color.applyMatrix3(LINEAR_SRGB_TO_LINEAR_DISPLAY_P3).convertLinearToSRGB()
  }
};
var SUPPORTED_WORKING_COLOR_SPACES = /* @__PURE__ */ new Set([LinearSRGBColorSpace, LinearDisplayP3ColorSpace]);
var ColorManagement = {
  enabled: true,
  _workingColorSpace: LinearSRGBColorSpace,
  get workingColorSpace() {
    return this._workingColorSpace;
  },
  set workingColorSpace(colorSpace) {
    if (!SUPPORTED_WORKING_COLOR_SPACES.has(colorSpace)) {
      throw new Error(`Unsupported working color space, "${colorSpace}".`);
    }
    this._workingColorSpace = colorSpace;
  },
  convert: function(color, sourceColorSpace, targetColorSpace) {
    if (this.enabled === false || sourceColorSpace === targetColorSpace || !sourceColorSpace || !targetColorSpace) {
      return color;
    }
    const sourceToReference = COLOR_SPACES[sourceColorSpace].toReference;
    const targetFromReference = COLOR_SPACES[targetColorSpace].fromReference;
    return targetFromReference(sourceToReference(color));
  },
  fromWorkingColorSpace: function(color, targetColorSpace) {
    return this.convert(color, this._workingColorSpace, targetColorSpace);
  },
  toWorkingColorSpace: function(color, sourceColorSpace) {
    return this.convert(color, sourceColorSpace, this._workingColorSpace);
  },
  getPrimaries: function(colorSpace) {
    return COLOR_SPACES[colorSpace].primaries;
  },
  getTransfer: function(colorSpace) {
    if (colorSpace === NoColorSpace) return LinearTransfer;
    return COLOR_SPACES[colorSpace].transfer;
  }
};
function SRGBToLinear(c) {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}
function LinearToSRGB(c) {
  return c < 31308e-7 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055;
}
var _canvas;
var ImageUtils = class {
  static getDataURL(image) {
    if (/^data:/i.test(image.src)) {
      return image.src;
    }
    if (typeof HTMLCanvasElement === "undefined") {
      return image.src;
    }
    let canvas;
    if (image instanceof HTMLCanvasElement) {
      canvas = image;
    } else {
      if (_canvas === void 0) _canvas = createElementNS("canvas");
      _canvas.width = image.width;
      _canvas.height = image.height;
      const context = _canvas.getContext("2d");
      if (image instanceof ImageData) {
        context.putImageData(image, 0, 0);
      } else {
        context.drawImage(image, 0, 0, image.width, image.height);
      }
      canvas = _canvas;
    }
    if (canvas.width > 2048 || canvas.height > 2048) {
      console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons", image);
      return canvas.toDataURL("image/jpeg", 0.6);
    } else {
      return canvas.toDataURL("image/png");
    }
  }
  static sRGBToLinear(image) {
    if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement || typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement || typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      const canvas = createElementNS("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, image.width, image.height);
      const imageData = context.getImageData(0, 0, image.width, image.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i++) {
        data[i] = SRGBToLinear(data[i] / 255) * 255;
      }
      context.putImageData(imageData, 0, 0);
      return canvas;
    } else if (image.data) {
      const data = image.data.slice(0);
      for (let i = 0; i < data.length; i++) {
        if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
          data[i] = Math.floor(SRGBToLinear(data[i] / 255) * 255);
        } else {
          data[i] = SRGBToLinear(data[i]);
        }
      }
      return {
        data,
        width: image.width,
        height: image.height
      };
    } else {
      console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.");
      return image;
    }
  }
};
var _sourceId = 0;
var Source = class {
  constructor(data = null) {
    this.isSource = true;
    Object.defineProperty(this, "id", { value: _sourceId++ });
    this.uuid = generateUUID();
    this.data = data;
    this.dataReady = true;
    this.version = 0;
  }
  set needsUpdate(value) {
    if (value === true) this.version++;
  }
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (!isRootObject && meta.images[this.uuid] !== void 0) {
      return meta.images[this.uuid];
    }
    const output = {
      uuid: this.uuid,
      url: ""
    };
    const data = this.data;
    if (data !== null) {
      let url;
      if (Array.isArray(data)) {
        url = [];
        for (let i = 0, l = data.length; i < l; i++) {
          if (data[i].isDataTexture) {
            url.push(serializeImage(data[i].image));
          } else {
            url.push(serializeImage(data[i]));
          }
        }
      } else {
        url = serializeImage(data);
      }
      output.url = url;
    }
    if (!isRootObject) {
      meta.images[this.uuid] = output;
    }
    return output;
  }
};
function serializeImage(image) {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement || typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement || typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return ImageUtils.getDataURL(image);
  } else {
    if (image.data) {
      return {
        data: Array.from(image.data),
        width: image.width,
        height: image.height,
        type: image.data.constructor.name
      };
    } else {
      console.warn("THREE.Texture: Unable to serialize Texture.");
      return {};
    }
  }
}
var _textureId = 0;
var Texture = class _Texture extends EventDispatcher {
  constructor(image = _Texture.DEFAULT_IMAGE, mapping = _Texture.DEFAULT_MAPPING, wrapS = ClampToEdgeWrapping, wrapT = ClampToEdgeWrapping, magFilter = LinearFilter, minFilter = LinearMipmapLinearFilter, format = RGBAFormat, type = UnsignedByteType, anisotropy = _Texture.DEFAULT_ANISOTROPY, colorSpace = NoColorSpace) {
    super();
    this.isTexture = true;
    Object.defineProperty(this, "id", { value: _textureId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.source = new Source(image);
    this.mipmaps = [];
    this.mapping = mapping;
    this.channel = 0;
    this.wrapS = wrapS;
    this.wrapT = wrapT;
    this.magFilter = magFilter;
    this.minFilter = minFilter;
    this.anisotropy = anisotropy;
    this.format = format;
    this.internalFormat = null;
    this.type = type;
    this.offset = new Vector2(0, 0);
    this.repeat = new Vector2(1, 1);
    this.center = new Vector2(0, 0);
    this.rotation = 0;
    this.matrixAutoUpdate = true;
    this.matrix = new Matrix3();
    this.generateMipmaps = true;
    this.premultiplyAlpha = false;
    this.flipY = true;
    this.unpackAlignment = 4;
    this.colorSpace = colorSpace;
    this.userData = {};
    this.version = 0;
    this.onUpdate = null;
    this.isRenderTargetTexture = false;
    this.pmremVersion = 0;
  }
  get image() {
    return this.source.data;
  }
  set image(value = null) {
    this.source.data = value;
  }
  updateMatrix() {
    this.matrix.setUvTransform(this.offset.x, this.offset.y, this.repeat.x, this.repeat.y, this.rotation, this.center.x, this.center.y);
  }
  clone() {
    return new this.constructor().copy(this);
  }
  copy(source) {
    this.name = source.name;
    this.source = source.source;
    this.mipmaps = source.mipmaps.slice(0);
    this.mapping = source.mapping;
    this.channel = source.channel;
    this.wrapS = source.wrapS;
    this.wrapT = source.wrapT;
    this.magFilter = source.magFilter;
    this.minFilter = source.minFilter;
    this.anisotropy = source.anisotropy;
    this.format = source.format;
    this.internalFormat = source.internalFormat;
    this.type = source.type;
    this.offset.copy(source.offset);
    this.repeat.copy(source.repeat);
    this.center.copy(source.center);
    this.rotation = source.rotation;
    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrix.copy(source.matrix);
    this.generateMipmaps = source.generateMipmaps;
    this.premultiplyAlpha = source.premultiplyAlpha;
    this.flipY = source.flipY;
    this.unpackAlignment = source.unpackAlignment;
    this.colorSpace = source.colorSpace;
    this.userData = JSON.parse(JSON.stringify(source.userData));
    this.needsUpdate = true;
    return this;
  }
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (!isRootObject && meta.textures[this.uuid] !== void 0) {
      return meta.textures[this.uuid];
    }
    const output = {
      metadata: {
        version: 4.6,
        type: "Texture",
        generator: "Texture.toJSON"
      },
      uuid: this.uuid,
      name: this.name,
      image: this.source.toJSON(meta).uuid,
      mapping: this.mapping,
      channel: this.channel,
      repeat: [this.repeat.x, this.repeat.y],
      offset: [this.offset.x, this.offset.y],
      center: [this.center.x, this.center.y],
      rotation: this.rotation,
      wrap: [this.wrapS, this.wrapT],
      format: this.format,
      internalFormat: this.internalFormat,
      type: this.type,
      colorSpace: this.colorSpace,
      minFilter: this.minFilter,
      magFilter: this.magFilter,
      anisotropy: this.anisotropy,
      flipY: this.flipY,
      generateMipmaps: this.generateMipmaps,
      premultiplyAlpha: this.premultiplyAlpha,
      unpackAlignment: this.unpackAlignment
    };
    if (Object.keys(this.userData).length > 0) output.userData = this.userData;
    if (!isRootObject) {
      meta.textures[this.uuid] = output;
    }
    return output;
  }
  dispose() {
    this.dispatchEvent({ type: "dispose" });
  }
  transformUv(uv) {
    if (this.mapping !== UVMapping) return uv;
    uv.applyMatrix3(this.matrix);
    if (uv.x < 0 || uv.x > 1) {
      switch (this.wrapS) {
        case RepeatWrapping:
          uv.x = uv.x - Math.floor(uv.x);
          break;
        case ClampToEdgeWrapping:
          uv.x = uv.x < 0 ? 0 : 1;
          break;
        case MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.x) % 2) === 1) {
            uv.x = Math.ceil(uv.x) - uv.x;
          } else {
            uv.x = uv.x - Math.floor(uv.x);
          }
          break;
      }
    }
    if (uv.y < 0 || uv.y > 1) {
      switch (this.wrapT) {
        case RepeatWrapping:
          uv.y = uv.y - Math.floor(uv.y);
          break;
        case ClampToEdgeWrapping:
          uv.y = uv.y < 0 ? 0 : 1;
          break;
        case MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.y) % 2) === 1) {
            uv.y = Math.ceil(uv.y) - uv.y;
          } else {
            uv.y = uv.y - Math.floor(uv.y);
          }
          break;
      }
    }
    if (this.flipY) {
      uv.y = 1 - uv.y;
    }
    return uv;
  }
  set needsUpdate(value) {
    if (value === true) {
      this.version++;
      this.source.needsUpdate = true;
    }
  }
  set needsPMREMUpdate(value) {
    if (value === true) {
      this.pmremVersion++;
    }
  }
};
Texture.DEFAULT_IMAGE = null;
Texture.DEFAULT_MAPPING = UVMapping;
Texture.DEFAULT_ANISOTROPY = 1;
var Vector4 = class _Vector4 {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    _Vector4.prototype.isVector4 = true;
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  get width() {
    return this.z;
  }
  set width(value) {
    this.z = value;
  }
  get height() {
    return this.w;
  }
  set height(value) {
    this.w = value;
  }
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    this.w = scalar;
    return this;
  }
  setX(x) {
    this.x = x;
    return this;
  }
  setY(y) {
    this.y = y;
    return this;
  }
  setZ(z) {
    this.z = z;
    return this;
  }
  setW(w) {
    this.w = w;
    return this;
  }
  setComponent(index, value) {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      case 2:
        this.z = value;
        break;
      case 3:
        this.w = value;
        break;
      default:
        throw new Error("index is out of range: " + index);
    }
    return this;
  }
  getComponent(index) {
    switch (index) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      case 3:
        return this.w;
      default:
        throw new Error("index is out of range: " + index);
    }
  }
  clone() {
    return new this.constructor(this.x, this.y, this.z, this.w);
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    this.w = v.w !== void 0 ? v.w : 1;
    return this;
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    this.w += v.w;
    return this;
  }
  addScalar(s) {
    this.x += s;
    this.y += s;
    this.z += s;
    this.w += s;
    return this;
  }
  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    this.w = a.w + b.w;
    return this;
  }
  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    this.w += v.w * s;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    this.w -= v.w;
    return this;
  }
  subScalar(s) {
    this.x -= s;
    this.y -= s;
    this.z -= s;
    this.w -= s;
    return this;
  }
  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    this.w = a.w - b.w;
    return this;
  }
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    this.w *= v.w;
    return this;
  }
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    this.w *= scalar;
    return this;
  }
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    const e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8] * z + e[12] * w;
    this.y = e[1] * x + e[5] * y + e[9] * z + e[13] * w;
    this.z = e[2] * x + e[6] * y + e[10] * z + e[14] * w;
    this.w = e[3] * x + e[7] * y + e[11] * z + e[15] * w;
    return this;
  }
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  setAxisAngleFromQuaternion(q) {
    this.w = 2 * Math.acos(q.w);
    const s = Math.sqrt(1 - q.w * q.w);
    if (s < 1e-4) {
      this.x = 1;
      this.y = 0;
      this.z = 0;
    } else {
      this.x = q.x / s;
      this.y = q.y / s;
      this.z = q.z / s;
    }
    return this;
  }
  setAxisAngleFromRotationMatrix(m) {
    let angle, x, y, z;
    const epsilon = 0.01, epsilon2 = 0.1, te = m.elements, m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10];
    if (Math.abs(m12 - m21) < epsilon && Math.abs(m13 - m31) < epsilon && Math.abs(m23 - m32) < epsilon) {
      if (Math.abs(m12 + m21) < epsilon2 && Math.abs(m13 + m31) < epsilon2 && Math.abs(m23 + m32) < epsilon2 && Math.abs(m11 + m22 + m33 - 3) < epsilon2) {
        this.set(1, 0, 0, 0);
        return this;
      }
      angle = Math.PI;
      const xx = (m11 + 1) / 2;
      const yy = (m22 + 1) / 2;
      const zz = (m33 + 1) / 2;
      const xy = (m12 + m21) / 4;
      const xz = (m13 + m31) / 4;
      const yz = (m23 + m32) / 4;
      if (xx > yy && xx > zz) {
        if (xx < epsilon) {
          x = 0;
          y = 0.707106781;
          z = 0.707106781;
        } else {
          x = Math.sqrt(xx);
          y = xy / x;
          z = xz / x;
        }
      } else if (yy > zz) {
        if (yy < epsilon) {
          x = 0.707106781;
          y = 0;
          z = 0.707106781;
        } else {
          y = Math.sqrt(yy);
          x = xy / y;
          z = yz / y;
        }
      } else {
        if (zz < epsilon) {
          x = 0.707106781;
          y = 0.707106781;
          z = 0;
        } else {
          z = Math.sqrt(zz);
          x = xz / z;
          y = yz / z;
        }
      }
      this.set(x, y, z, angle);
      return this;
    }
    let s = Math.sqrt((m32 - m23) * (m32 - m23) + (m13 - m31) * (m13 - m31) + (m21 - m12) * (m21 - m12));
    if (Math.abs(s) < 1e-3) s = 1;
    this.x = (m32 - m23) / s;
    this.y = (m13 - m31) / s;
    this.z = (m21 - m12) / s;
    this.w = Math.acos((m11 + m22 + m33 - 1) / 2);
    return this;
  }
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    this.w = Math.min(this.w, v.w);
    return this;
  }
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    this.w = Math.max(this.w, v.w);
    return this;
  }
  clamp(min, max2) {
    this.x = Math.max(min.x, Math.min(max2.x, this.x));
    this.y = Math.max(min.y, Math.min(max2.y, this.y));
    this.z = Math.max(min.z, Math.min(max2.z, this.z));
    this.w = Math.max(min.w, Math.min(max2.w, this.w));
    return this;
  }
  clampScalar(minVal, maxVal) {
    this.x = Math.max(minVal, Math.min(maxVal, this.x));
    this.y = Math.max(minVal, Math.min(maxVal, this.y));
    this.z = Math.max(minVal, Math.min(maxVal, this.z));
    this.w = Math.max(minVal, Math.min(maxVal, this.w));
    return this;
  }
  clampLength(min, max2) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max2, length)));
  }
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    this.w = Math.floor(this.w);
    return this;
  }
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    this.w = Math.ceil(this.w);
    return this;
  }
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    this.w = Math.round(this.w);
    return this;
  }
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    this.z = Math.trunc(this.z);
    this.w = Math.trunc(this.w);
    return this;
  }
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    this.w = -this.w;
    return this;
  }
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
  }
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
  }
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.w);
  }
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    this.w += (v.w - this.w) * alpha;
    return this;
  }
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    this.w = v1.w + (v2.w - v1.w) * alpha;
    return this;
  }
  equals(v) {
    return v.x === this.x && v.y === this.y && v.z === this.z && v.w === this.w;
  }
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    this.w = array[offset + 3];
    return this;
  }
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    array[offset + 3] = this.w;
    return array;
  }
  fromBufferAttribute(attribute, index) {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    this.w = attribute.getW(index);
    return this;
  }
  random() {
    this.x = Math.random();
    this.y = Math.random();
    this.z = Math.random();
    this.w = Math.random();
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
    yield this.w;
  }
};
var Quaternion = class {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.isQuaternion = true;
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
  }
  static slerpFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1, t) {
    let x0 = src0[srcOffset0 + 0], y0 = src0[srcOffset0 + 1], z0 = src0[srcOffset0 + 2], w0 = src0[srcOffset0 + 3];
    const x1 = src1[srcOffset1 + 0], y1 = src1[srcOffset1 + 1], z1 = src1[srcOffset1 + 2], w1 = src1[srcOffset1 + 3];
    if (t === 0) {
      dst[dstOffset + 0] = x0;
      dst[dstOffset + 1] = y0;
      dst[dstOffset + 2] = z0;
      dst[dstOffset + 3] = w0;
      return;
    }
    if (t === 1) {
      dst[dstOffset + 0] = x1;
      dst[dstOffset + 1] = y1;
      dst[dstOffset + 2] = z1;
      dst[dstOffset + 3] = w1;
      return;
    }
    if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
      let s = 1 - t;
      const cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1, dir = cos >= 0 ? 1 : -1, sqrSin = 1 - cos * cos;
      if (sqrSin > Number.EPSILON) {
        const sin = Math.sqrt(sqrSin), len = Math.atan2(sin, cos * dir);
        s = Math.sin(s * len) / sin;
        t = Math.sin(t * len) / sin;
      }
      const tDir = t * dir;
      x0 = x0 * s + x1 * tDir;
      y0 = y0 * s + y1 * tDir;
      z0 = z0 * s + z1 * tDir;
      w0 = w0 * s + w1 * tDir;
      if (s === 1 - t) {
        const f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
        x0 *= f;
        y0 *= f;
        z0 *= f;
        w0 *= f;
      }
    }
    dst[dstOffset] = x0;
    dst[dstOffset + 1] = y0;
    dst[dstOffset + 2] = z0;
    dst[dstOffset + 3] = w0;
  }
  static multiplyQuaternionsFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1) {
    const x0 = src0[srcOffset0];
    const y0 = src0[srcOffset0 + 1];
    const z0 = src0[srcOffset0 + 2];
    const w0 = src0[srcOffset0 + 3];
    const x1 = src1[srcOffset1];
    const y1 = src1[srcOffset1 + 1];
    const z1 = src1[srcOffset1 + 2];
    const w1 = src1[srcOffset1 + 3];
    dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1;
    dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1;
    dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1;
    dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1;
    return dst;
  }
  get x() {
    return this._x;
  }
  set x(value) {
    this._x = value;
    this._onChangeCallback();
  }
  get y() {
    return this._y;
  }
  set y(value) {
    this._y = value;
    this._onChangeCallback();
  }
  get z() {
    return this._z;
  }
  set z(value) {
    this._z = value;
    this._onChangeCallback();
  }
  get w() {
    return this._w;
  }
  set w(value) {
    this._w = value;
    this._onChangeCallback();
  }
  set(x, y, z, w) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this._onChangeCallback();
    return this;
  }
  clone() {
    return new this.constructor(this._x, this._y, this._z, this._w);
  }
  copy(quaternion) {
    this._x = quaternion.x;
    this._y = quaternion.y;
    this._z = quaternion.z;
    this._w = quaternion.w;
    this._onChangeCallback();
    return this;
  }
  setFromEuler(euler, update = true) {
    const x = euler._x, y = euler._y, z = euler._z, order = euler._order;
    const cos = Math.cos;
    const sin = Math.sin;
    const c1 = cos(x / 2);
    const c2 = cos(y / 2);
    const c3 = cos(z / 2);
    const s1 = sin(x / 2);
    const s2 = sin(y / 2);
    const s3 = sin(z / 2);
    switch (order) {
      case "XYZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "YXZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "ZXY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "ZYX":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "YZX":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "XZY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      default:
        console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: " + order);
    }
    if (update === true) this._onChangeCallback();
    return this;
  }
  setFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2, s = Math.sin(halfAngle);
    this._x = axis.x * s;
    this._y = axis.y * s;
    this._z = axis.z * s;
    this._w = Math.cos(halfAngle);
    this._onChangeCallback();
    return this;
  }
  setFromRotationMatrix(m) {
    const te = m.elements, m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10], trace = m11 + m22 + m33;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      this._w = 0.25 / s;
      this._x = (m32 - m23) * s;
      this._y = (m13 - m31) * s;
      this._z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      this._w = (m32 - m23) / s;
      this._x = 0.25 * s;
      this._y = (m12 + m21) / s;
      this._z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      this._w = (m13 - m31) / s;
      this._x = (m12 + m21) / s;
      this._y = 0.25 * s;
      this._z = (m23 + m32) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
      this._w = (m21 - m12) / s;
      this._x = (m13 + m31) / s;
      this._y = (m23 + m32) / s;
      this._z = 0.25 * s;
    }
    this._onChangeCallback();
    return this;
  }
  setFromUnitVectors(vFrom, vTo) {
    let r = vFrom.dot(vTo) + 1;
    if (r < Number.EPSILON) {
      r = 0;
      if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
        this._x = -vFrom.y;
        this._y = vFrom.x;
        this._z = 0;
        this._w = r;
      } else {
        this._x = 0;
        this._y = -vFrom.z;
        this._z = vFrom.y;
        this._w = r;
      }
    } else {
      this._x = vFrom.y * vTo.z - vFrom.z * vTo.y;
      this._y = vFrom.z * vTo.x - vFrom.x * vTo.z;
      this._z = vFrom.x * vTo.y - vFrom.y * vTo.x;
      this._w = r;
    }
    return this.normalize();
  }
  angleTo(q) {
    return 2 * Math.acos(Math.abs(clamp(this.dot(q), -1, 1)));
  }
  rotateTowards(q, step) {
    const angle = this.angleTo(q);
    if (angle === 0) return this;
    const t = Math.min(1, step / angle);
    this.slerp(q, t);
    return this;
  }
  identity() {
    return this.set(0, 0, 0, 1);
  }
  invert() {
    return this.conjugate();
  }
  conjugate() {
    this._x *= -1;
    this._y *= -1;
    this._z *= -1;
    this._onChangeCallback();
    return this;
  }
  dot(v) {
    return this._x * v._x + this._y * v._y + this._z * v._z + this._w * v._w;
  }
  lengthSq() {
    return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
  }
  length() {
    return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
  }
  normalize() {
    let l = this.length();
    if (l === 0) {
      this._x = 0;
      this._y = 0;
      this._z = 0;
      this._w = 1;
    } else {
      l = 1 / l;
      this._x = this._x * l;
      this._y = this._y * l;
      this._z = this._z * l;
      this._w = this._w * l;
    }
    this._onChangeCallback();
    return this;
  }
  multiply(q) {
    return this.multiplyQuaternions(this, q);
  }
  premultiply(q) {
    return this.multiplyQuaternions(q, this);
  }
  multiplyQuaternions(a, b) {
    const qax = a._x, qay = a._y, qaz = a._z, qaw = a._w;
    const qbx = b._x, qby = b._y, qbz = b._z, qbw = b._w;
    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    this._onChangeCallback();
    return this;
  }
  slerp(qb, t) {
    if (t === 0) return this;
    if (t === 1) return this.copy(qb);
    const x = this._x, y = this._y, z = this._z, w = this._w;
    let cosHalfTheta = w * qb._w + x * qb._x + y * qb._y + z * qb._z;
    if (cosHalfTheta < 0) {
      this._w = -qb._w;
      this._x = -qb._x;
      this._y = -qb._y;
      this._z = -qb._z;
      cosHalfTheta = -cosHalfTheta;
    } else {
      this.copy(qb);
    }
    if (cosHalfTheta >= 1) {
      this._w = w;
      this._x = x;
      this._y = y;
      this._z = z;
      return this;
    }
    const sqrSinHalfTheta = 1 - cosHalfTheta * cosHalfTheta;
    if (sqrSinHalfTheta <= Number.EPSILON) {
      const s = 1 - t;
      this._w = s * w + t * this._w;
      this._x = s * x + t * this._x;
      this._y = s * y + t * this._y;
      this._z = s * z + t * this._z;
      this.normalize();
      return this;
    }
    const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta, ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
    this._w = w * ratioA + this._w * ratioB;
    this._x = x * ratioA + this._x * ratioB;
    this._y = y * ratioA + this._y * ratioB;
    this._z = z * ratioA + this._z * ratioB;
    this._onChangeCallback();
    return this;
  }
  slerpQuaternions(qa, qb, t) {
    return this.copy(qa).slerp(qb, t);
  }
  random() {
    const theta1 = 2 * Math.PI * Math.random();
    const theta2 = 2 * Math.PI * Math.random();
    const x0 = Math.random();
    const r1 = Math.sqrt(1 - x0);
    const r2 = Math.sqrt(x0);
    return this.set(
      r1 * Math.sin(theta1),
      r1 * Math.cos(theta1),
      r2 * Math.sin(theta2),
      r2 * Math.cos(theta2)
    );
  }
  equals(quaternion) {
    return quaternion._x === this._x && quaternion._y === this._y && quaternion._z === this._z && quaternion._w === this._w;
  }
  fromArray(array, offset = 0) {
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    this._w = array[offset + 3];
    this._onChangeCallback();
    return this;
  }
  toArray(array = [], offset = 0) {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._w;
    return array;
  }
  fromBufferAttribute(attribute, index) {
    this._x = attribute.getX(index);
    this._y = attribute.getY(index);
    this._z = attribute.getZ(index);
    this._w = attribute.getW(index);
    this._onChangeCallback();
    return this;
  }
  toJSON() {
    return this.toArray();
  }
  _onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }
  _onChangeCallback() {
  }
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._w;
  }
};
var Vector3 = class _Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    _Vector3.prototype.isVector3 = true;
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    if (z === void 0) z = this.z;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    return this;
  }
  setX(x) {
    this.x = x;
    return this;
  }
  setY(y) {
    this.y = y;
    return this;
  }
  setZ(z) {
    this.z = z;
    return this;
  }
  setComponent(index, value) {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      case 2:
        this.z = value;
        break;
      default:
        throw new Error("index is out of range: " + index);
    }
    return this;
  }
  getComponent(index) {
    switch (index) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      default:
        throw new Error("index is out of range: " + index);
    }
  }
  clone() {
    return new this.constructor(this.x, this.y, this.z);
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  addScalar(s) {
    this.x += s;
    this.y += s;
    this.z += s;
    return this;
  }
  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }
  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  subScalar(s) {
    this.x -= s;
    this.y -= s;
    this.z -= s;
    return this;
  }
  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }
  multiplyVectors(a, b) {
    this.x = a.x * b.x;
    this.y = a.y * b.y;
    this.z = a.z * b.z;
    return this;
  }
  applyEuler(euler) {
    return this.applyQuaternion(_quaternion$4.setFromEuler(euler));
  }
  applyAxisAngle(axis, angle) {
    return this.applyQuaternion(_quaternion$4.setFromAxisAngle(axis, angle));
  }
  applyMatrix3(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6] * z;
    this.y = e[1] * x + e[4] * y + e[7] * z;
    this.z = e[2] * x + e[5] * y + e[8] * z;
    return this;
  }
  applyNormalMatrix(m) {
    return this.applyMatrix3(m).normalize();
  }
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
  applyQuaternion(q) {
    const vx = this.x, vy = this.y, vz = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    this.x = vx + qw * tx + qy * tz - qz * ty;
    this.y = vy + qw * ty + qz * tx - qx * tz;
    this.z = vz + qw * tz + qx * ty - qy * tx;
    return this;
  }
  project(camera) {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  }
  unproject(camera) {
    return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
  }
  transformDirection(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8] * z;
    this.y = e[1] * x + e[5] * y + e[9] * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;
    return this.normalize();
  }
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    return this;
  }
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }
  clamp(min, max2) {
    this.x = Math.max(min.x, Math.min(max2.x, this.x));
    this.y = Math.max(min.y, Math.min(max2.y, this.y));
    this.z = Math.max(min.z, Math.min(max2.z, this.z));
    return this;
  }
  clampScalar(minVal, maxVal) {
    this.x = Math.max(minVal, Math.min(maxVal, this.x));
    this.y = Math.max(minVal, Math.min(maxVal, this.y));
    this.z = Math.max(minVal, Math.min(maxVal, this.z));
    return this;
  }
  clampLength(min, max2) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max2, length)));
  }
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    return this;
  }
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    return this;
  }
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    return this;
  }
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    this.z = Math.trunc(this.z);
    return this;
  }
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  // TODO lengthSquared?
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
  }
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    return this;
  }
  cross(v) {
    return this.crossVectors(this, v);
  }
  crossVectors(a, b) {
    const ax = a.x, ay = a.y, az = a.z;
    const bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }
  projectOnVector(v) {
    const denominator = v.lengthSq();
    if (denominator === 0) return this.set(0, 0, 0);
    const scalar = v.dot(this) / denominator;
    return this.copy(v).multiplyScalar(scalar);
  }
  projectOnPlane(planeNormal) {
    _vector$c.copy(this).projectOnVector(planeNormal);
    return this.sub(_vector$c);
  }
  reflect(normal) {
    return this.sub(_vector$c.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }
  angleTo(v) {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(clamp(theta, -1, 1));
  }
  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v));
  }
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }
  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
  }
  setFromSpherical(s) {
    return this.setFromSphericalCoords(s.radius, s.phi, s.theta);
  }
  setFromSphericalCoords(radius, phi, theta) {
    const sinPhiRadius = Math.sin(phi) * radius;
    this.x = sinPhiRadius * Math.sin(theta);
    this.y = Math.cos(phi) * radius;
    this.z = sinPhiRadius * Math.cos(theta);
    return this;
  }
  setFromCylindrical(c) {
    return this.setFromCylindricalCoords(c.radius, c.theta, c.y);
  }
  setFromCylindricalCoords(radius, theta, y) {
    this.x = radius * Math.sin(theta);
    this.y = y;
    this.z = radius * Math.cos(theta);
    return this;
  }
  setFromMatrixPosition(m) {
    const e = m.elements;
    this.x = e[12];
    this.y = e[13];
    this.z = e[14];
    return this;
  }
  setFromMatrixScale(m) {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    this.x = sx;
    this.y = sy;
    this.z = sz;
    return this;
  }
  setFromMatrixColumn(m, index) {
    return this.fromArray(m.elements, index * 4);
  }
  setFromMatrix3Column(m, index) {
    return this.fromArray(m.elements, index * 3);
  }
  setFromEuler(e) {
    this.x = e._x;
    this.y = e._y;
    this.z = e._z;
    return this;
  }
  setFromColor(c) {
    this.x = c.r;
    this.y = c.g;
    this.z = c.b;
    return this;
  }
  equals(v) {
    return v.x === this.x && v.y === this.y && v.z === this.z;
  }
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    return array;
  }
  fromBufferAttribute(attribute, index) {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    return this;
  }
  random() {
    this.x = Math.random();
    this.y = Math.random();
    this.z = Math.random();
    return this;
  }
  randomDirection() {
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const c = Math.sqrt(1 - u * u);
    this.x = c * Math.cos(theta);
    this.y = u;
    this.z = c * Math.sin(theta);
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
  }
};
var _vector$c = /* @__PURE__ */ new Vector3();
var _quaternion$4 = /* @__PURE__ */ new Quaternion();
var Box3 = class {
  constructor(min = new Vector3(Infinity, Infinity, Infinity), max2 = new Vector3(-Infinity, -Infinity, -Infinity)) {
    this.isBox3 = true;
    this.min = min;
    this.max = max2;
  }
  set(min, max2) {
    this.min.copy(min);
    this.max.copy(max2);
    return this;
  }
  setFromArray(array) {
    this.makeEmpty();
    for (let i = 0, il = array.length; i < il; i += 3) {
      this.expandByPoint(_vector$b.fromArray(array, i));
    }
    return this;
  }
  setFromBufferAttribute(attribute) {
    this.makeEmpty();
    for (let i = 0, il = attribute.count; i < il; i++) {
      this.expandByPoint(_vector$b.fromBufferAttribute(attribute, i));
    }
    return this;
  }
  setFromPoints(points) {
    this.makeEmpty();
    for (let i = 0, il = points.length; i < il; i++) {
      this.expandByPoint(points[i]);
    }
    return this;
  }
  setFromCenterAndSize(center, size) {
    const halfSize = _vector$b.copy(size).multiplyScalar(0.5);
    this.min.copy(center).sub(halfSize);
    this.max.copy(center).add(halfSize);
    return this;
  }
  setFromObject(object, precise = false) {
    this.makeEmpty();
    return this.expandByObject(object, precise);
  }
  clone() {
    return new this.constructor().copy(this);
  }
  copy(box) {
    this.min.copy(box.min);
    this.max.copy(box.max);
    return this;
  }
  makeEmpty() {
    this.min.x = this.min.y = this.min.z = Infinity;
    this.max.x = this.max.y = this.max.z = -Infinity;
    return this;
  }
  isEmpty() {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }
  getCenter(target) {
    return this.isEmpty() ? target.set(0, 0, 0) : target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }
  getSize(target) {
    return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min);
  }
  expandByPoint(point) {
    this.min.min(point);
    this.max.max(point);
    return this;
  }
  expandByVector(vector) {
    this.min.sub(vector);
    this.max.add(vector);
    return this;
  }
  expandByScalar(scalar) {
    this.min.addScalar(-scalar);
    this.max.addScalar(scalar);
    return this;
  }
  expandByObject(object, precise = false) {
    object.updateWorldMatrix(false, false);
    const geometry = object.geometry;
    if (geometry !== void 0) {
      const positionAttribute = geometry.getAttribute("position");
      if (precise === true && positionAttribute !== void 0 && object.isInstancedMesh !== true) {
        for (let i = 0, l = positionAttribute.count; i < l; i++) {
          if (object.isMesh === true) {
            object.getVertexPosition(i, _vector$b);
          } else {
            _vector$b.fromBufferAttribute(positionAttribute, i);
          }
          _vector$b.applyMatrix4(object.matrixWorld);
          this.expandByPoint(_vector$b);
        }
      } else {
        if (object.boundingBox !== void 0) {
          if (object.boundingBox === null) {
            object.computeBoundingBox();
          }
          _box$4.copy(object.boundingBox);
        } else {
          if (geometry.boundingBox === null) {
            geometry.computeBoundingBox();
          }
          _box$4.copy(geometry.boundingBox);
        }
        _box$4.applyMatrix4(object.matrixWorld);
        this.union(_box$4);
      }
    }
    const children = object.children;
    for (let i = 0, l = children.length; i < l; i++) {
      this.expandByObject(children[i], precise);
    }
    return this;
  }
  containsPoint(point) {
    return point.x < this.min.x || point.x > this.max.x || point.y < this.min.y || point.y > this.max.y || point.z < this.min.z || point.z > this.max.z ? false : true;
  }
  containsBox(box) {
    return this.min.x <= box.min.x && box.max.x <= this.max.x && this.min.y <= box.min.y && box.max.y <= this.max.y && this.min.z <= box.min.z && box.max.z <= this.max.z;
  }
  getParameter(point, target) {
    return target.set(
      (point.x - this.min.x) / (this.max.x - this.min.x),
      (point.y - this.min.y) / (this.max.y - this.min.y),
      (point.z - this.min.z) / (this.max.z - this.min.z)
    );
  }
  intersectsBox(box) {
    return box.max.x < this.min.x || box.min.x > this.max.x || box.max.y < this.min.y || box.min.y > this.max.y || box.max.z < this.min.z || box.min.z > this.max.z ? false : true;
  }
  intersectsSphere(sphere) {
    this.clampPoint(sphere.center, _vector$b);
    return _vector$b.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }
  intersectsPlane(plane) {
    let min, max2;
    if (plane.normal.x > 0) {
      min = plane.normal.x * this.min.x;
      max2 = plane.normal.x * this.max.x;
    } else {
      min = plane.normal.x * this.max.x;
      max2 = plane.normal.x * this.min.x;
    }
    if (plane.normal.y > 0) {
      min += plane.normal.y * this.min.y;
      max2 += plane.normal.y * this.max.y;
    } else {
      min += plane.normal.y * this.max.y;
      max2 += plane.normal.y * this.min.y;
    }
    if (plane.normal.z > 0) {
      min += plane.normal.z * this.min.z;
      max2 += plane.normal.z * this.max.z;
    } else {
      min += plane.normal.z * this.max.z;
      max2 += plane.normal.z * this.min.z;
    }
    return min <= -plane.constant && max2 >= -plane.constant;
  }
  intersectsTriangle(triangle) {
    if (this.isEmpty()) {
      return false;
    }
    this.getCenter(_center);
    _extents.subVectors(this.max, _center);
    _v0$2.subVectors(triangle.a, _center);
    _v1$7.subVectors(triangle.b, _center);
    _v2$4.subVectors(triangle.c, _center);
    _f0.subVectors(_v1$7, _v0$2);
    _f1.subVectors(_v2$4, _v1$7);
    _f2.subVectors(_v0$2, _v2$4);
    let axes = [
      0,
      -_f0.z,
      _f0.y,
      0,
      -_f1.z,
      _f1.y,
      0,
      -_f2.z,
      _f2.y,
      _f0.z,
      0,
      -_f0.x,
      _f1.z,
      0,
      -_f1.x,
      _f2.z,
      0,
      -_f2.x,
      -_f0.y,
      _f0.x,
      0,
      -_f1.y,
      _f1.x,
      0,
      -_f2.y,
      _f2.x,
      0
    ];
    if (!satForAxes(axes, _v0$2, _v1$7, _v2$4, _extents)) {
      return false;
    }
    axes = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (!satForAxes(axes, _v0$2, _v1$7, _v2$4, _extents)) {
      return false;
    }
    _triangleNormal.crossVectors(_f0, _f1);
    axes = [_triangleNormal.x, _triangleNormal.y, _triangleNormal.z];
    return satForAxes(axes, _v0$2, _v1$7, _v2$4, _extents);
  }
  clampPoint(point, target) {
    return target.copy(point).clamp(this.min, this.max);
  }
  distanceToPoint(point) {
    return this.clampPoint(point, _vector$b).distanceTo(point);
  }
  getBoundingSphere(target) {
    if (this.isEmpty()) {
      target.makeEmpty();
    } else {
      this.getCenter(target.center);
      target.radius = this.getSize(_vector$b).length() * 0.5;
    }
    return target;
  }
  intersect(box) {
    this.min.max(box.min);
    this.max.min(box.max);
    if (this.isEmpty()) this.makeEmpty();
    return this;
  }
  union(box) {
    this.min.min(box.min);
    this.max.max(box.max);
    return this;
  }
  applyMatrix4(matrix) {
    if (this.isEmpty()) return this;
    _points[0].set(this.min.x, this.min.y, this.min.z).applyMatrix4(matrix);
    _points[1].set(this.min.x, this.min.y, this.max.z).applyMatrix4(matrix);
    _points[2].set(this.min.x, this.max.y, this.min.z).applyMatrix4(matrix);
    _points[3].set(this.min.x, this.max.y, this.max.z).applyMatrix4(matrix);
    _points[4].set(this.max.x, this.min.y, this.min.z).applyMatrix4(matrix);
    _points[5].set(this.max.x, this.min.y, this.max.z).applyMatrix4(matrix);
    _points[6].set(this.max.x, this.max.y, this.min.z).applyMatrix4(matrix);
    _points[7].set(this.max.x, this.max.y, this.max.z).applyMatrix4(matrix);
    this.setFromPoints(_points);
    return this;
  }
  translate(offset) {
    this.min.add(offset);
    this.max.add(offset);
    return this;
  }
  equals(box) {
    return box.min.equals(this.min) && box.max.equals(this.max);
  }
};
var _points = [
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3()
];
var _vector$b = /* @__PURE__ */ new Vector3();
var _box$4 = /* @__PURE__ */ new Box3();
var _v0$2 = /* @__PURE__ */ new Vector3();
var _v1$7 = /* @__PURE__ */ new Vector3();
var _v2$4 = /* @__PURE__ */ new Vector3();
var _f0 = /* @__PURE__ */ new Vector3();
var _f1 = /* @__PURE__ */ new Vector3();
var _f2 = /* @__PURE__ */ new Vector3();
var _center = /* @__PURE__ */ new Vector3();
var _extents = /* @__PURE__ */ new Vector3();
var _triangleNormal = /* @__PURE__ */ new Vector3();
var _testAxis = /* @__PURE__ */ new Vector3();
function satForAxes(axes, v0, v1, v2, extents) {
  for (let i = 0, j = axes.length - 3; i <= j; i += 3) {
    _testAxis.fromArray(axes, i);
    const r = extents.x * Math.abs(_testAxis.x) + extents.y * Math.abs(_testAxis.y) + extents.z * Math.abs(_testAxis.z);
    const p0 = v0.dot(_testAxis);
    const p1 = v1.dot(_testAxis);
    const p2 = v2.dot(_testAxis);
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > r) {
      return false;
    }
  }
  return true;
}
var _box$3 = /* @__PURE__ */ new Box3();
var _v1$6 = /* @__PURE__ */ new Vector3();
var _v2$3 = /* @__PURE__ */ new Vector3();
var Sphere = class {
  constructor(center = new Vector3(), radius = -1) {
    this.isSphere = true;
    this.center = center;
    this.radius = radius;
  }
  set(center, radius) {
    this.center.copy(center);
    this.radius = radius;
    return this;
  }
  setFromPoints(points, optionalCenter) {
    const center = this.center;
    if (optionalCenter !== void 0) {
      center.copy(optionalCenter);
    } else {
      _box$3.setFromPoints(points).getCenter(center);
    }
    let maxRadiusSq = 0;
    for (let i = 0, il = points.length; i < il; i++) {
      maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(points[i]));
    }
    this.radius = Math.sqrt(maxRadiusSq);
    return this;
  }
  copy(sphere) {
    this.center.copy(sphere.center);
    this.radius = sphere.radius;
    return this;
  }
  isEmpty() {
    return this.radius < 0;
  }
  makeEmpty() {
    this.center.set(0, 0, 0);
    this.radius = -1;
    return this;
  }
  containsPoint(point) {
    return point.distanceToSquared(this.center) <= this.radius * this.radius;
  }
  distanceToPoint(point) {
    return point.distanceTo(this.center) - this.radius;
  }
  intersectsSphere(sphere) {
    const radiusSum = this.radius + sphere.radius;
    return sphere.center.distanceToSquared(this.center) <= radiusSum * radiusSum;
  }
  intersectsBox(box) {
    return box.intersectsSphere(this);
  }
  intersectsPlane(plane) {
    return Math.abs(plane.distanceToPoint(this.center)) <= this.radius;
  }
  clampPoint(point, target) {
    const deltaLengthSq = this.center.distanceToSquared(point);
    target.copy(point);
    if (deltaLengthSq > this.radius * this.radius) {
      target.sub(this.center).normalize();
      target.multiplyScalar(this.radius).add(this.center);
    }
    return target;
  }
  getBoundingBox(target) {
    if (this.isEmpty()) {
      target.makeEmpty();
      return target;
    }
    target.set(this.center, this.center);
    target.expandByScalar(this.radius);
    return target;
  }
  applyMatrix4(matrix) {
    this.center.applyMatrix4(matrix);
    this.radius = this.radius * matrix.getMaxScaleOnAxis();
    return this;
  }
  translate(offset) {
    this.center.add(offset);
    return this;
  }
  expandByPoint(point) {
    if (this.isEmpty()) {
      this.center.copy(point);
      this.radius = 0;
      return this;
    }
    _v1$6.subVectors(point, this.center);
    const lengthSq = _v1$6.lengthSq();
    if (lengthSq > this.radius * this.radius) {
      const length = Math.sqrt(lengthSq);
      const delta = (length - this.radius) * 0.5;
      this.center.addScaledVector(_v1$6, delta / length);
      this.radius += delta;
    }
    return this;
  }
  union(sphere) {
    if (sphere.isEmpty()) {
      return this;
    }
    if (this.isEmpty()) {
      this.copy(sphere);
      return this;
    }
    if (this.center.equals(sphere.center) === true) {
      this.radius = Math.max(this.radius, sphere.radius);
    } else {
      _v2$3.subVectors(sphere.center, this.center).setLength(sphere.radius);
      this.expandByPoint(_v1$6.copy(sphere.center).add(_v2$3));
      this.expandByPoint(_v1$6.copy(sphere.center).sub(_v2$3));
    }
    return this;
  }
  equals(sphere) {
    return sphere.center.equals(this.center) && sphere.radius === this.radius;
  }
  clone() {
    return new this.constructor().copy(this);
  }
};
var _vector$a = /* @__PURE__ */ new Vector3();
var _segCenter = /* @__PURE__ */ new Vector3();
var _segDir = /* @__PURE__ */ new Vector3();
var _diff = /* @__PURE__ */ new Vector3();
var _edge1 = /* @__PURE__ */ new Vector3();
var _edge2 = /* @__PURE__ */ new Vector3();
var _normal$1 = /* @__PURE__ */ new Vector3();
var Ray = class {
  constructor(origin = new Vector3(), direction = new Vector3(0, 0, -1)) {
    this.origin = origin;
    this.direction = direction;
  }
  set(origin, direction) {
    this.origin.copy(origin);
    this.direction.copy(direction);
    return this;
  }
  copy(ray) {
    this.origin.copy(ray.origin);
    this.direction.copy(ray.direction);
    return this;
  }
  at(t, target) {
    return target.copy(this.origin).addScaledVector(this.direction, t);
  }
  lookAt(v) {
    this.direction.copy(v).sub(this.origin).normalize();
    return this;
  }
  recast(t) {
    this.origin.copy(this.at(t, _vector$a));
    return this;
  }
  closestPointToPoint(point, target) {
    target.subVectors(point, this.origin);
    const directionDistance = target.dot(this.direction);
    if (directionDistance < 0) {
      return target.copy(this.origin);
    }
    return target.copy(this.origin).addScaledVector(this.direction, directionDistance);
  }
  distanceToPoint(point) {
    return Math.sqrt(this.distanceSqToPoint(point));
  }
  distanceSqToPoint(point) {
    const directionDistance = _vector$a.subVectors(point, this.origin).dot(this.direction);
    if (directionDistance < 0) {
      return this.origin.distanceToSquared(point);
    }
    _vector$a.copy(this.origin).addScaledVector(this.direction, directionDistance);
    return _vector$a.distanceToSquared(point);
  }
  distanceSqToSegment(v0, v1, optionalPointOnRay, optionalPointOnSegment) {
    _segCenter.copy(v0).add(v1).multiplyScalar(0.5);
    _segDir.copy(v1).sub(v0).normalize();
    _diff.copy(this.origin).sub(_segCenter);
    const segExtent = v0.distanceTo(v1) * 0.5;
    const a01 = -this.direction.dot(_segDir);
    const b0 = _diff.dot(this.direction);
    const b1 = -_diff.dot(_segDir);
    const c = _diff.lengthSq();
    const det = Math.abs(1 - a01 * a01);
    let s0, s1, sqrDist, extDet;
    if (det > 0) {
      s0 = a01 * b1 - b0;
      s1 = a01 * b0 - b1;
      extDet = segExtent * det;
      if (s0 >= 0) {
        if (s1 >= -extDet) {
          if (s1 <= extDet) {
            const invDet = 1 / det;
            s0 *= invDet;
            s1 *= invDet;
            sqrDist = s0 * (s0 + a01 * s1 + 2 * b0) + s1 * (a01 * s0 + s1 + 2 * b1) + c;
          } else {
            s1 = segExtent;
            s0 = Math.max(0, -(a01 * s1 + b0));
            sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
          }
        } else {
          s1 = -segExtent;
          s0 = Math.max(0, -(a01 * s1 + b0));
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
        }
      } else {
        if (s1 <= -extDet) {
          s0 = Math.max(0, -(-a01 * segExtent + b0));
          s1 = s0 > 0 ? -segExtent : Math.min(Math.max(-segExtent, -b1), segExtent);
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
        } else if (s1 <= extDet) {
          s0 = 0;
          s1 = Math.min(Math.max(-segExtent, -b1), segExtent);
          sqrDist = s1 * (s1 + 2 * b1) + c;
        } else {
          s0 = Math.max(0, -(a01 * segExtent + b0));
          s1 = s0 > 0 ? segExtent : Math.min(Math.max(-segExtent, -b1), segExtent);
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
        }
      }
    } else {
      s1 = a01 > 0 ? -segExtent : segExtent;
      s0 = Math.max(0, -(a01 * s1 + b0));
      sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
    }
    if (optionalPointOnRay) {
      optionalPointOnRay.copy(this.origin).addScaledVector(this.direction, s0);
    }
    if (optionalPointOnSegment) {
      optionalPointOnSegment.copy(_segCenter).addScaledVector(_segDir, s1);
    }
    return sqrDist;
  }
  intersectSphere(sphere, target) {
    _vector$a.subVectors(sphere.center, this.origin);
    const tca = _vector$a.dot(this.direction);
    const d2 = _vector$a.dot(_vector$a) - tca * tca;
    const radius2 = sphere.radius * sphere.radius;
    if (d2 > radius2) return null;
    const thc = Math.sqrt(radius2 - d2);
    const t0 = tca - thc;
    const t1 = tca + thc;
    if (t1 < 0) return null;
    if (t0 < 0) return this.at(t1, target);
    return this.at(t0, target);
  }
  intersectsSphere(sphere) {
    return this.distanceSqToPoint(sphere.center) <= sphere.radius * sphere.radius;
  }
  distanceToPlane(plane) {
    const denominator = plane.normal.dot(this.direction);
    if (denominator === 0) {
      if (plane.distanceToPoint(this.origin) === 0) {
        return 0;
      }
      return null;
    }
    const t = -(this.origin.dot(plane.normal) + plane.constant) / denominator;
    return t >= 0 ? t : null;
  }
  intersectPlane(plane, target) {
    const t = this.distanceToPlane(plane);
    if (t === null) {
      return null;
    }
    return this.at(t, target);
  }
  intersectsPlane(plane) {
    const distToPoint = plane.distanceToPoint(this.origin);
    if (distToPoint === 0) {
      return true;
    }
    const denominator = plane.normal.dot(this.direction);
    if (denominator * distToPoint < 0) {
      return true;
    }
    return false;
  }
  intersectBox(box, target) {
    let tmin, tmax, tymin, tymax, tzmin, tzmax;
    const invdirx = 1 / this.direction.x, invdiry = 1 / this.direction.y, invdirz = 1 / this.direction.z;
    const origin = this.origin;
    if (invdirx >= 0) {
      tmin = (box.min.x - origin.x) * invdirx;
      tmax = (box.max.x - origin.x) * invdirx;
    } else {
      tmin = (box.max.x - origin.x) * invdirx;
      tmax = (box.min.x - origin.x) * invdirx;
    }
    if (invdiry >= 0) {
      tymin = (box.min.y - origin.y) * invdiry;
      tymax = (box.max.y - origin.y) * invdiry;
    } else {
      tymin = (box.max.y - origin.y) * invdiry;
      tymax = (box.min.y - origin.y) * invdiry;
    }
    if (tmin > tymax || tymin > tmax) return null;
    if (tymin > tmin || isNaN(tmin)) tmin = tymin;
    if (tymax < tmax || isNaN(tmax)) tmax = tymax;
    if (invdirz >= 0) {
      tzmin = (box.min.z - origin.z) * invdirz;
      tzmax = (box.max.z - origin.z) * invdirz;
    } else {
      tzmin = (box.max.z - origin.z) * invdirz;
      tzmax = (box.min.z - origin.z) * invdirz;
    }
    if (tmin > tzmax || tzmin > tmax) return null;
    if (tzmin > tmin || tmin !== tmin) tmin = tzmin;
    if (tzmax < tmax || tmax !== tmax) tmax = tzmax;
    if (tmax < 0) return null;
    return this.at(tmin >= 0 ? tmin : tmax, target);
  }
  intersectsBox(box) {
    return this.intersectBox(box, _vector$a) !== null;
  }
  intersectTriangle(a, b, c, backfaceCulling, target) {
    _edge1.subVectors(b, a);
    _edge2.subVectors(c, a);
    _normal$1.crossVectors(_edge1, _edge2);
    let DdN = this.direction.dot(_normal$1);
    let sign2;
    if (DdN > 0) {
      if (backfaceCulling) return null;
      sign2 = 1;
    } else if (DdN < 0) {
      sign2 = -1;
      DdN = -DdN;
    } else {
      return null;
    }
    _diff.subVectors(this.origin, a);
    const DdQxE2 = sign2 * this.direction.dot(_edge2.crossVectors(_diff, _edge2));
    if (DdQxE2 < 0) {
      return null;
    }
    const DdE1xQ = sign2 * this.direction.dot(_edge1.cross(_diff));
    if (DdE1xQ < 0) {
      return null;
    }
    if (DdQxE2 + DdE1xQ > DdN) {
      return null;
    }
    const QdN = -sign2 * _diff.dot(_normal$1);
    if (QdN < 0) {
      return null;
    }
    return this.at(QdN / DdN, target);
  }
  applyMatrix4(matrix4) {
    this.origin.applyMatrix4(matrix4);
    this.direction.transformDirection(matrix4);
    return this;
  }
  equals(ray) {
    return ray.origin.equals(this.origin) && ray.direction.equals(this.direction);
  }
  clone() {
    return new this.constructor().copy(this);
  }
};
var Matrix4 = class _Matrix4 {
  constructor(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    _Matrix4.prototype.isMatrix4 = true;
    this.elements = [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    ];
    if (n11 !== void 0) {
      this.set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44);
    }
  }
  set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    const te = this.elements;
    te[0] = n11;
    te[4] = n12;
    te[8] = n13;
    te[12] = n14;
    te[1] = n21;
    te[5] = n22;
    te[9] = n23;
    te[13] = n24;
    te[2] = n31;
    te[6] = n32;
    te[10] = n33;
    te[14] = n34;
    te[3] = n41;
    te[7] = n42;
    te[11] = n43;
    te[15] = n44;
    return this;
  }
  identity() {
    this.set(
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  clone() {
    return new _Matrix4().fromArray(this.elements);
  }
  copy(m) {
    const te = this.elements;
    const me = m.elements;
    te[0] = me[0];
    te[1] = me[1];
    te[2] = me[2];
    te[3] = me[3];
    te[4] = me[4];
    te[5] = me[5];
    te[6] = me[6];
    te[7] = me[7];
    te[8] = me[8];
    te[9] = me[9];
    te[10] = me[10];
    te[11] = me[11];
    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];
    te[15] = me[15];
    return this;
  }
  copyPosition(m) {
    const te = this.elements, me = m.elements;
    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];
    return this;
  }
  setFromMatrix3(m) {
    const me = m.elements;
    this.set(
      me[0],
      me[3],
      me[6],
      0,
      me[1],
      me[4],
      me[7],
      0,
      me[2],
      me[5],
      me[8],
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  extractBasis(xAxis, yAxis, zAxis) {
    xAxis.setFromMatrixColumn(this, 0);
    yAxis.setFromMatrixColumn(this, 1);
    zAxis.setFromMatrixColumn(this, 2);
    return this;
  }
  makeBasis(xAxis, yAxis, zAxis) {
    this.set(
      xAxis.x,
      yAxis.x,
      zAxis.x,
      0,
      xAxis.y,
      yAxis.y,
      zAxis.y,
      0,
      xAxis.z,
      yAxis.z,
      zAxis.z,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  extractRotation(m) {
    const te = this.elements;
    const me = m.elements;
    const scaleX = 1 / _v1$5.setFromMatrixColumn(m, 0).length();
    const scaleY = 1 / _v1$5.setFromMatrixColumn(m, 1).length();
    const scaleZ = 1 / _v1$5.setFromMatrixColumn(m, 2).length();
    te[0] = me[0] * scaleX;
    te[1] = me[1] * scaleX;
    te[2] = me[2] * scaleX;
    te[3] = 0;
    te[4] = me[4] * scaleY;
    te[5] = me[5] * scaleY;
    te[6] = me[6] * scaleY;
    te[7] = 0;
    te[8] = me[8] * scaleZ;
    te[9] = me[9] * scaleZ;
    te[10] = me[10] * scaleZ;
    te[11] = 0;
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }
  makeRotationFromEuler(euler) {
    const te = this.elements;
    const x = euler.x, y = euler.y, z = euler.z;
    const a = Math.cos(x), b = Math.sin(x);
    const c = Math.cos(y), d = Math.sin(y);
    const e = Math.cos(z), f = Math.sin(z);
    if (euler.order === "XYZ") {
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      te[0] = c * e;
      te[4] = -c * f;
      te[8] = d;
      te[1] = af + be * d;
      te[5] = ae - bf * d;
      te[9] = -b * c;
      te[2] = bf - ae * d;
      te[6] = be + af * d;
      te[10] = a * c;
    } else if (euler.order === "YXZ") {
      const ce = c * e, cf = c * f, de = d * e, df = d * f;
      te[0] = ce + df * b;
      te[4] = de * b - cf;
      te[8] = a * d;
      te[1] = a * f;
      te[5] = a * e;
      te[9] = -b;
      te[2] = cf * b - de;
      te[6] = df + ce * b;
      te[10] = a * c;
    } else if (euler.order === "ZXY") {
      const ce = c * e, cf = c * f, de = d * e, df = d * f;
      te[0] = ce - df * b;
      te[4] = -a * f;
      te[8] = de + cf * b;
      te[1] = cf + de * b;
      te[5] = a * e;
      te[9] = df - ce * b;
      te[2] = -a * d;
      te[6] = b;
      te[10] = a * c;
    } else if (euler.order === "ZYX") {
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      te[0] = c * e;
      te[4] = be * d - af;
      te[8] = ae * d + bf;
      te[1] = c * f;
      te[5] = bf * d + ae;
      te[9] = af * d - be;
      te[2] = -d;
      te[6] = b * c;
      te[10] = a * c;
    } else if (euler.order === "YZX") {
      const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
      te[0] = c * e;
      te[4] = bd - ac * f;
      te[8] = bc * f + ad;
      te[1] = f;
      te[5] = a * e;
      te[9] = -b * e;
      te[2] = -d * e;
      te[6] = ad * f + bc;
      te[10] = ac - bd * f;
    } else if (euler.order === "XZY") {
      const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
      te[0] = c * e;
      te[4] = -f;
      te[8] = d * e;
      te[1] = ac * f + bd;
      te[5] = a * e;
      te[9] = ad * f - bc;
      te[2] = bc * f - ad;
      te[6] = b * e;
      te[10] = bd * f + ac;
    }
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }
  makeRotationFromQuaternion(q) {
    return this.compose(_zero, q, _one);
  }
  lookAt(eye, target, up) {
    const te = this.elements;
    _z.subVectors(eye, target);
    if (_z.lengthSq() === 0) {
      _z.z = 1;
    }
    _z.normalize();
    _x.crossVectors(up, _z);
    if (_x.lengthSq() === 0) {
      if (Math.abs(up.z) === 1) {
        _z.x += 1e-4;
      } else {
        _z.z += 1e-4;
      }
      _z.normalize();
      _x.crossVectors(up, _z);
    }
    _x.normalize();
    _y.crossVectors(_z, _x);
    te[0] = _x.x;
    te[4] = _y.x;
    te[8] = _z.x;
    te[1] = _x.y;
    te[5] = _y.y;
    te[9] = _z.y;
    te[2] = _x.z;
    te[6] = _y.z;
    te[10] = _z.z;
    return this;
  }
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  multiplyMatrices(a, b) {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;
    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
    return this;
  }
  multiplyScalar(s) {
    const te = this.elements;
    te[0] *= s;
    te[4] *= s;
    te[8] *= s;
    te[12] *= s;
    te[1] *= s;
    te[5] *= s;
    te[9] *= s;
    te[13] *= s;
    te[2] *= s;
    te[6] *= s;
    te[10] *= s;
    te[14] *= s;
    te[3] *= s;
    te[7] *= s;
    te[11] *= s;
    te[15] *= s;
    return this;
  }
  determinant() {
    const te = this.elements;
    const n11 = te[0], n12 = te[4], n13 = te[8], n14 = te[12];
    const n21 = te[1], n22 = te[5], n23 = te[9], n24 = te[13];
    const n31 = te[2], n32 = te[6], n33 = te[10], n34 = te[14];
    const n41 = te[3], n42 = te[7], n43 = te[11], n44 = te[15];
    return n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) + n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) + n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) + n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31);
  }
  transpose() {
    const te = this.elements;
    let tmp;
    tmp = te[1];
    te[1] = te[4];
    te[4] = tmp;
    tmp = te[2];
    te[2] = te[8];
    te[8] = tmp;
    tmp = te[6];
    te[6] = te[9];
    te[9] = tmp;
    tmp = te[3];
    te[3] = te[12];
    te[12] = tmp;
    tmp = te[7];
    te[7] = te[13];
    te[13] = tmp;
    tmp = te[11];
    te[11] = te[14];
    te[14] = tmp;
    return this;
  }
  setPosition(x, y, z) {
    const te = this.elements;
    if (x.isVector3) {
      te[12] = x.x;
      te[13] = x.y;
      te[14] = x.z;
    } else {
      te[12] = x;
      te[13] = y;
      te[14] = z;
    }
    return this;
  }
  invert() {
    const te = this.elements, n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3], n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7], n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11], n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15], t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44, t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44, t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44, t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const detInv = 1 / det;
    te[0] = t11 * detInv;
    te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
    te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
    te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;
    te[4] = t12 * detInv;
    te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
    te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
    te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;
    te[8] = t13 * detInv;
    te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
    te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
    te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;
    te[12] = t14 * detInv;
    te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
    te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
    te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;
    return this;
  }
  scale(v) {
    const te = this.elements;
    const x = v.x, y = v.y, z = v.z;
    te[0] *= x;
    te[4] *= y;
    te[8] *= z;
    te[1] *= x;
    te[5] *= y;
    te[9] *= z;
    te[2] *= x;
    te[6] *= y;
    te[10] *= z;
    te[3] *= x;
    te[7] *= y;
    te[11] *= z;
    return this;
  }
  getMaxScaleOnAxis() {
    const te = this.elements;
    const scaleXSq = te[0] * te[0] + te[1] * te[1] + te[2] * te[2];
    const scaleYSq = te[4] * te[4] + te[5] * te[5] + te[6] * te[6];
    const scaleZSq = te[8] * te[8] + te[9] * te[9] + te[10] * te[10];
    return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
  }
  makeTranslation(x, y, z) {
    if (x.isVector3) {
      this.set(
        1,
        0,
        0,
        x.x,
        0,
        1,
        0,
        x.y,
        0,
        0,
        1,
        x.z,
        0,
        0,
        0,
        1
      );
    } else {
      this.set(
        1,
        0,
        0,
        x,
        0,
        1,
        0,
        y,
        0,
        0,
        1,
        z,
        0,
        0,
        0,
        1
      );
    }
    return this;
  }
  makeRotationX(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    this.set(
      1,
      0,
      0,
      0,
      0,
      c,
      -s,
      0,
      0,
      s,
      c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  makeRotationY(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    this.set(
      c,
      0,
      s,
      0,
      0,
      1,
      0,
      0,
      -s,
      0,
      c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  makeRotationZ(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    this.set(
      c,
      -s,
      0,
      0,
      s,
      c,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  makeRotationAxis(axis, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const x = axis.x, y = axis.y, z = axis.z;
    const tx = t * x, ty = t * y;
    this.set(
      tx * x + c,
      tx * y - s * z,
      tx * z + s * y,
      0,
      tx * y + s * z,
      ty * y + c,
      ty * z - s * x,
      0,
      tx * z - s * y,
      ty * z + s * x,
      t * z * z + c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  makeScale(x, y, z) {
    this.set(
      x,
      0,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      0,
      z,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  makeShear(xy, xz, yx, yz, zx, zy) {
    this.set(
      1,
      yx,
      zx,
      0,
      xy,
      1,
      zy,
      0,
      xz,
      yz,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  compose(position, quaternion, scale) {
    const te = this.elements;
    const x = quaternion._x, y = quaternion._y, z = quaternion._z, w = quaternion._w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = scale.x, sy = scale.y, sz = scale.z;
    te[0] = (1 - (yy + zz)) * sx;
    te[1] = (xy + wz) * sx;
    te[2] = (xz - wy) * sx;
    te[3] = 0;
    te[4] = (xy - wz) * sy;
    te[5] = (1 - (xx + zz)) * sy;
    te[6] = (yz + wx) * sy;
    te[7] = 0;
    te[8] = (xz + wy) * sz;
    te[9] = (yz - wx) * sz;
    te[10] = (1 - (xx + yy)) * sz;
    te[11] = 0;
    te[12] = position.x;
    te[13] = position.y;
    te[14] = position.z;
    te[15] = 1;
    return this;
  }
  decompose(position, quaternion, scale) {
    const te = this.elements;
    let sx = _v1$5.set(te[0], te[1], te[2]).length();
    const sy = _v1$5.set(te[4], te[5], te[6]).length();
    const sz = _v1$5.set(te[8], te[9], te[10]).length();
    const det = this.determinant();
    if (det < 0) sx = -sx;
    position.x = te[12];
    position.y = te[13];
    position.z = te[14];
    _m1$4.copy(this);
    const invSX = 1 / sx;
    const invSY = 1 / sy;
    const invSZ = 1 / sz;
    _m1$4.elements[0] *= invSX;
    _m1$4.elements[1] *= invSX;
    _m1$4.elements[2] *= invSX;
    _m1$4.elements[4] *= invSY;
    _m1$4.elements[5] *= invSY;
    _m1$4.elements[6] *= invSY;
    _m1$4.elements[8] *= invSZ;
    _m1$4.elements[9] *= invSZ;
    _m1$4.elements[10] *= invSZ;
    quaternion.setFromRotationMatrix(_m1$4);
    scale.x = sx;
    scale.y = sy;
    scale.z = sz;
    return this;
  }
  makePerspective(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem) {
    const te = this.elements;
    const x = 2 * near / (right - left);
    const y = 2 * near / (top - bottom);
    const a = (right + left) / (right - left);
    const b = (top + bottom) / (top - bottom);
    let c, d;
    if (coordinateSystem === WebGLCoordinateSystem) {
      c = -(far + near) / (far - near);
      d = -2 * far * near / (far - near);
    } else if (coordinateSystem === WebGPUCoordinateSystem) {
      c = -far / (far - near);
      d = -far * near / (far - near);
    } else {
      throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: " + coordinateSystem);
    }
    te[0] = x;
    te[4] = 0;
    te[8] = a;
    te[12] = 0;
    te[1] = 0;
    te[5] = y;
    te[9] = b;
    te[13] = 0;
    te[2] = 0;
    te[6] = 0;
    te[10] = c;
    te[14] = d;
    te[3] = 0;
    te[7] = 0;
    te[11] = -1;
    te[15] = 0;
    return this;
  }
  makeOrthographic(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem) {
    const te = this.elements;
    const w = 1 / (right - left);
    const h = 1 / (top - bottom);
    const p = 1 / (far - near);
    const x = (right + left) * w;
    const y = (top + bottom) * h;
    let z, zInv;
    if (coordinateSystem === WebGLCoordinateSystem) {
      z = (far + near) * p;
      zInv = -2 * p;
    } else if (coordinateSystem === WebGPUCoordinateSystem) {
      z = near * p;
      zInv = -1 * p;
    } else {
      throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: " + coordinateSystem);
    }
    te[0] = 2 * w;
    te[4] = 0;
    te[8] = 0;
    te[12] = -x;
    te[1] = 0;
    te[5] = 2 * h;
    te[9] = 0;
    te[13] = -y;
    te[2] = 0;
    te[6] = 0;
    te[10] = zInv;
    te[14] = -z;
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[15] = 1;
    return this;
  }
  equals(matrix) {
    const te = this.elements;
    const me = matrix.elements;
    for (let i = 0; i < 16; i++) {
      if (te[i] !== me[i]) return false;
    }
    return true;
  }
  fromArray(array, offset = 0) {
    for (let i = 0; i < 16; i++) {
      this.elements[i] = array[i + offset];
    }
    return this;
  }
  toArray(array = [], offset = 0) {
    const te = this.elements;
    array[offset] = te[0];
    array[offset + 1] = te[1];
    array[offset + 2] = te[2];
    array[offset + 3] = te[3];
    array[offset + 4] = te[4];
    array[offset + 5] = te[5];
    array[offset + 6] = te[6];
    array[offset + 7] = te[7];
    array[offset + 8] = te[8];
    array[offset + 9] = te[9];
    array[offset + 10] = te[10];
    array[offset + 11] = te[11];
    array[offset + 12] = te[12];
    array[offset + 13] = te[13];
    array[offset + 14] = te[14];
    array[offset + 15] = te[15];
    return array;
  }
};
var _v1$5 = /* @__PURE__ */ new Vector3();
var _m1$4 = /* @__PURE__ */ new Matrix4();
var _zero = /* @__PURE__ */ new Vector3(0, 0, 0);
var _one = /* @__PURE__ */ new Vector3(1, 1, 1);
var _x = /* @__PURE__ */ new Vector3();
var _y = /* @__PURE__ */ new Vector3();
var _z = /* @__PURE__ */ new Vector3();
var _matrix$2 = /* @__PURE__ */ new Matrix4();
var _quaternion$3 = /* @__PURE__ */ new Quaternion();
var Euler = class _Euler {
  constructor(x = 0, y = 0, z = 0, order = _Euler.DEFAULT_ORDER) {
    this.isEuler = true;
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
  }
  get x() {
    return this._x;
  }
  set x(value) {
    this._x = value;
    this._onChangeCallback();
  }
  get y() {
    return this._y;
  }
  set y(value) {
    this._y = value;
    this._onChangeCallback();
  }
  get z() {
    return this._z;
  }
  set z(value) {
    this._z = value;
    this._onChangeCallback();
  }
  get order() {
    return this._order;
  }
  set order(value) {
    this._order = value;
    this._onChangeCallback();
  }
  set(x, y, z, order = this._order) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
    this._onChangeCallback();
    return this;
  }
  clone() {
    return new this.constructor(this._x, this._y, this._z, this._order);
  }
  copy(euler) {
    this._x = euler._x;
    this._y = euler._y;
    this._z = euler._z;
    this._order = euler._order;
    this._onChangeCallback();
    return this;
  }
  setFromRotationMatrix(m, order = this._order, update = true) {
    const te = m.elements;
    const m11 = te[0], m12 = te[4], m13 = te[8];
    const m21 = te[1], m22 = te[5], m23 = te[9];
    const m31 = te[2], m32 = te[6], m33 = te[10];
    switch (order) {
      case "XYZ":
        this._y = Math.asin(clamp(m13, -1, 1));
        if (Math.abs(m13) < 0.9999999) {
          this._x = Math.atan2(-m23, m33);
          this._z = Math.atan2(-m12, m11);
        } else {
          this._x = Math.atan2(m32, m22);
          this._z = 0;
        }
        break;
      case "YXZ":
        this._x = Math.asin(-clamp(m23, -1, 1));
        if (Math.abs(m23) < 0.9999999) {
          this._y = Math.atan2(m13, m33);
          this._z = Math.atan2(m21, m22);
        } else {
          this._y = Math.atan2(-m31, m11);
          this._z = 0;
        }
        break;
      case "ZXY":
        this._x = Math.asin(clamp(m32, -1, 1));
        if (Math.abs(m32) < 0.9999999) {
          this._y = Math.atan2(-m31, m33);
          this._z = Math.atan2(-m12, m22);
        } else {
          this._y = 0;
          this._z = Math.atan2(m21, m11);
        }
        break;
      case "ZYX":
        this._y = Math.asin(-clamp(m31, -1, 1));
        if (Math.abs(m31) < 0.9999999) {
          this._x = Math.atan2(m32, m33);
          this._z = Math.atan2(m21, m11);
        } else {
          this._x = 0;
          this._z = Math.atan2(-m12, m22);
        }
        break;
      case "YZX":
        this._z = Math.asin(clamp(m21, -1, 1));
        if (Math.abs(m21) < 0.9999999) {
          this._x = Math.atan2(-m23, m22);
          this._y = Math.atan2(-m31, m11);
        } else {
          this._x = 0;
          this._y = Math.atan2(m13, m33);
        }
        break;
      case "XZY":
        this._z = Math.asin(-clamp(m12, -1, 1));
        if (Math.abs(m12) < 0.9999999) {
          this._x = Math.atan2(m32, m22);
          this._y = Math.atan2(m13, m11);
        } else {
          this._x = Math.atan2(-m23, m33);
          this._y = 0;
        }
        break;
      default:
        console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: " + order);
    }
    this._order = order;
    if (update === true) this._onChangeCallback();
    return this;
  }
  setFromQuaternion(q, order, update) {
    _matrix$2.makeRotationFromQuaternion(q);
    return this.setFromRotationMatrix(_matrix$2, order, update);
  }
  setFromVector3(v, order = this._order) {
    return this.set(v.x, v.y, v.z, order);
  }
  reorder(newOrder) {
    _quaternion$3.setFromEuler(this);
    return this.setFromQuaternion(_quaternion$3, newOrder);
  }
  equals(euler) {
    return euler._x === this._x && euler._y === this._y && euler._z === this._z && euler._order === this._order;
  }
  fromArray(array) {
    this._x = array[0];
    this._y = array[1];
    this._z = array[2];
    if (array[3] !== void 0) this._order = array[3];
    this._onChangeCallback();
    return this;
  }
  toArray(array = [], offset = 0) {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._order;
    return array;
  }
  _onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }
  _onChangeCallback() {
  }
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._order;
  }
};
Euler.DEFAULT_ORDER = "XYZ";
var Layers = class {
  constructor() {
    this.mask = 1 | 0;
  }
  set(channel) {
    this.mask = (1 << channel | 0) >>> 0;
  }
  enable(channel) {
    this.mask |= 1 << channel | 0;
  }
  enableAll() {
    this.mask = 4294967295 | 0;
  }
  toggle(channel) {
    this.mask ^= 1 << channel | 0;
  }
  disable(channel) {
    this.mask &= ~(1 << channel | 0);
  }
  disableAll() {
    this.mask = 0;
  }
  test(layers) {
    return (this.mask & layers.mask) !== 0;
  }
  isEnabled(channel) {
    return (this.mask & (1 << channel | 0)) !== 0;
  }
};
var _object3DId = 0;
var _v1$4 = /* @__PURE__ */ new Vector3();
var _q1 = /* @__PURE__ */ new Quaternion();
var _m1$3 = /* @__PURE__ */ new Matrix4();
var _target = /* @__PURE__ */ new Vector3();
var _position$3 = /* @__PURE__ */ new Vector3();
var _scale$2 = /* @__PURE__ */ new Vector3();
var _quaternion$2 = /* @__PURE__ */ new Quaternion();
var _xAxis = /* @__PURE__ */ new Vector3(1, 0, 0);
var _yAxis = /* @__PURE__ */ new Vector3(0, 1, 0);
var _zAxis = /* @__PURE__ */ new Vector3(0, 0, 1);
var _addedEvent = { type: "added" };
var _removedEvent = { type: "removed" };
var _childaddedEvent = { type: "childadded", child: null };
var _childremovedEvent = { type: "childremoved", child: null };
var Object3D = class _Object3D extends EventDispatcher {
  constructor() {
    super();
    this.isObject3D = true;
    Object.defineProperty(this, "id", { value: _object3DId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.type = "Object3D";
    this.parent = null;
    this.children = [];
    this.up = _Object3D.DEFAULT_UP.clone();
    const position = new Vector3();
    const rotation = new Euler();
    const quaternion = new Quaternion();
    const scale = new Vector3(1, 1, 1);
    function onRotationChange() {
      quaternion.setFromEuler(rotation, false);
    }
    function onQuaternionChange() {
      rotation.setFromQuaternion(quaternion, void 0, false);
    }
    rotation._onChange(onRotationChange);
    quaternion._onChange(onQuaternionChange);
    Object.defineProperties(this, {
      position: {
        configurable: true,
        enumerable: true,
        value: position
      },
      rotation: {
        configurable: true,
        enumerable: true,
        value: rotation
      },
      quaternion: {
        configurable: true,
        enumerable: true,
        value: quaternion
      },
      scale: {
        configurable: true,
        enumerable: true,
        value: scale
      },
      modelViewMatrix: {
        value: new Matrix4()
      },
      normalMatrix: {
        value: new Matrix3()
      }
    });
    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();
    this.matrixAutoUpdate = _Object3D.DEFAULT_MATRIX_AUTO_UPDATE;
    this.matrixWorldAutoUpdate = _Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE;
    this.matrixWorldNeedsUpdate = false;
    this.layers = new Layers();
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.animations = [];
    this.userData = {};
  }
  onBeforeShadow() {
  }
  onAfterShadow() {
  }
  onBeforeRender() {
  }
  onAfterRender() {
  }
  applyMatrix4(matrix) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    this.matrix.premultiply(matrix);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }
  applyQuaternion(q) {
    this.quaternion.premultiply(q);
    return this;
  }
  setRotationFromAxisAngle(axis, angle) {
    this.quaternion.setFromAxisAngle(axis, angle);
  }
  setRotationFromEuler(euler) {
    this.quaternion.setFromEuler(euler, true);
  }
  setRotationFromMatrix(m) {
    this.quaternion.setFromRotationMatrix(m);
  }
  setRotationFromQuaternion(q) {
    this.quaternion.copy(q);
  }
  rotateOnAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.multiply(_q1);
    return this;
  }
  rotateOnWorldAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.premultiply(_q1);
    return this;
  }
  rotateX(angle) {
    return this.rotateOnAxis(_xAxis, angle);
  }
  rotateY(angle) {
    return this.rotateOnAxis(_yAxis, angle);
  }
  rotateZ(angle) {
    return this.rotateOnAxis(_zAxis, angle);
  }
  translateOnAxis(axis, distance) {
    _v1$4.copy(axis).applyQuaternion(this.quaternion);
    this.position.add(_v1$4.multiplyScalar(distance));
    return this;
  }
  translateX(distance) {
    return this.translateOnAxis(_xAxis, distance);
  }
  translateY(distance) {
    return this.translateOnAxis(_yAxis, distance);
  }
  translateZ(distance) {
    return this.translateOnAxis(_zAxis, distance);
  }
  localToWorld(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(this.matrixWorld);
  }
  worldToLocal(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(_m1$3.copy(this.matrixWorld).invert());
  }
  lookAt(x, y, z) {
    if (x.isVector3) {
      _target.copy(x);
    } else {
      _target.set(x, y, z);
    }
    const parent = this.parent;
    this.updateWorldMatrix(true, false);
    _position$3.setFromMatrixPosition(this.matrixWorld);
    if (this.isCamera || this.isLight) {
      _m1$3.lookAt(_position$3, _target, this.up);
    } else {
      _m1$3.lookAt(_target, _position$3, this.up);
    }
    this.quaternion.setFromRotationMatrix(_m1$3);
    if (parent) {
      _m1$3.extractRotation(parent.matrixWorld);
      _q1.setFromRotationMatrix(_m1$3);
      this.quaternion.premultiply(_q1.invert());
    }
  }
  add(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.add(arguments[i]);
      }
      return this;
    }
    if (object === this) {
      console.error("THREE.Object3D.add: object can't be added as a child of itself.", object);
      return this;
    }
    if (object && object.isObject3D) {
      object.removeFromParent();
      object.parent = this;
      this.children.push(object);
      object.dispatchEvent(_addedEvent);
      _childaddedEvent.child = object;
      this.dispatchEvent(_childaddedEvent);
      _childaddedEvent.child = null;
    } else {
      console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.", object);
    }
    return this;
  }
  remove(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.remove(arguments[i]);
      }
      return this;
    }
    const index = this.children.indexOf(object);
    if (index !== -1) {
      object.parent = null;
      this.children.splice(index, 1);
      object.dispatchEvent(_removedEvent);
      _childremovedEvent.child = object;
      this.dispatchEvent(_childremovedEvent);
      _childremovedEvent.child = null;
    }
    return this;
  }
  removeFromParent() {
    const parent = this.parent;
    if (parent !== null) {
      parent.remove(this);
    }
    return this;
  }
  clear() {
    return this.remove(...this.children);
  }
  attach(object) {
    this.updateWorldMatrix(true, false);
    _m1$3.copy(this.matrixWorld).invert();
    if (object.parent !== null) {
      object.parent.updateWorldMatrix(true, false);
      _m1$3.multiply(object.parent.matrixWorld);
    }
    object.applyMatrix4(_m1$3);
    object.removeFromParent();
    object.parent = this;
    this.children.push(object);
    object.updateWorldMatrix(false, true);
    object.dispatchEvent(_addedEvent);
    _childaddedEvent.child = object;
    this.dispatchEvent(_childaddedEvent);
    _childaddedEvent.child = null;
    return this;
  }
  getObjectById(id) {
    return this.getObjectByProperty("id", id);
  }
  getObjectByName(name) {
    return this.getObjectByProperty("name", name);
  }
  getObjectByProperty(name, value) {
    if (this[name] === value) return this;
    for (let i = 0, l = this.children.length; i < l; i++) {
      const child = this.children[i];
      const object = child.getObjectByProperty(name, value);
      if (object !== void 0) {
        return object;
      }
    }
    return void 0;
  }
  getObjectsByProperty(name, value, result = []) {
    if (this[name] === value) result.push(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].getObjectsByProperty(name, value, result);
    }
    return result;
  }
  getWorldPosition(target) {
    this.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.matrixWorld);
  }
  getWorldQuaternion(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position$3, target, _scale$2);
    return target;
  }
  getWorldScale(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position$3, _quaternion$2, target);
    return target;
  }
  getWorldDirection(target) {
    this.updateWorldMatrix(true, false);
    const e = this.matrixWorld.elements;
    return target.set(e[8], e[9], e[10]).normalize();
  }
  raycast() {
  }
  traverse(callback) {
    callback(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverse(callback);
    }
  }
  traverseVisible(callback) {
    if (this.visible === false) return;
    callback(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverseVisible(callback);
    }
  }
  traverseAncestors(callback) {
    const parent = this.parent;
    if (parent !== null) {
      callback(parent);
      parent.traverseAncestors(callback);
    }
  }
  updateMatrix() {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = true;
  }
  updateMatrixWorld(force) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.parent === null) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];
      if (child.matrixWorldAutoUpdate === true || force === true) {
        child.updateMatrixWorld(force);
      }
    }
  }
  updateWorldMatrix(updateParents, updateChildren) {
    const parent = this.parent;
    if (updateParents === true && parent !== null && parent.matrixWorldAutoUpdate === true) {
      parent.updateWorldMatrix(true, false);
    }
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.parent === null) {
      this.matrixWorld.copy(this.matrix);
    } else {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    }
    if (updateChildren === true) {
      const children = this.children;
      for (let i = 0, l = children.length; i < l; i++) {
        const child = children[i];
        if (child.matrixWorldAutoUpdate === true) {
          child.updateWorldMatrix(false, true);
        }
      }
    }
  }
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    const output = {};
    if (isRootObject) {
      meta = {
        geometries: {},
        materials: {},
        textures: {},
        images: {},
        shapes: {},
        skeletons: {},
        animations: {},
        nodes: {}
      };
      output.metadata = {
        version: 4.6,
        type: "Object",
        generator: "Object3D.toJSON"
      };
    }
    const object = {};
    object.uuid = this.uuid;
    object.type = this.type;
    if (this.name !== "") object.name = this.name;
    if (this.castShadow === true) object.castShadow = true;
    if (this.receiveShadow === true) object.receiveShadow = true;
    if (this.visible === false) object.visible = false;
    if (this.frustumCulled === false) object.frustumCulled = false;
    if (this.renderOrder !== 0) object.renderOrder = this.renderOrder;
    if (Object.keys(this.userData).length > 0) object.userData = this.userData;
    object.layers = this.layers.mask;
    object.matrix = this.matrix.toArray();
    object.up = this.up.toArray();
    if (this.matrixAutoUpdate === false) object.matrixAutoUpdate = false;
    if (this.isInstancedMesh) {
      object.type = "InstancedMesh";
      object.count = this.count;
      object.instanceMatrix = this.instanceMatrix.toJSON();
      if (this.instanceColor !== null) object.instanceColor = this.instanceColor.toJSON();
    }
    if (this.isBatchedMesh) {
      object.type = "BatchedMesh";
      object.perObjectFrustumCulled = this.perObjectFrustumCulled;
      object.sortObjects = this.sortObjects;
      object.drawRanges = this._drawRanges;
      object.reservedRanges = this._reservedRanges;
      object.visibility = this._visibility;
      object.active = this._active;
      object.bounds = this._bounds.map((bound) => ({
        boxInitialized: bound.boxInitialized,
        boxMin: bound.box.min.toArray(),
        boxMax: bound.box.max.toArray(),
        sphereInitialized: bound.sphereInitialized,
        sphereRadius: bound.sphere.radius,
        sphereCenter: bound.sphere.center.toArray()
      }));
      object.maxGeometryCount = this._maxGeometryCount;
      object.maxVertexCount = this._maxVertexCount;
      object.maxIndexCount = this._maxIndexCount;
      object.geometryInitialized = this._geometryInitialized;
      object.geometryCount = this._geometryCount;
      object.matricesTexture = this._matricesTexture.toJSON(meta);
      if (this.boundingSphere !== null) {
        object.boundingSphere = {
          center: object.boundingSphere.center.toArray(),
          radius: object.boundingSphere.radius
        };
      }
      if (this.boundingBox !== null) {
        object.boundingBox = {
          min: object.boundingBox.min.toArray(),
          max: object.boundingBox.max.toArray()
        };
      }
    }
    function serialize(library, element) {
      if (library[element.uuid] === void 0) {
        library[element.uuid] = element.toJSON(meta);
      }
      return element.uuid;
    }
    if (this.isScene) {
      if (this.background) {
        if (this.background.isColor) {
          object.background = this.background.toJSON();
        } else if (this.background.isTexture) {
          object.background = this.background.toJSON(meta).uuid;
        }
      }
      if (this.environment && this.environment.isTexture && this.environment.isRenderTargetTexture !== true) {
        object.environment = this.environment.toJSON(meta).uuid;
      }
    } else if (this.isMesh || this.isLine || this.isPoints) {
      object.geometry = serialize(meta.geometries, this.geometry);
      const parameters = this.geometry.parameters;
      if (parameters !== void 0 && parameters.shapes !== void 0) {
        const shapes = parameters.shapes;
        if (Array.isArray(shapes)) {
          for (let i = 0, l = shapes.length; i < l; i++) {
            const shape = shapes[i];
            serialize(meta.shapes, shape);
          }
        } else {
          serialize(meta.shapes, shapes);
        }
      }
    }
    if (this.isSkinnedMesh) {
      object.bindMode = this.bindMode;
      object.bindMatrix = this.bindMatrix.toArray();
      if (this.skeleton !== void 0) {
        serialize(meta.skeletons, this.skeleton);
        object.skeleton = this.skeleton.uuid;
      }
    }
    if (this.material !== void 0) {
      if (Array.isArray(this.material)) {
        const uuids = [];
        for (let i = 0, l = this.material.length; i < l; i++) {
          uuids.push(serialize(meta.materials, this.material[i]));
        }
        object.material = uuids;
      } else {
        object.material = serialize(meta.materials, this.material);
      }
    }
    if (this.children.length > 0) {
      object.children = [];
      for (let i = 0; i < this.children.length; i++) {
        object.children.push(this.children[i].toJSON(meta).object);
      }
    }
    if (this.animations.length > 0) {
      object.animations = [];
      for (let i = 0; i < this.animations.length; i++) {
        const animation = this.animations[i];
        object.animations.push(serialize(meta.animations, animation));
      }
    }
    if (isRootObject) {
      const geometries = extractFromCache(meta.geometries);
      const materials = extractFromCache(meta.materials);
      const textures = extractFromCache(meta.textures);
      const images = extractFromCache(meta.images);
      const shapes = extractFromCache(meta.shapes);
      const skeletons = extractFromCache(meta.skeletons);
      const animations = extractFromCache(meta.animations);
      const nodes = extractFromCache(meta.nodes);
      if (geometries.length > 0) output.geometries = geometries;
      if (materials.length > 0) output.materials = materials;
      if (textures.length > 0) output.textures = textures;
      if (images.length > 0) output.images = images;
      if (shapes.length > 0) output.shapes = shapes;
      if (skeletons.length > 0) output.skeletons = skeletons;
      if (animations.length > 0) output.animations = animations;
      if (nodes.length > 0) output.nodes = nodes;
    }
    output.object = object;
    return output;
    function extractFromCache(cache) {
      const values = [];
      for (const key in cache) {
        const data = cache[key];
        delete data.metadata;
        values.push(data);
      }
      return values;
    }
  }
  clone(recursive) {
    return new this.constructor().copy(this, recursive);
  }
  copy(source, recursive = true) {
    this.name = source.name;
    this.up.copy(source.up);
    this.position.copy(source.position);
    this.rotation.order = source.rotation.order;
    this.quaternion.copy(source.quaternion);
    this.scale.copy(source.scale);
    this.matrix.copy(source.matrix);
    this.matrixWorld.copy(source.matrixWorld);
    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;
    this.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;
    this.layers.mask = source.layers.mask;
    this.visible = source.visible;
    this.castShadow = source.castShadow;
    this.receiveShadow = source.receiveShadow;
    this.frustumCulled = source.frustumCulled;
    this.renderOrder = source.renderOrder;
    this.animations = source.animations.slice();
    this.userData = JSON.parse(JSON.stringify(source.userData));
    if (recursive === true) {
      for (let i = 0; i < source.children.length; i++) {
        const child = source.children[i];
        this.add(child.clone());
      }
    }
    return this;
  }
};
Object3D.DEFAULT_UP = /* @__PURE__ */ new Vector3(0, 1, 0);
Object3D.DEFAULT_MATRIX_AUTO_UPDATE = true;
Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE = true;
var _v0$1 = /* @__PURE__ */ new Vector3();
var _v1$3 = /* @__PURE__ */ new Vector3();
var _v2$2 = /* @__PURE__ */ new Vector3();
var _v3$2 = /* @__PURE__ */ new Vector3();
var _vab = /* @__PURE__ */ new Vector3();
var _vac = /* @__PURE__ */ new Vector3();
var _vbc = /* @__PURE__ */ new Vector3();
var _vap = /* @__PURE__ */ new Vector3();
var _vbp = /* @__PURE__ */ new Vector3();
var _vcp = /* @__PURE__ */ new Vector3();
var Triangle = class _Triangle {
  constructor(a = new Vector3(), b = new Vector3(), c = new Vector3()) {
    this.a = a;
    this.b = b;
    this.c = c;
  }
  static getNormal(a, b, c, target) {
    target.subVectors(c, b);
    _v0$1.subVectors(a, b);
    target.cross(_v0$1);
    const targetLengthSq = target.lengthSq();
    if (targetLengthSq > 0) {
      return target.multiplyScalar(1 / Math.sqrt(targetLengthSq));
    }
    return target.set(0, 0, 0);
  }
  // static/instance method to calculate barycentric coordinates
  // based on: http://www.blackpawn.com/texts/pointinpoly/default.html
  static getBarycoord(point, a, b, c, target) {
    _v0$1.subVectors(c, a);
    _v1$3.subVectors(b, a);
    _v2$2.subVectors(point, a);
    const dot00 = _v0$1.dot(_v0$1);
    const dot01 = _v0$1.dot(_v1$3);
    const dot02 = _v0$1.dot(_v2$2);
    const dot11 = _v1$3.dot(_v1$3);
    const dot12 = _v1$3.dot(_v2$2);
    const denom = dot00 * dot11 - dot01 * dot01;
    if (denom === 0) {
      target.set(0, 0, 0);
      return null;
    }
    const invDenom = 1 / denom;
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    return target.set(1 - u - v, v, u);
  }
  static containsPoint(point, a, b, c) {
    if (this.getBarycoord(point, a, b, c, _v3$2) === null) {
      return false;
    }
    return _v3$2.x >= 0 && _v3$2.y >= 0 && _v3$2.x + _v3$2.y <= 1;
  }
  static getInterpolation(point, p1, p2, p3, v1, v2, v3, target) {
    if (this.getBarycoord(point, p1, p2, p3, _v3$2) === null) {
      target.x = 0;
      target.y = 0;
      if ("z" in target) target.z = 0;
      if ("w" in target) target.w = 0;
      return null;
    }
    target.setScalar(0);
    target.addScaledVector(v1, _v3$2.x);
    target.addScaledVector(v2, _v3$2.y);
    target.addScaledVector(v3, _v3$2.z);
    return target;
  }
  static isFrontFacing(a, b, c, direction) {
    _v0$1.subVectors(c, b);
    _v1$3.subVectors(a, b);
    return _v0$1.cross(_v1$3).dot(direction) < 0 ? true : false;
  }
  set(a, b, c) {
    this.a.copy(a);
    this.b.copy(b);
    this.c.copy(c);
    return this;
  }
  setFromPointsAndIndices(points, i0, i1, i2) {
    this.a.copy(points[i0]);
    this.b.copy(points[i1]);
    this.c.copy(points[i2]);
    return this;
  }
  setFromAttributeAndIndices(attribute, i0, i1, i2) {
    this.a.fromBufferAttribute(attribute, i0);
    this.b.fromBufferAttribute(attribute, i1);
    this.c.fromBufferAttribute(attribute, i2);
    return this;
  }
  clone() {
    return new this.constructor().copy(this);
  }
  copy(triangle) {
    this.a.copy(triangle.a);
    this.b.copy(triangle.b);
    this.c.copy(triangle.c);
    return this;
  }
  getArea() {
    _v0$1.subVectors(this.c, this.b);
    _v1$3.subVectors(this.a, this.b);
    return _v0$1.cross(_v1$3).length() * 0.5;
  }
  getMidpoint(target) {
    return target.addVectors(this.a, this.b).add(this.c).multiplyScalar(1 / 3);
  }
  getNormal(target) {
    return _Triangle.getNormal(this.a, this.b, this.c, target);
  }
  getPlane(target) {
    return target.setFromCoplanarPoints(this.a, this.b, this.c);
  }
  getBarycoord(point, target) {
    return _Triangle.getBarycoord(point, this.a, this.b, this.c, target);
  }
  getInterpolation(point, v1, v2, v3, target) {
    return _Triangle.getInterpolation(point, this.a, this.b, this.c, v1, v2, v3, target);
  }
  containsPoint(point) {
    return _Triangle.containsPoint(point, this.a, this.b, this.c);
  }
  isFrontFacing(direction) {
    return _Triangle.isFrontFacing(this.a, this.b, this.c, direction);
  }
  intersectsBox(box) {
    return box.intersectsTriangle(this);
  }
  closestPointToPoint(p, target) {
    const a = this.a, b = this.b, c = this.c;
    let v, w;
    _vab.subVectors(b, a);
    _vac.subVectors(c, a);
    _vap.subVectors(p, a);
    const d1 = _vab.dot(_vap);
    const d2 = _vac.dot(_vap);
    if (d1 <= 0 && d2 <= 0) {
      return target.copy(a);
    }
    _vbp.subVectors(p, b);
    const d3 = _vab.dot(_vbp);
    const d4 = _vac.dot(_vbp);
    if (d3 >= 0 && d4 <= d3) {
      return target.copy(b);
    }
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      v = d1 / (d1 - d3);
      return target.copy(a).addScaledVector(_vab, v);
    }
    _vcp.subVectors(p, c);
    const d5 = _vab.dot(_vcp);
    const d6 = _vac.dot(_vcp);
    if (d6 >= 0 && d5 <= d6) {
      return target.copy(c);
    }
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      w = d2 / (d2 - d6);
      return target.copy(a).addScaledVector(_vac, w);
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      _vbc.subVectors(c, b);
      w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      return target.copy(b).addScaledVector(_vbc, w);
    }
    const denom = 1 / (va + vb + vc);
    v = vb * denom;
    w = vc * denom;
    return target.copy(a).addScaledVector(_vab, v).addScaledVector(_vac, w);
  }
  equals(triangle) {
    return triangle.a.equals(this.a) && triangle.b.equals(this.b) && triangle.c.equals(this.c);
  }
};
var _colorKeywords = {
  "aliceblue": 15792383,
  "antiquewhite": 16444375,
  "aqua": 65535,
  "aquamarine": 8388564,
  "azure": 15794175,
  "beige": 16119260,
  "bisque": 16770244,
  "black": 0,
  "blanchedalmond": 16772045,
  "blue": 255,
  "blueviolet": 9055202,
  "brown": 10824234,
  "burlywood": 14596231,
  "cadetblue": 6266528,
  "chartreuse": 8388352,
  "chocolate": 13789470,
  "coral": 16744272,
  "cornflowerblue": 6591981,
  "cornsilk": 16775388,
  "crimson": 14423100,
  "cyan": 65535,
  "darkblue": 139,
  "darkcyan": 35723,
  "darkgoldenrod": 12092939,
  "darkgray": 11119017,
  "darkgreen": 25600,
  "darkgrey": 11119017,
  "darkkhaki": 12433259,
  "darkmagenta": 9109643,
  "darkolivegreen": 5597999,
  "darkorange": 16747520,
  "darkorchid": 10040012,
  "darkred": 9109504,
  "darksalmon": 15308410,
  "darkseagreen": 9419919,
  "darkslateblue": 4734347,
  "darkslategray": 3100495,
  "darkslategrey": 3100495,
  "darkturquoise": 52945,
  "darkviolet": 9699539,
  "deeppink": 16716947,
  "deepskyblue": 49151,
  "dimgray": 6908265,
  "dimgrey": 6908265,
  "dodgerblue": 2003199,
  "firebrick": 11674146,
  "floralwhite": 16775920,
  "forestgreen": 2263842,
  "fuchsia": 16711935,
  "gainsboro": 14474460,
  "ghostwhite": 16316671,
  "gold": 16766720,
  "goldenrod": 14329120,
  "gray": 8421504,
  "green": 32768,
  "greenyellow": 11403055,
  "grey": 8421504,
  "honeydew": 15794160,
  "hotpink": 16738740,
  "indianred": 13458524,
  "indigo": 4915330,
  "ivory": 16777200,
  "khaki": 15787660,
  "lavender": 15132410,
  "lavenderblush": 16773365,
  "lawngreen": 8190976,
  "lemonchiffon": 16775885,
  "lightblue": 11393254,
  "lightcoral": 15761536,
  "lightcyan": 14745599,
  "lightgoldenrodyellow": 16448210,
  "lightgray": 13882323,
  "lightgreen": 9498256,
  "lightgrey": 13882323,
  "lightpink": 16758465,
  "lightsalmon": 16752762,
  "lightseagreen": 2142890,
  "lightskyblue": 8900346,
  "lightslategray": 7833753,
  "lightslategrey": 7833753,
  "lightsteelblue": 11584734,
  "lightyellow": 16777184,
  "lime": 65280,
  "limegreen": 3329330,
  "linen": 16445670,
  "magenta": 16711935,
  "maroon": 8388608,
  "mediumaquamarine": 6737322,
  "mediumblue": 205,
  "mediumorchid": 12211667,
  "mediumpurple": 9662683,
  "mediumseagreen": 3978097,
  "mediumslateblue": 8087790,
  "mediumspringgreen": 64154,
  "mediumturquoise": 4772300,
  "mediumvioletred": 13047173,
  "midnightblue": 1644912,
  "mintcream": 16121850,
  "mistyrose": 16770273,
  "moccasin": 16770229,
  "navajowhite": 16768685,
  "navy": 128,
  "oldlace": 16643558,
  "olive": 8421376,
  "olivedrab": 7048739,
  "orange": 16753920,
  "orangered": 16729344,
  "orchid": 14315734,
  "palegoldenrod": 15657130,
  "palegreen": 10025880,
  "paleturquoise": 11529966,
  "palevioletred": 14381203,
  "papayawhip": 16773077,
  "peachpuff": 16767673,
  "peru": 13468991,
  "pink": 16761035,
  "plum": 14524637,
  "powderblue": 11591910,
  "purple": 8388736,
  "rebeccapurple": 6697881,
  "red": 16711680,
  "rosybrown": 12357519,
  "royalblue": 4286945,
  "saddlebrown": 9127187,
  "salmon": 16416882,
  "sandybrown": 16032864,
  "seagreen": 3050327,
  "seashell": 16774638,
  "sienna": 10506797,
  "silver": 12632256,
  "skyblue": 8900331,
  "slateblue": 6970061,
  "slategray": 7372944,
  "slategrey": 7372944,
  "snow": 16775930,
  "springgreen": 65407,
  "steelblue": 4620980,
  "tan": 13808780,
  "teal": 32896,
  "thistle": 14204888,
  "tomato": 16737095,
  "turquoise": 4251856,
  "violet": 15631086,
  "wheat": 16113331,
  "white": 16777215,
  "whitesmoke": 16119285,
  "yellow": 16776960,
  "yellowgreen": 10145074
};
var _hslA = { h: 0, s: 0, l: 0 };
var _hslB = { h: 0, s: 0, l: 0 };
function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}
var Color = class {
  constructor(r, g, b) {
    this.isColor = true;
    this.r = 1;
    this.g = 1;
    this.b = 1;
    return this.set(r, g, b);
  }
  set(r, g, b) {
    if (g === void 0 && b === void 0) {
      const value = r;
      if (value && value.isColor) {
        this.copy(value);
      } else if (typeof value === "number") {
        this.setHex(value);
      } else if (typeof value === "string") {
        this.setStyle(value);
      }
    } else {
      this.setRGB(r, g, b);
    }
    return this;
  }
  setScalar(scalar) {
    this.r = scalar;
    this.g = scalar;
    this.b = scalar;
    return this;
  }
  setHex(hex, colorSpace = SRGBColorSpace) {
    hex = Math.floor(hex);
    this.r = (hex >> 16 & 255) / 255;
    this.g = (hex >> 8 & 255) / 255;
    this.b = (hex & 255) / 255;
    ColorManagement.toWorkingColorSpace(this, colorSpace);
    return this;
  }
  setRGB(r, g, b, colorSpace = ColorManagement.workingColorSpace) {
    this.r = r;
    this.g = g;
    this.b = b;
    ColorManagement.toWorkingColorSpace(this, colorSpace);
    return this;
  }
  setHSL(h, s, l, colorSpace = ColorManagement.workingColorSpace) {
    h = euclideanModulo(h, 1);
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    if (s === 0) {
      this.r = this.g = this.b = l;
    } else {
      const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
      const q = 2 * l - p;
      this.r = hue2rgb(q, p, h + 1 / 3);
      this.g = hue2rgb(q, p, h);
      this.b = hue2rgb(q, p, h - 1 / 3);
    }
    ColorManagement.toWorkingColorSpace(this, colorSpace);
    return this;
  }
  setStyle(style, colorSpace = SRGBColorSpace) {
    function handleAlpha(string) {
      if (string === void 0) return;
      if (parseFloat(string) < 1) {
        console.warn("THREE.Color: Alpha component of " + style + " will be ignored.");
      }
    }
    let m;
    if (m = /^(\w+)\(([^\)]*)\)/.exec(style)) {
      let color;
      const name = m[1];
      const components2 = m[2];
      switch (name) {
        case "rgb":
        case "rgba":
          if (color = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components2)) {
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(255, parseInt(color[1], 10)) / 255,
              Math.min(255, parseInt(color[2], 10)) / 255,
              Math.min(255, parseInt(color[3], 10)) / 255,
              colorSpace
            );
          }
          if (color = /^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components2)) {
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(100, parseInt(color[1], 10)) / 100,
              Math.min(100, parseInt(color[2], 10)) / 100,
              Math.min(100, parseInt(color[3], 10)) / 100,
              colorSpace
            );
          }
          break;
        case "hsl":
        case "hsla":
          if (color = /^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components2)) {
            handleAlpha(color[4]);
            return this.setHSL(
              parseFloat(color[1]) / 360,
              parseFloat(color[2]) / 100,
              parseFloat(color[3]) / 100,
              colorSpace
            );
          }
          break;
        default:
          console.warn("THREE.Color: Unknown color model " + style);
      }
    } else if (m = /^\#([A-Fa-f\d]+)$/.exec(style)) {
      const hex = m[1];
      const size = hex.length;
      if (size === 3) {
        return this.setRGB(
          parseInt(hex.charAt(0), 16) / 15,
          parseInt(hex.charAt(1), 16) / 15,
          parseInt(hex.charAt(2), 16) / 15,
          colorSpace
        );
      } else if (size === 6) {
        return this.setHex(parseInt(hex, 16), colorSpace);
      } else {
        console.warn("THREE.Color: Invalid hex color " + style);
      }
    } else if (style && style.length > 0) {
      return this.setColorName(style, colorSpace);
    }
    return this;
  }
  setColorName(style, colorSpace = SRGBColorSpace) {
    const hex = _colorKeywords[style.toLowerCase()];
    if (hex !== void 0) {
      this.setHex(hex, colorSpace);
    } else {
      console.warn("THREE.Color: Unknown color " + style);
    }
    return this;
  }
  clone() {
    return new this.constructor(this.r, this.g, this.b);
  }
  copy(color) {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
    return this;
  }
  copySRGBToLinear(color) {
    this.r = SRGBToLinear(color.r);
    this.g = SRGBToLinear(color.g);
    this.b = SRGBToLinear(color.b);
    return this;
  }
  copyLinearToSRGB(color) {
    this.r = LinearToSRGB(color.r);
    this.g = LinearToSRGB(color.g);
    this.b = LinearToSRGB(color.b);
    return this;
  }
  convertSRGBToLinear() {
    this.copySRGBToLinear(this);
    return this;
  }
  convertLinearToSRGB() {
    this.copyLinearToSRGB(this);
    return this;
  }
  getHex(colorSpace = SRGBColorSpace) {
    ColorManagement.fromWorkingColorSpace(_color.copy(this), colorSpace);
    return Math.round(clamp(_color.r * 255, 0, 255)) * 65536 + Math.round(clamp(_color.g * 255, 0, 255)) * 256 + Math.round(clamp(_color.b * 255, 0, 255));
  }
  getHexString(colorSpace = SRGBColorSpace) {
    return ("000000" + this.getHex(colorSpace).toString(16)).slice(-6);
  }
  getHSL(target, colorSpace = ColorManagement.workingColorSpace) {
    ColorManagement.fromWorkingColorSpace(_color.copy(this), colorSpace);
    const r = _color.r, g = _color.g, b = _color.b;
    const max2 = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hue, saturation;
    const lightness = (min + max2) / 2;
    if (min === max2) {
      hue = 0;
      saturation = 0;
    } else {
      const delta = max2 - min;
      saturation = lightness <= 0.5 ? delta / (max2 + min) : delta / (2 - max2 - min);
      switch (max2) {
        case r:
          hue = (g - b) / delta + (g < b ? 6 : 0);
          break;
        case g:
          hue = (b - r) / delta + 2;
          break;
        case b:
          hue = (r - g) / delta + 4;
          break;
      }
      hue /= 6;
    }
    target.h = hue;
    target.s = saturation;
    target.l = lightness;
    return target;
  }
  getRGB(target, colorSpace = ColorManagement.workingColorSpace) {
    ColorManagement.fromWorkingColorSpace(_color.copy(this), colorSpace);
    target.r = _color.r;
    target.g = _color.g;
    target.b = _color.b;
    return target;
  }
  getStyle(colorSpace = SRGBColorSpace) {
    ColorManagement.fromWorkingColorSpace(_color.copy(this), colorSpace);
    const r = _color.r, g = _color.g, b = _color.b;
    if (colorSpace !== SRGBColorSpace) {
      return `color(${colorSpace} ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)})`;
    }
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }
  offsetHSL(h, s, l) {
    this.getHSL(_hslA);
    return this.setHSL(_hslA.h + h, _hslA.s + s, _hslA.l + l);
  }
  add(color) {
    this.r += color.r;
    this.g += color.g;
    this.b += color.b;
    return this;
  }
  addColors(color1, color2) {
    this.r = color1.r + color2.r;
    this.g = color1.g + color2.g;
    this.b = color1.b + color2.b;
    return this;
  }
  addScalar(s) {
    this.r += s;
    this.g += s;
    this.b += s;
    return this;
  }
  sub(color) {
    this.r = Math.max(0, this.r - color.r);
    this.g = Math.max(0, this.g - color.g);
    this.b = Math.max(0, this.b - color.b);
    return this;
  }
  multiply(color) {
    this.r *= color.r;
    this.g *= color.g;
    this.b *= color.b;
    return this;
  }
  multiplyScalar(s) {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }
  lerp(color, alpha) {
    this.r += (color.r - this.r) * alpha;
    this.g += (color.g - this.g) * alpha;
    this.b += (color.b - this.b) * alpha;
    return this;
  }
  lerpColors(color1, color2, alpha) {
    this.r = color1.r + (color2.r - color1.r) * alpha;
    this.g = color1.g + (color2.g - color1.g) * alpha;
    this.b = color1.b + (color2.b - color1.b) * alpha;
    return this;
  }
  lerpHSL(color, alpha) {
    this.getHSL(_hslA);
    color.getHSL(_hslB);
    const h = lerp(_hslA.h, _hslB.h, alpha);
    const s = lerp(_hslA.s, _hslB.s, alpha);
    const l = lerp(_hslA.l, _hslB.l, alpha);
    this.setHSL(h, s, l);
    return this;
  }
  setFromVector3(v) {
    this.r = v.x;
    this.g = v.y;
    this.b = v.z;
    return this;
  }
  applyMatrix3(m) {
    const r = this.r, g = this.g, b = this.b;
    const e = m.elements;
    this.r = e[0] * r + e[3] * g + e[6] * b;
    this.g = e[1] * r + e[4] * g + e[7] * b;
    this.b = e[2] * r + e[5] * g + e[8] * b;
    return this;
  }
  equals(c) {
    return c.r === this.r && c.g === this.g && c.b === this.b;
  }
  fromArray(array, offset = 0) {
    this.r = array[offset];
    this.g = array[offset + 1];
    this.b = array[offset + 2];
    return this;
  }
  toArray(array = [], offset = 0) {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;
    return array;
  }
  fromBufferAttribute(attribute, index) {
    this.r = attribute.getX(index);
    this.g = attribute.getY(index);
    this.b = attribute.getZ(index);
    return this;
  }
  toJSON() {
    return this.getHex();
  }
  *[Symbol.iterator]() {
    yield this.r;
    yield this.g;
    yield this.b;
  }
};
var _color = /* @__PURE__ */ new Color();
Color.NAMES = _colorKeywords;
var _materialId = 0;
var Material = class extends EventDispatcher {
  constructor() {
    super();
    this.isMaterial = true;
    Object.defineProperty(this, "id", { value: _materialId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.type = "Material";
    this.blending = NormalBlending;
    this.side = FrontSide;
    this.vertexColors = false;
    this.opacity = 1;
    this.transparent = false;
    this.alphaHash = false;
    this.blendSrc = SrcAlphaFactor;
    this.blendDst = OneMinusSrcAlphaFactor;
    this.blendEquation = AddEquation;
    this.blendSrcAlpha = null;
    this.blendDstAlpha = null;
    this.blendEquationAlpha = null;
    this.blendColor = new Color(0, 0, 0);
    this.blendAlpha = 0;
    this.depthFunc = LessEqualDepth;
    this.depthTest = true;
    this.depthWrite = true;
    this.stencilWriteMask = 255;
    this.stencilFunc = AlwaysStencilFunc;
    this.stencilRef = 0;
    this.stencilFuncMask = 255;
    this.stencilFail = KeepStencilOp;
    this.stencilZFail = KeepStencilOp;
    this.stencilZPass = KeepStencilOp;
    this.stencilWrite = false;
    this.clippingPlanes = null;
    this.clipIntersection = false;
    this.clipShadows = false;
    this.shadowSide = null;
    this.colorWrite = true;
    this.precision = null;
    this.polygonOffset = false;
    this.polygonOffsetFactor = 0;
    this.polygonOffsetUnits = 0;
    this.dithering = false;
    this.alphaToCoverage = false;
    this.premultipliedAlpha = false;
    this.forceSinglePass = false;
    this.visible = true;
    this.toneMapped = true;
    this.userData = {};
    this.version = 0;
    this._alphaTest = 0;
  }
  get alphaTest() {
    return this._alphaTest;
  }
  set alphaTest(value) {
    if (this._alphaTest > 0 !== value > 0) {
      this.version++;
    }
    this._alphaTest = value;
  }
  onBuild() {
  }
  onBeforeRender() {
  }
  onBeforeCompile() {
  }
  customProgramCacheKey() {
    return this.onBeforeCompile.toString();
  }
  setValues(values) {
    if (values === void 0) return;
    for (const key in values) {
      const newValue = values[key];
      if (newValue === void 0) {
        console.warn(`THREE.Material: parameter '${key}' has value of undefined.`);
        continue;
      }
      const currentValue = this[key];
      if (currentValue === void 0) {
        console.warn(`THREE.Material: '${key}' is not a property of THREE.${this.type}.`);
        continue;
      }
      if (currentValue && currentValue.isColor) {
        currentValue.set(newValue);
      } else if (currentValue && currentValue.isVector3 && (newValue && newValue.isVector3)) {
        currentValue.copy(newValue);
      } else {
        this[key] = newValue;
      }
    }
  }
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (isRootObject) {
      meta = {
        textures: {},
        images: {}
      };
    }
    const data = {
      metadata: {
        version: 4.6,
        type: "Material",
        generator: "Material.toJSON"
      }
    };
    data.uuid = this.uuid;
    data.type = this.type;
    if (this.name !== "") data.name = this.name;
    if (this.color && this.color.isColor) data.color = this.color.getHex();
    if (this.roughness !== void 0) data.roughness = this.roughness;
    if (this.metalness !== void 0) data.metalness = this.metalness;
    if (this.sheen !== void 0) data.sheen = this.sheen;
    if (this.sheenColor && this.sheenColor.isColor) data.sheenColor = this.sheenColor.getHex();
    if (this.sheenRoughness !== void 0) data.sheenRoughness = this.sheenRoughness;
    if (this.emissive && this.emissive.isColor) data.emissive = this.emissive.getHex();
    if (this.emissiveIntensity !== void 0 && this.emissiveIntensity !== 1) data.emissiveIntensity = this.emissiveIntensity;
    if (this.specular && this.specular.isColor) data.specular = this.specular.getHex();
    if (this.specularIntensity !== void 0) data.specularIntensity = this.specularIntensity;
    if (this.specularColor && this.specularColor.isColor) data.specularColor = this.specularColor.getHex();
    if (this.shininess !== void 0) data.shininess = this.shininess;
    if (this.clearcoat !== void 0) data.clearcoat = this.clearcoat;
    if (this.clearcoatRoughness !== void 0) data.clearcoatRoughness = this.clearcoatRoughness;
    if (this.clearcoatMap && this.clearcoatMap.isTexture) {
      data.clearcoatMap = this.clearcoatMap.toJSON(meta).uuid;
    }
    if (this.clearcoatRoughnessMap && this.clearcoatRoughnessMap.isTexture) {
      data.clearcoatRoughnessMap = this.clearcoatRoughnessMap.toJSON(meta).uuid;
    }
    if (this.clearcoatNormalMap && this.clearcoatNormalMap.isTexture) {
      data.clearcoatNormalMap = this.clearcoatNormalMap.toJSON(meta).uuid;
      data.clearcoatNormalScale = this.clearcoatNormalScale.toArray();
    }
    if (this.dispersion !== void 0) data.dispersion = this.dispersion;
    if (this.iridescence !== void 0) data.iridescence = this.iridescence;
    if (this.iridescenceIOR !== void 0) data.iridescenceIOR = this.iridescenceIOR;
    if (this.iridescenceThicknessRange !== void 0) data.iridescenceThicknessRange = this.iridescenceThicknessRange;
    if (this.iridescenceMap && this.iridescenceMap.isTexture) {
      data.iridescenceMap = this.iridescenceMap.toJSON(meta).uuid;
    }
    if (this.iridescenceThicknessMap && this.iridescenceThicknessMap.isTexture) {
      data.iridescenceThicknessMap = this.iridescenceThicknessMap.toJSON(meta).uuid;
    }
    if (this.anisotropy !== void 0) data.anisotropy = this.anisotropy;
    if (this.anisotropyRotation !== void 0) data.anisotropyRotation = this.anisotropyRotation;
    if (this.anisotropyMap && this.anisotropyMap.isTexture) {
      data.anisotropyMap = this.anisotropyMap.toJSON(meta).uuid;
    }
    if (this.map && this.map.isTexture) data.map = this.map.toJSON(meta).uuid;
    if (this.matcap && this.matcap.isTexture) data.matcap = this.matcap.toJSON(meta).uuid;
    if (this.alphaMap && this.alphaMap.isTexture) data.alphaMap = this.alphaMap.toJSON(meta).uuid;
    if (this.lightMap && this.lightMap.isTexture) {
      data.lightMap = this.lightMap.toJSON(meta).uuid;
      data.lightMapIntensity = this.lightMapIntensity;
    }
    if (this.aoMap && this.aoMap.isTexture) {
      data.aoMap = this.aoMap.toJSON(meta).uuid;
      data.aoMapIntensity = this.aoMapIntensity;
    }
    if (this.bumpMap && this.bumpMap.isTexture) {
      data.bumpMap = this.bumpMap.toJSON(meta).uuid;
      data.bumpScale = this.bumpScale;
    }
    if (this.normalMap && this.normalMap.isTexture) {
      data.normalMap = this.normalMap.toJSON(meta).uuid;
      data.normalMapType = this.normalMapType;
      data.normalScale = this.normalScale.toArray();
    }
    if (this.displacementMap && this.displacementMap.isTexture) {
      data.displacementMap = this.displacementMap.toJSON(meta).uuid;
      data.displacementScale = this.displacementScale;
      data.displacementBias = this.displacementBias;
    }
    if (this.roughnessMap && this.roughnessMap.isTexture) data.roughnessMap = this.roughnessMap.toJSON(meta).uuid;
    if (this.metalnessMap && this.metalnessMap.isTexture) data.metalnessMap = this.metalnessMap.toJSON(meta).uuid;
    if (this.emissiveMap && this.emissiveMap.isTexture) data.emissiveMap = this.emissiveMap.toJSON(meta).uuid;
    if (this.specularMap && this.specularMap.isTexture) data.specularMap = this.specularMap.toJSON(meta).uuid;
    if (this.specularIntensityMap && this.specularIntensityMap.isTexture) data.specularIntensityMap = this.specularIntensityMap.toJSON(meta).uuid;
    if (this.specularColorMap && this.specularColorMap.isTexture) data.specularColorMap = this.specularColorMap.toJSON(meta).uuid;
    if (this.envMap && this.envMap.isTexture) {
      data.envMap = this.envMap.toJSON(meta).uuid;
      if (this.combine !== void 0) data.combine = this.combine;
    }
    if (this.envMapRotation !== void 0) data.envMapRotation = this.envMapRotation.toArray();
    if (this.envMapIntensity !== void 0) data.envMapIntensity = this.envMapIntensity;
    if (this.reflectivity !== void 0) data.reflectivity = this.reflectivity;
    if (this.refractionRatio !== void 0) data.refractionRatio = this.refractionRatio;
    if (this.gradientMap && this.gradientMap.isTexture) {
      data.gradientMap = this.gradientMap.toJSON(meta).uuid;
    }
    if (this.transmission !== void 0) data.transmission = this.transmission;
    if (this.transmissionMap && this.transmissionMap.isTexture) data.transmissionMap = this.transmissionMap.toJSON(meta).uuid;
    if (this.thickness !== void 0) data.thickness = this.thickness;
    if (this.thicknessMap && this.thicknessMap.isTexture) data.thicknessMap = this.thicknessMap.toJSON(meta).uuid;
    if (this.attenuationDistance !== void 0 && this.attenuationDistance !== Infinity) data.attenuationDistance = this.attenuationDistance;
    if (this.attenuationColor !== void 0) data.attenuationColor = this.attenuationColor.getHex();
    if (this.size !== void 0) data.size = this.size;
    if (this.shadowSide !== null) data.shadowSide = this.shadowSide;
    if (this.sizeAttenuation !== void 0) data.sizeAttenuation = this.sizeAttenuation;
    if (this.blending !== NormalBlending) data.blending = this.blending;
    if (this.side !== FrontSide) data.side = this.side;
    if (this.vertexColors === true) data.vertexColors = true;
    if (this.opacity < 1) data.opacity = this.opacity;
    if (this.transparent === true) data.transparent = true;
    if (this.blendSrc !== SrcAlphaFactor) data.blendSrc = this.blendSrc;
    if (this.blendDst !== OneMinusSrcAlphaFactor) data.blendDst = this.blendDst;
    if (this.blendEquation !== AddEquation) data.blendEquation = this.blendEquation;
    if (this.blendSrcAlpha !== null) data.blendSrcAlpha = this.blendSrcAlpha;
    if (this.blendDstAlpha !== null) data.blendDstAlpha = this.blendDstAlpha;
    if (this.blendEquationAlpha !== null) data.blendEquationAlpha = this.blendEquationAlpha;
    if (this.blendColor && this.blendColor.isColor) data.blendColor = this.blendColor.getHex();
    if (this.blendAlpha !== 0) data.blendAlpha = this.blendAlpha;
    if (this.depthFunc !== LessEqualDepth) data.depthFunc = this.depthFunc;
    if (this.depthTest === false) data.depthTest = this.depthTest;
    if (this.depthWrite === false) data.depthWrite = this.depthWrite;
    if (this.colorWrite === false) data.colorWrite = this.colorWrite;
    if (this.stencilWriteMask !== 255) data.stencilWriteMask = this.stencilWriteMask;
    if (this.stencilFunc !== AlwaysStencilFunc) data.stencilFunc = this.stencilFunc;
    if (this.stencilRef !== 0) data.stencilRef = this.stencilRef;
    if (this.stencilFuncMask !== 255) data.stencilFuncMask = this.stencilFuncMask;
    if (this.stencilFail !== KeepStencilOp) data.stencilFail = this.stencilFail;
    if (this.stencilZFail !== KeepStencilOp) data.stencilZFail = this.stencilZFail;
    if (this.stencilZPass !== KeepStencilOp) data.stencilZPass = this.stencilZPass;
    if (this.stencilWrite === true) data.stencilWrite = this.stencilWrite;
    if (this.rotation !== void 0 && this.rotation !== 0) data.rotation = this.rotation;
    if (this.polygonOffset === true) data.polygonOffset = true;
    if (this.polygonOffsetFactor !== 0) data.polygonOffsetFactor = this.polygonOffsetFactor;
    if (this.polygonOffsetUnits !== 0) data.polygonOffsetUnits = this.polygonOffsetUnits;
    if (this.linewidth !== void 0 && this.linewidth !== 1) data.linewidth = this.linewidth;
    if (this.dashSize !== void 0) data.dashSize = this.dashSize;
    if (this.gapSize !== void 0) data.gapSize = this.gapSize;
    if (this.scale !== void 0) data.scale = this.scale;
    if (this.dithering === true) data.dithering = true;
    if (this.alphaTest > 0) data.alphaTest = this.alphaTest;
    if (this.alphaHash === true) data.alphaHash = true;
    if (this.alphaToCoverage === true) data.alphaToCoverage = true;
    if (this.premultipliedAlpha === true) data.premultipliedAlpha = true;
    if (this.forceSinglePass === true) data.forceSinglePass = true;
    if (this.wireframe === true) data.wireframe = true;
    if (this.wireframeLinewidth > 1) data.wireframeLinewidth = this.wireframeLinewidth;
    if (this.wireframeLinecap !== "round") data.wireframeLinecap = this.wireframeLinecap;
    if (this.wireframeLinejoin !== "round") data.wireframeLinejoin = this.wireframeLinejoin;
    if (this.flatShading === true) data.flatShading = true;
    if (this.visible === false) data.visible = false;
    if (this.toneMapped === false) data.toneMapped = false;
    if (this.fog === false) data.fog = false;
    if (Object.keys(this.userData).length > 0) data.userData = this.userData;
    function extractFromCache(cache) {
      const values = [];
      for (const key in cache) {
        const data2 = cache[key];
        delete data2.metadata;
        values.push(data2);
      }
      return values;
    }
    if (isRootObject) {
      const textures = extractFromCache(meta.textures);
      const images = extractFromCache(meta.images);
      if (textures.length > 0) data.textures = textures;
      if (images.length > 0) data.images = images;
    }
    return data;
  }
  clone() {
    return new this.constructor().copy(this);
  }
  copy(source) {
    this.name = source.name;
    this.blending = source.blending;
    this.side = source.side;
    this.vertexColors = source.vertexColors;
    this.opacity = source.opacity;
    this.transparent = source.transparent;
    this.blendSrc = source.blendSrc;
    this.blendDst = source.blendDst;
    this.blendEquation = source.blendEquation;
    this.blendSrcAlpha = source.blendSrcAlpha;
    this.blendDstAlpha = source.blendDstAlpha;
    this.blendEquationAlpha = source.blendEquationAlpha;
    this.blendColor.copy(source.blendColor);
    this.blendAlpha = source.blendAlpha;
    this.depthFunc = source.depthFunc;
    this.depthTest = source.depthTest;
    this.depthWrite = source.depthWrite;
    this.stencilWriteMask = source.stencilWriteMask;
    this.stencilFunc = source.stencilFunc;
    this.stencilRef = source.stencilRef;
    this.stencilFuncMask = source.stencilFuncMask;
    this.stencilFail = source.stencilFail;
    this.stencilZFail = source.stencilZFail;
    this.stencilZPass = source.stencilZPass;
    this.stencilWrite = source.stencilWrite;
    const srcPlanes = source.clippingPlanes;
    let dstPlanes = null;
    if (srcPlanes !== null) {
      const n = srcPlanes.length;
      dstPlanes = new Array(n);
      for (let i = 0; i !== n; ++i) {
        dstPlanes[i] = srcPlanes[i].clone();
      }
    }
    this.clippingPlanes = dstPlanes;
    this.clipIntersection = source.clipIntersection;
    this.clipShadows = source.clipShadows;
    this.shadowSide = source.shadowSide;
    this.colorWrite = source.colorWrite;
    this.precision = source.precision;
    this.polygonOffset = source.polygonOffset;
    this.polygonOffsetFactor = source.polygonOffsetFactor;
    this.polygonOffsetUnits = source.polygonOffsetUnits;
    this.dithering = source.dithering;
    this.alphaTest = source.alphaTest;
    this.alphaHash = source.alphaHash;
    this.alphaToCoverage = source.alphaToCoverage;
    this.premultipliedAlpha = source.premultipliedAlpha;
    this.forceSinglePass = source.forceSinglePass;
    this.visible = source.visible;
    this.toneMapped = source.toneMapped;
    this.userData = JSON.parse(JSON.stringify(source.userData));
    return this;
  }
  dispose() {
    this.dispatchEvent({ type: "dispose" });
  }
  set needsUpdate(value) {
    if (value === true) this.version++;
  }
};
var MeshBasicMaterial = class extends Material {
  constructor(parameters) {
    super();
    this.isMeshBasicMaterial = true;
    this.type = "MeshBasicMaterial";
    this.color = new Color(16777215);
    this.map = null;
    this.lightMap = null;
    this.lightMapIntensity = 1;
    this.aoMap = null;
    this.aoMapIntensity = 1;
    this.specularMap = null;
    this.alphaMap = null;
    this.envMap = null;
    this.envMapRotation = new Euler();
    this.combine = MultiplyOperation;
    this.reflectivity = 1;
    this.refractionRatio = 0.98;
    this.wireframe = false;
    this.wireframeLinewidth = 1;
    this.wireframeLinecap = "round";
    this.wireframeLinejoin = "round";
    this.fog = true;
    this.setValues(parameters);
  }
  copy(source) {
    super.copy(source);
    this.color.copy(source.color);
    this.map = source.map;
    this.lightMap = source.lightMap;
    this.lightMapIntensity = source.lightMapIntensity;
    this.aoMap = source.aoMap;
    this.aoMapIntensity = source.aoMapIntensity;
    this.specularMap = source.specularMap;
    this.alphaMap = source.alphaMap;
    this.envMap = source.envMap;
    this.envMapRotation.copy(source.envMapRotation);
    this.combine = source.combine;
    this.reflectivity = source.reflectivity;
    this.refractionRatio = source.refractionRatio;
    this.wireframe = source.wireframe;
    this.wireframeLinewidth = source.wireframeLinewidth;
    this.wireframeLinecap = source.wireframeLinecap;
    this.wireframeLinejoin = source.wireframeLinejoin;
    this.fog = source.fog;
    return this;
  }
};
var _vector$9 = /* @__PURE__ */ new Vector3();
var _vector2$1 = /* @__PURE__ */ new Vector2();
var BufferAttribute = class {
  constructor(array, itemSize, normalized = false) {
    if (Array.isArray(array)) {
      throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");
    }
    this.isBufferAttribute = true;
    this.name = "";
    this.array = array;
    this.itemSize = itemSize;
    this.count = array !== void 0 ? array.length / itemSize : 0;
    this.normalized = normalized;
    this.usage = StaticDrawUsage;
    this._updateRange = { offset: 0, count: -1 };
    this.updateRanges = [];
    this.gpuType = FloatType;
    this.version = 0;
  }
  onUploadCallback() {
  }
  set needsUpdate(value) {
    if (value === true) this.version++;
  }
  get updateRange() {
    warnOnce("THREE.BufferAttribute: updateRange() is deprecated and will be removed in r169. Use addUpdateRange() instead.");
    return this._updateRange;
  }
  setUsage(value) {
    this.usage = value;
    return this;
  }
  addUpdateRange(start, count) {
    this.updateRanges.push({ start, count });
  }
  clearUpdateRanges() {
    this.updateRanges.length = 0;
  }
  copy(source) {
    this.name = source.name;
    this.array = new source.array.constructor(source.array);
    this.itemSize = source.itemSize;
    this.count = source.count;
    this.normalized = source.normalized;
    this.usage = source.usage;
    this.gpuType = source.gpuType;
    return this;
  }
  copyAt(index1, attribute, index2) {
    index1 *= this.itemSize;
    index2 *= attribute.itemSize;
    for (let i = 0, l = this.itemSize; i < l; i++) {
      this.array[index1 + i] = attribute.array[index2 + i];
    }
    return this;
  }
  copyArray(array) {
    this.array.set(array);
    return this;
  }
  applyMatrix3(m) {
    if (this.itemSize === 2) {
      for (let i = 0, l = this.count; i < l; i++) {
        _vector2$1.fromBufferAttribute(this, i);
        _vector2$1.applyMatrix3(m);
        this.setXY(i, _vector2$1.x, _vector2$1.y);
      }
    } else if (this.itemSize === 3) {
      for (let i = 0, l = this.count; i < l; i++) {
        _vector$9.fromBufferAttribute(this, i);
        _vector$9.applyMatrix3(m);
        this.setXYZ(i, _vector$9.x, _vector$9.y, _vector$9.z);
      }
    }
    return this;
  }
  applyMatrix4(m) {
    for (let i = 0, l = this.count; i < l; i++) {
      _vector$9.fromBufferAttribute(this, i);
      _vector$9.applyMatrix4(m);
      this.setXYZ(i, _vector$9.x, _vector$9.y, _vector$9.z);
    }
    return this;
  }
  applyNormalMatrix(m) {
    for (let i = 0, l = this.count; i < l; i++) {
      _vector$9.fromBufferAttribute(this, i);
      _vector$9.applyNormalMatrix(m);
      this.setXYZ(i, _vector$9.x, _vector$9.y, _vector$9.z);
    }
    return this;
  }
  transformDirection(m) {
    for (let i = 0, l = this.count; i < l; i++) {
      _vector$9.fromBufferAttribute(this, i);
      _vector$9.transformDirection(m);
      this.setXYZ(i, _vector$9.x, _vector$9.y, _vector$9.z);
    }
    return this;
  }
  set(value, offset = 0) {
    this.array.set(value, offset);
    return this;
  }
  getComponent(index, component) {
    let value = this.array[index * this.itemSize + component];
    if (this.normalized) value = denormalize(value, this.array);
    return value;
  }
  setComponent(index, component, value) {
    if (this.normalized) value = normalize(value, this.array);
    this.array[index * this.itemSize + component] = value;
    return this;
  }
  getX(index) {
    let x = this.array[index * this.itemSize];
    if (this.normalized) x = denormalize(x, this.array);
    return x;
  }
  setX(index, x) {
    if (this.normalized) x = normalize(x, this.array);
    this.array[index * this.itemSize] = x;
    return this;
  }
  getY(index) {
    let y = this.array[index * this.itemSize + 1];
    if (this.normalized) y = denormalize(y, this.array);
    return y;
  }
  setY(index, y) {
    if (this.normalized) y = normalize(y, this.array);
    this.array[index * this.itemSize + 1] = y;
    return this;
  }
  getZ(index) {
    let z = this.array[index * this.itemSize + 2];
    if (this.normalized) z = denormalize(z, this.array);
    return z;
  }
  setZ(index, z) {
    if (this.normalized) z = normalize(z, this.array);
    this.array[index * this.itemSize + 2] = z;
    return this;
  }
  getW(index) {
    let w = this.array[index * this.itemSize + 3];
    if (this.normalized) w = denormalize(w, this.array);
    return w;
  }
  setW(index, w) {
    if (this.normalized) w = normalize(w, this.array);
    this.array[index * this.itemSize + 3] = w;
    return this;
  }
  setXY(index, x, y) {
    index *= this.itemSize;
    if (this.normalized) {
      x = normalize(x, this.array);
      y = normalize(y, this.array);
    }
    this.array[index + 0] = x;
    this.array[index + 1] = y;
    return this;
  }
  setXYZ(index, x, y, z) {
    index *= this.itemSize;
    if (this.normalized) {
      x = normalize(x, this.array);
      y = normalize(y, this.array);
      z = normalize(z, this.array);
    }
    this.array[index + 0] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;
    return this;
  }
  setXYZW(index, x, y, z, w) {
    index *= this.itemSize;
    if (this.normalized) {
      x = normalize(x, this.array);
      y = normalize(y, this.array);
      z = normalize(z, this.array);
      w = normalize(w, this.array);
    }
    this.array[index + 0] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;
    this.array[index + 3] = w;
    return this;
  }
  onUpload(callback) {
    this.onUploadCallback = callback;
    return this;
  }
  clone() {
    return new this.constructor(this.array, this.itemSize).copy(this);
  }
  toJSON() {
    const data = {
      itemSize: this.itemSize,
      type: this.array.constructor.name,
      array: Array.from(this.array),
      normalized: this.normalized
    };
    if (this.name !== "") data.name = this.name;
    if (this.usage !== StaticDrawUsage) data.usage = this.usage;
    return data;
  }
};
var Uint16BufferAttribute = class extends BufferAttribute {
  constructor(array, itemSize, normalized) {
    super(new Uint16Array(array), itemSize, normalized);
  }
};
var Uint32BufferAttribute = class extends BufferAttribute {
  constructor(array, itemSize, normalized) {
    super(new Uint32Array(array), itemSize, normalized);
  }
};
var Float32BufferAttribute = class extends BufferAttribute {
  constructor(array, itemSize, normalized) {
    super(new Float32Array(array), itemSize, normalized);
  }
};
var _id$2 = 0;
var _m1$2 = /* @__PURE__ */ new Matrix4();
var _obj = /* @__PURE__ */ new Object3D();
var _offset = /* @__PURE__ */ new Vector3();
var _box$2 = /* @__PURE__ */ new Box3();
var _boxMorphTargets = /* @__PURE__ */ new Box3();
var _vector$8 = /* @__PURE__ */ new Vector3();
var BufferGeometry = class _BufferGeometry extends EventDispatcher {
  constructor() {
    super();
    this.isBufferGeometry = true;
    Object.defineProperty(this, "id", { value: _id$2++ });
    this.uuid = generateUUID();
    this.name = "";
    this.type = "BufferGeometry";
    this.index = null;
    this.attributes = {};
    this.morphAttributes = {};
    this.morphTargetsRelative = false;
    this.groups = [];
    this.boundingBox = null;
    this.boundingSphere = null;
    this.drawRange = { start: 0, count: Infinity };
    this.userData = {};
  }
  getIndex() {
    return this.index;
  }
  setIndex(index) {
    if (Array.isArray(index)) {
      this.index = new (arrayNeedsUint32(index) ? Uint32BufferAttribute : Uint16BufferAttribute)(index, 1);
    } else {
      this.index = index;
    }
    return this;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
    return this;
  }
  deleteAttribute(name) {
    delete this.attributes[name];
    return this;
  }
  hasAttribute(name) {
    return this.attributes[name] !== void 0;
  }
  addGroup(start, count, materialIndex = 0) {
    this.groups.push({
      start,
      count,
      materialIndex
    });
  }
  clearGroups() {
    this.groups = [];
  }
  setDrawRange(start, count) {
    this.drawRange.start = start;
    this.drawRange.count = count;
  }
  applyMatrix4(matrix) {
    const position = this.attributes.position;
    if (position !== void 0) {
      position.applyMatrix4(matrix);
      position.needsUpdate = true;
    }
    const normal = this.attributes.normal;
    if (normal !== void 0) {
      const normalMatrix = new Matrix3().getNormalMatrix(matrix);
      normal.applyNormalMatrix(normalMatrix);
      normal.needsUpdate = true;
    }
    const tangent = this.attributes.tangent;
    if (tangent !== void 0) {
      tangent.transformDirection(matrix);
      tangent.needsUpdate = true;
    }
    if (this.boundingBox !== null) {
      this.computeBoundingBox();
    }
    if (this.boundingSphere !== null) {
      this.computeBoundingSphere();
    }
    return this;
  }
  applyQuaternion(q) {
    _m1$2.makeRotationFromQuaternion(q);
    this.applyMatrix4(_m1$2);
    return this;
  }
  rotateX(angle) {
    _m1$2.makeRotationX(angle);
    this.applyMatrix4(_m1$2);
    return this;
  }
  rotateY(angle) {
    _m1$2.makeRotationY(angle);
    this.applyMatrix4(_m1$2);
    return this;
  }
  rotateZ(angle) {
    _m1$2.makeRotationZ(angle);
    this.applyMatrix4(_m1$2);
    return this;
  }
  translate(x, y, z) {
    _m1$2.makeTranslation(x, y, z);
    this.applyMatrix4(_m1$2);
    return this;
  }
  scale(x, y, z) {
    _m1$2.makeScale(x, y, z);
    this.applyMatrix4(_m1$2);
    return this;
  }
  lookAt(vector) {
    _obj.lookAt(vector);
    _obj.updateMatrix();
    this.applyMatrix4(_obj.matrix);
    return this;
  }
  center() {
    this.computeBoundingBox();
    this.boundingBox.getCenter(_offset).negate();
    this.translate(_offset.x, _offset.y, _offset.z);
    return this;
  }
  setFromPoints(points) {
    const position = [];
    for (let i = 0, l = points.length; i < l; i++) {
      const point = points[i];
      position.push(point.x, point.y, point.z || 0);
    }
    this.setAttribute("position", new Float32BufferAttribute(position, 3));
    return this;
  }
  computeBoundingBox() {
    if (this.boundingBox === null) {
      this.boundingBox = new Box3();
    }
    const position = this.attributes.position;
    const morphAttributesPosition = this.morphAttributes.position;
    if (position && position.isGLBufferAttribute) {
      console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.", this);
      this.boundingBox.set(
        new Vector3(-Infinity, -Infinity, -Infinity),
        new Vector3(Infinity, Infinity, Infinity)
      );
      return;
    }
    if (position !== void 0) {
      this.boundingBox.setFromBufferAttribute(position);
      if (morphAttributesPosition) {
        for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
          const morphAttribute = morphAttributesPosition[i];
          _box$2.setFromBufferAttribute(morphAttribute);
          if (this.morphTargetsRelative) {
            _vector$8.addVectors(this.boundingBox.min, _box$2.min);
            this.boundingBox.expandByPoint(_vector$8);
            _vector$8.addVectors(this.boundingBox.max, _box$2.max);
            this.boundingBox.expandByPoint(_vector$8);
          } else {
            this.boundingBox.expandByPoint(_box$2.min);
            this.boundingBox.expandByPoint(_box$2.max);
          }
        }
      }
    } else {
      this.boundingBox.makeEmpty();
    }
    if (isNaN(this.boundingBox.min.x) || isNaN(this.boundingBox.min.y) || isNaN(this.boundingBox.min.z)) {
      console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.', this);
    }
  }
  computeBoundingSphere() {
    if (this.boundingSphere === null) {
      this.boundingSphere = new Sphere();
    }
    const position = this.attributes.position;
    const morphAttributesPosition = this.morphAttributes.position;
    if (position && position.isGLBufferAttribute) {
      console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.", this);
      this.boundingSphere.set(new Vector3(), Infinity);
      return;
    }
    if (position) {
      const center = this.boundingSphere.center;
      _box$2.setFromBufferAttribute(position);
      if (morphAttributesPosition) {
        for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
          const morphAttribute = morphAttributesPosition[i];
          _boxMorphTargets.setFromBufferAttribute(morphAttribute);
          if (this.morphTargetsRelative) {
            _vector$8.addVectors(_box$2.min, _boxMorphTargets.min);
            _box$2.expandByPoint(_vector$8);
            _vector$8.addVectors(_box$2.max, _boxMorphTargets.max);
            _box$2.expandByPoint(_vector$8);
          } else {
            _box$2.expandByPoint(_boxMorphTargets.min);
            _box$2.expandByPoint(_boxMorphTargets.max);
          }
        }
      }
      _box$2.getCenter(center);
      let maxRadiusSq = 0;
      for (let i = 0, il = position.count; i < il; i++) {
        _vector$8.fromBufferAttribute(position, i);
        maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(_vector$8));
      }
      if (morphAttributesPosition) {
        for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
          const morphAttribute = morphAttributesPosition[i];
          const morphTargetsRelative = this.morphTargetsRelative;
          for (let j = 0, jl = morphAttribute.count; j < jl; j++) {
            _vector$8.fromBufferAttribute(morphAttribute, j);
            if (morphTargetsRelative) {
              _offset.fromBufferAttribute(position, j);
              _vector$8.add(_offset);
            }
            maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(_vector$8));
          }
        }
      }
      this.boundingSphere.radius = Math.sqrt(maxRadiusSq);
      if (isNaN(this.boundingSphere.radius)) {
        console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.', this);
      }
    }
  }
  computeTangents() {
    const index = this.index;
    const attributes = this.attributes;
    if (index === null || attributes.position === void 0 || attributes.normal === void 0 || attributes.uv === void 0) {
      console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");
      return;
    }
    const positionAttribute = attributes.position;
    const normalAttribute = attributes.normal;
    const uvAttribute = attributes.uv;
    if (this.hasAttribute("tangent") === false) {
      this.setAttribute("tangent", new BufferAttribute(new Float32Array(4 * positionAttribute.count), 4));
    }
    const tangentAttribute = this.getAttribute("tangent");
    const tan1 = [], tan2 = [];
    for (let i = 0; i < positionAttribute.count; i++) {
      tan1[i] = new Vector3();
      tan2[i] = new Vector3();
    }
    const vA = new Vector3(), vB = new Vector3(), vC = new Vector3(), uvA = new Vector2(), uvB = new Vector2(), uvC = new Vector2(), sdir = new Vector3(), tdir = new Vector3();
    function handleTriangle(a, b, c) {
      vA.fromBufferAttribute(positionAttribute, a);
      vB.fromBufferAttribute(positionAttribute, b);
      vC.fromBufferAttribute(positionAttribute, c);
      uvA.fromBufferAttribute(uvAttribute, a);
      uvB.fromBufferAttribute(uvAttribute, b);
      uvC.fromBufferAttribute(uvAttribute, c);
      vB.sub(vA);
      vC.sub(vA);
      uvB.sub(uvA);
      uvC.sub(uvA);
      const r = 1 / (uvB.x * uvC.y - uvC.x * uvB.y);
      if (!isFinite(r)) return;
      sdir.copy(vB).multiplyScalar(uvC.y).addScaledVector(vC, -uvB.y).multiplyScalar(r);
      tdir.copy(vC).multiplyScalar(uvB.x).addScaledVector(vB, -uvC.x).multiplyScalar(r);
      tan1[a].add(sdir);
      tan1[b].add(sdir);
      tan1[c].add(sdir);
      tan2[a].add(tdir);
      tan2[b].add(tdir);
      tan2[c].add(tdir);
    }
    let groups = this.groups;
    if (groups.length === 0) {
      groups = [{
        start: 0,
        count: index.count
      }];
    }
    for (let i = 0, il = groups.length; i < il; ++i) {
      const group = groups[i];
      const start = group.start;
      const count = group.count;
      for (let j = start, jl = start + count; j < jl; j += 3) {
        handleTriangle(
          index.getX(j + 0),
          index.getX(j + 1),
          index.getX(j + 2)
        );
      }
    }
    const tmp = new Vector3(), tmp2 = new Vector3();
    const n = new Vector3(), n2 = new Vector3();
    function handleVertex(v) {
      n.fromBufferAttribute(normalAttribute, v);
      n2.copy(n);
      const t = tan1[v];
      tmp.copy(t);
      tmp.sub(n.multiplyScalar(n.dot(t))).normalize();
      tmp2.crossVectors(n2, t);
      const test = tmp2.dot(tan2[v]);
      const w = test < 0 ? -1 : 1;
      tangentAttribute.setXYZW(v, tmp.x, tmp.y, tmp.z, w);
    }
    for (let i = 0, il = groups.length; i < il; ++i) {
      const group = groups[i];
      const start = group.start;
      const count = group.count;
      for (let j = start, jl = start + count; j < jl; j += 3) {
        handleVertex(index.getX(j + 0));
        handleVertex(index.getX(j + 1));
        handleVertex(index.getX(j + 2));
      }
    }
  }
  computeVertexNormals() {
    const index = this.index;
    const positionAttribute = this.getAttribute("position");
    if (positionAttribute !== void 0) {
      let normalAttribute = this.getAttribute("normal");
      if (normalAttribute === void 0) {
        normalAttribute = new BufferAttribute(new Float32Array(positionAttribute.count * 3), 3);
        this.setAttribute("normal", normalAttribute);
      } else {
        for (let i = 0, il = normalAttribute.count; i < il; i++) {
          normalAttribute.setXYZ(i, 0, 0, 0);
        }
      }
      const pA = new Vector3(), pB = new Vector3(), pC = new Vector3();
      const nA = new Vector3(), nB = new Vector3(), nC = new Vector3();
      const cb = new Vector3(), ab = new Vector3();
      if (index) {
        for (let i = 0, il = index.count; i < il; i += 3) {
          const vA = index.getX(i + 0);
          const vB = index.getX(i + 1);
          const vC = index.getX(i + 2);
          pA.fromBufferAttribute(positionAttribute, vA);
          pB.fromBufferAttribute(positionAttribute, vB);
          pC.fromBufferAttribute(positionAttribute, vC);
          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab);
          nA.fromBufferAttribute(normalAttribute, vA);
          nB.fromBufferAttribute(normalAttribute, vB);
          nC.fromBufferAttribute(normalAttribute, vC);
          nA.add(cb);
          nB.add(cb);
          nC.add(cb);
          normalAttribute.setXYZ(vA, nA.x, nA.y, nA.z);
          normalAttribute.setXYZ(vB, nB.x, nB.y, nB.z);
          normalAttribute.setXYZ(vC, nC.x, nC.y, nC.z);
        }
      } else {
        for (let i = 0, il = positionAttribute.count; i < il; i += 3) {
          pA.fromBufferAttribute(positionAttribute, i + 0);
          pB.fromBufferAttribute(positionAttribute, i + 1);
          pC.fromBufferAttribute(positionAttribute, i + 2);
          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab);
          normalAttribute.setXYZ(i + 0, cb.x, cb.y, cb.z);
          normalAttribute.setXYZ(i + 1, cb.x, cb.y, cb.z);
          normalAttribute.setXYZ(i + 2, cb.x, cb.y, cb.z);
        }
      }
      this.normalizeNormals();
      normalAttribute.needsUpdate = true;
    }
  }
  normalizeNormals() {
    const normals = this.attributes.normal;
    for (let i = 0, il = normals.count; i < il; i++) {
      _vector$8.fromBufferAttribute(normals, i);
      _vector$8.normalize();
      normals.setXYZ(i, _vector$8.x, _vector$8.y, _vector$8.z);
    }
  }
  toNonIndexed() {
    function convertBufferAttribute(attribute, indices2) {
      const array = attribute.array;
      const itemSize = attribute.itemSize;
      const normalized = attribute.normalized;
      const array2 = new array.constructor(indices2.length * itemSize);
      let index = 0, index2 = 0;
      for (let i = 0, l = indices2.length; i < l; i++) {
        if (attribute.isInterleavedBufferAttribute) {
          index = indices2[i] * attribute.data.stride + attribute.offset;
        } else {
          index = indices2[i] * itemSize;
        }
        for (let j = 0; j < itemSize; j++) {
          array2[index2++] = array[index++];
        }
      }
      return new BufferAttribute(array2, itemSize, normalized);
    }
    if (this.index === null) {
      console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.");
      return this;
    }
    const geometry2 = new _BufferGeometry();
    const indices = this.index.array;
    const attributes = this.attributes;
    for (const name in attributes) {
      const attribute = attributes[name];
      const newAttribute = convertBufferAttribute(attribute, indices);
      geometry2.setAttribute(name, newAttribute);
    }
    const morphAttributes = this.morphAttributes;
    for (const name in morphAttributes) {
      const morphArray = [];
      const morphAttribute = morphAttributes[name];
      for (let i = 0, il = morphAttribute.length; i < il; i++) {
        const attribute = morphAttribute[i];
        const newAttribute = convertBufferAttribute(attribute, indices);
        morphArray.push(newAttribute);
      }
      geometry2.morphAttributes[name] = morphArray;
    }
    geometry2.morphTargetsRelative = this.morphTargetsRelative;
    const groups = this.groups;
    for (let i = 0, l = groups.length; i < l; i++) {
      const group = groups[i];
      geometry2.addGroup(group.start, group.count, group.materialIndex);
    }
    return geometry2;
  }
  toJSON() {
    const data = {
      metadata: {
        version: 4.6,
        type: "BufferGeometry",
        generator: "BufferGeometry.toJSON"
      }
    };
    data.uuid = this.uuid;
    data.type = this.type;
    if (this.name !== "") data.name = this.name;
    if (Object.keys(this.userData).length > 0) data.userData = this.userData;
    if (this.parameters !== void 0) {
      const parameters = this.parameters;
      for (const key in parameters) {
        if (parameters[key] !== void 0) data[key] = parameters[key];
      }
      return data;
    }
    data.data = { attributes: {} };
    const index = this.index;
    if (index !== null) {
      data.data.index = {
        type: index.array.constructor.name,
        array: Array.prototype.slice.call(index.array)
      };
    }
    const attributes = this.attributes;
    for (const key in attributes) {
      const attribute = attributes[key];
      data.data.attributes[key] = attribute.toJSON(data.data);
    }
    const morphAttributes = {};
    let hasMorphAttributes = false;
    for (const key in this.morphAttributes) {
      const attributeArray = this.morphAttributes[key];
      const array = [];
      for (let i = 0, il = attributeArray.length; i < il; i++) {
        const attribute = attributeArray[i];
        array.push(attribute.toJSON(data.data));
      }
      if (array.length > 0) {
        morphAttributes[key] = array;
        hasMorphAttributes = true;
      }
    }
    if (hasMorphAttributes) {
      data.data.morphAttributes = morphAttributes;
      data.data.morphTargetsRelative = this.morphTargetsRelative;
    }
    const groups = this.groups;
    if (groups.length > 0) {
      data.data.groups = JSON.parse(JSON.stringify(groups));
    }
    const boundingSphere = this.boundingSphere;
    if (boundingSphere !== null) {
      data.data.boundingSphere = {
        center: boundingSphere.center.toArray(),
        radius: boundingSphere.radius
      };
    }
    return data;
  }
  clone() {
    return new this.constructor().copy(this);
  }
  copy(source) {
    this.index = null;
    this.attributes = {};
    this.morphAttributes = {};
    this.groups = [];
    this.boundingBox = null;
    this.boundingSphere = null;
    const data = {};
    this.name = source.name;
    const index = source.index;
    if (index !== null) {
      this.setIndex(index.clone(data));
    }
    const attributes = source.attributes;
    for (const name in attributes) {
      const attribute = attributes[name];
      this.setAttribute(name, attribute.clone(data));
    }
    const morphAttributes = source.morphAttributes;
    for (const name in morphAttributes) {
      const array = [];
      const morphAttribute = morphAttributes[name];
      for (let i = 0, l = morphAttribute.length; i < l; i++) {
        array.push(morphAttribute[i].clone(data));
      }
      this.morphAttributes[name] = array;
    }
    this.morphTargetsRelative = source.morphTargetsRelative;
    const groups = source.groups;
    for (let i = 0, l = groups.length; i < l; i++) {
      const group = groups[i];
      this.addGroup(group.start, group.count, group.materialIndex);
    }
    const boundingBox = source.boundingBox;
    if (boundingBox !== null) {
      this.boundingBox = boundingBox.clone();
    }
    const boundingSphere = source.boundingSphere;
    if (boundingSphere !== null) {
      this.boundingSphere = boundingSphere.clone();
    }
    this.drawRange.start = source.drawRange.start;
    this.drawRange.count = source.drawRange.count;
    this.userData = source.userData;
    return this;
  }
  dispose() {
    this.dispatchEvent({ type: "dispose" });
  }
};
var _inverseMatrix$3 = /* @__PURE__ */ new Matrix4();
var _ray$3 = /* @__PURE__ */ new Ray();
var _sphere$6 = /* @__PURE__ */ new Sphere();
var _sphereHitAt = /* @__PURE__ */ new Vector3();
var _vA$1 = /* @__PURE__ */ new Vector3();
var _vB$1 = /* @__PURE__ */ new Vector3();
var _vC$1 = /* @__PURE__ */ new Vector3();
var _tempA = /* @__PURE__ */ new Vector3();
var _morphA = /* @__PURE__ */ new Vector3();
var _uvA$1 = /* @__PURE__ */ new Vector2();
var _uvB$1 = /* @__PURE__ */ new Vector2();
var _uvC$1 = /* @__PURE__ */ new Vector2();
var _normalA = /* @__PURE__ */ new Vector3();
var _normalB = /* @__PURE__ */ new Vector3();
var _normalC = /* @__PURE__ */ new Vector3();
var _intersectionPoint = /* @__PURE__ */ new Vector3();
var _intersectionPointWorld = /* @__PURE__ */ new Vector3();
var Mesh = class extends Object3D {
  constructor(geometry = new BufferGeometry(), material = new MeshBasicMaterial()) {
    super();
    this.isMesh = true;
    this.type = "Mesh";
    this.geometry = geometry;
    this.material = material;
    this.updateMorphTargets();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    if (source.morphTargetInfluences !== void 0) {
      this.morphTargetInfluences = source.morphTargetInfluences.slice();
    }
    if (source.morphTargetDictionary !== void 0) {
      this.morphTargetDictionary = Object.assign({}, source.morphTargetDictionary);
    }
    this.material = Array.isArray(source.material) ? source.material.slice() : source.material;
    this.geometry = source.geometry;
    return this;
  }
  updateMorphTargets() {
    const geometry = this.geometry;
    const morphAttributes = geometry.morphAttributes;
    const keys = Object.keys(morphAttributes);
    if (keys.length > 0) {
      const morphAttribute = morphAttributes[keys[0]];
      if (morphAttribute !== void 0) {
        this.morphTargetInfluences = [];
        this.morphTargetDictionary = {};
        for (let m = 0, ml = morphAttribute.length; m < ml; m++) {
          const name = morphAttribute[m].name || String(m);
          this.morphTargetInfluences.push(0);
          this.morphTargetDictionary[name] = m;
        }
      }
    }
  }
  getVertexPosition(index, target) {
    const geometry = this.geometry;
    const position = geometry.attributes.position;
    const morphPosition = geometry.morphAttributes.position;
    const morphTargetsRelative = geometry.morphTargetsRelative;
    target.fromBufferAttribute(position, index);
    const morphInfluences = this.morphTargetInfluences;
    if (morphPosition && morphInfluences) {
      _morphA.set(0, 0, 0);
      for (let i = 0, il = morphPosition.length; i < il; i++) {
        const influence = morphInfluences[i];
        const morphAttribute = morphPosition[i];
        if (influence === 0) continue;
        _tempA.fromBufferAttribute(morphAttribute, index);
        if (morphTargetsRelative) {
          _morphA.addScaledVector(_tempA, influence);
        } else {
          _morphA.addScaledVector(_tempA.sub(target), influence);
        }
      }
      target.add(_morphA);
    }
    return target;
  }
  raycast(raycaster, intersects2) {
    const geometry = this.geometry;
    const material = this.material;
    const matrixWorld = this.matrixWorld;
    if (material === void 0) return;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    _sphere$6.copy(geometry.boundingSphere);
    _sphere$6.applyMatrix4(matrixWorld);
    _ray$3.copy(raycaster.ray).recast(raycaster.near);
    if (_sphere$6.containsPoint(_ray$3.origin) === false) {
      if (_ray$3.intersectSphere(_sphere$6, _sphereHitAt) === null) return;
      if (_ray$3.origin.distanceToSquared(_sphereHitAt) > (raycaster.far - raycaster.near) ** 2) return;
    }
    _inverseMatrix$3.copy(matrixWorld).invert();
    _ray$3.copy(raycaster.ray).applyMatrix4(_inverseMatrix$3);
    if (geometry.boundingBox !== null) {
      if (_ray$3.intersectsBox(geometry.boundingBox) === false) return;
    }
    this._computeIntersections(raycaster, intersects2, _ray$3);
  }
  _computeIntersections(raycaster, intersects2, rayLocalSpace) {
    let intersection;
    const geometry = this.geometry;
    const material = this.material;
    const index = geometry.index;
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const uv1 = geometry.attributes.uv1;
    const normal = geometry.attributes.normal;
    const groups = geometry.groups;
    const drawRange = geometry.drawRange;
    if (index !== null) {
      if (Array.isArray(material)) {
        for (let i = 0, il = groups.length; i < il; i++) {
          const group = groups[i];
          const groupMaterial = material[group.materialIndex];
          const start = Math.max(group.start, drawRange.start);
          const end = Math.min(index.count, Math.min(group.start + group.count, drawRange.start + drawRange.count));
          for (let j = start, jl = end; j < jl; j += 3) {
            const a = index.getX(j);
            const b = index.getX(j + 1);
            const c = index.getX(j + 2);
            intersection = checkGeometryIntersection(this, groupMaterial, raycaster, rayLocalSpace, uv, uv1, normal, a, b, c);
            if (intersection) {
              intersection.faceIndex = Math.floor(j / 3);
              intersection.face.materialIndex = group.materialIndex;
              intersects2.push(intersection);
            }
          }
        }
      } else {
        const start = Math.max(0, drawRange.start);
        const end = Math.min(index.count, drawRange.start + drawRange.count);
        for (let i = start, il = end; i < il; i += 3) {
          const a = index.getX(i);
          const b = index.getX(i + 1);
          const c = index.getX(i + 2);
          intersection = checkGeometryIntersection(this, material, raycaster, rayLocalSpace, uv, uv1, normal, a, b, c);
          if (intersection) {
            intersection.faceIndex = Math.floor(i / 3);
            intersects2.push(intersection);
          }
        }
      }
    } else if (position !== void 0) {
      if (Array.isArray(material)) {
        for (let i = 0, il = groups.length; i < il; i++) {
          const group = groups[i];
          const groupMaterial = material[group.materialIndex];
          const start = Math.max(group.start, drawRange.start);
          const end = Math.min(position.count, Math.min(group.start + group.count, drawRange.start + drawRange.count));
          for (let j = start, jl = end; j < jl; j += 3) {
            const a = j;
            const b = j + 1;
            const c = j + 2;
            intersection = checkGeometryIntersection(this, groupMaterial, raycaster, rayLocalSpace, uv, uv1, normal, a, b, c);
            if (intersection) {
              intersection.faceIndex = Math.floor(j / 3);
              intersection.face.materialIndex = group.materialIndex;
              intersects2.push(intersection);
            }
          }
        }
      } else {
        const start = Math.max(0, drawRange.start);
        const end = Math.min(position.count, drawRange.start + drawRange.count);
        for (let i = start, il = end; i < il; i += 3) {
          const a = i;
          const b = i + 1;
          const c = i + 2;
          intersection = checkGeometryIntersection(this, material, raycaster, rayLocalSpace, uv, uv1, normal, a, b, c);
          if (intersection) {
            intersection.faceIndex = Math.floor(i / 3);
            intersects2.push(intersection);
          }
        }
      }
    }
  }
};
function checkIntersection$1(object, material, raycaster, ray, pA, pB, pC, point) {
  let intersect;
  if (material.side === BackSide) {
    intersect = ray.intersectTriangle(pC, pB, pA, true, point);
  } else {
    intersect = ray.intersectTriangle(pA, pB, pC, material.side === FrontSide, point);
  }
  if (intersect === null) return null;
  _intersectionPointWorld.copy(point);
  _intersectionPointWorld.applyMatrix4(object.matrixWorld);
  const distance = raycaster.ray.origin.distanceTo(_intersectionPointWorld);
  if (distance < raycaster.near || distance > raycaster.far) return null;
  return {
    distance,
    point: _intersectionPointWorld.clone(),
    object
  };
}
function checkGeometryIntersection(object, material, raycaster, ray, uv, uv1, normal, a, b, c) {
  object.getVertexPosition(a, _vA$1);
  object.getVertexPosition(b, _vB$1);
  object.getVertexPosition(c, _vC$1);
  const intersection = checkIntersection$1(object, material, raycaster, ray, _vA$1, _vB$1, _vC$1, _intersectionPoint);
  if (intersection) {
    if (uv) {
      _uvA$1.fromBufferAttribute(uv, a);
      _uvB$1.fromBufferAttribute(uv, b);
      _uvC$1.fromBufferAttribute(uv, c);
      intersection.uv = Triangle.getInterpolation(_intersectionPoint, _vA$1, _vB$1, _vC$1, _uvA$1, _uvB$1, _uvC$1, new Vector2());
    }
    if (uv1) {
      _uvA$1.fromBufferAttribute(uv1, a);
      _uvB$1.fromBufferAttribute(uv1, b);
      _uvC$1.fromBufferAttribute(uv1, c);
      intersection.uv1 = Triangle.getInterpolation(_intersectionPoint, _vA$1, _vB$1, _vC$1, _uvA$1, _uvB$1, _uvC$1, new Vector2());
    }
    if (normal) {
      _normalA.fromBufferAttribute(normal, a);
      _normalB.fromBufferAttribute(normal, b);
      _normalC.fromBufferAttribute(normal, c);
      intersection.normal = Triangle.getInterpolation(_intersectionPoint, _vA$1, _vB$1, _vC$1, _normalA, _normalB, _normalC, new Vector3());
      if (intersection.normal.dot(ray.direction) > 0) {
        intersection.normal.multiplyScalar(-1);
      }
    }
    const face = {
      a,
      b,
      c,
      normal: new Vector3(),
      materialIndex: 0
    };
    Triangle.getNormal(_vA$1, _vB$1, _vC$1, face.normal);
    intersection.face = face;
  }
  return intersection;
}
function cloneUniforms(src) {
  const dst = {};
  for (const u in src) {
    dst[u] = {};
    for (const p in src[u]) {
      const property = src[u][p];
      if (property && (property.isColor || property.isMatrix3 || property.isMatrix4 || property.isVector2 || property.isVector3 || property.isVector4 || property.isTexture || property.isQuaternion)) {
        if (property.isRenderTargetTexture) {
          console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().");
          dst[u][p] = null;
        } else {
          dst[u][p] = property.clone();
        }
      } else if (Array.isArray(property)) {
        dst[u][p] = property.slice();
      } else {
        dst[u][p] = property;
      }
    }
  }
  return dst;
}
function mergeUniforms(uniforms) {
  const merged = {};
  for (let u = 0; u < uniforms.length; u++) {
    const tmp = cloneUniforms(uniforms[u]);
    for (const p in tmp) {
      merged[p] = tmp[p];
    }
  }
  return merged;
}
var Camera = class extends Object3D {
  constructor() {
    super();
    this.isCamera = true;
    this.type = "Camera";
    this.matrixWorldInverse = new Matrix4();
    this.projectionMatrix = new Matrix4();
    this.projectionMatrixInverse = new Matrix4();
    this.coordinateSystem = WebGLCoordinateSystem;
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.matrixWorldInverse.copy(source.matrixWorldInverse);
    this.projectionMatrix.copy(source.projectionMatrix);
    this.projectionMatrixInverse.copy(source.projectionMatrixInverse);
    this.coordinateSystem = source.coordinateSystem;
    return this;
  }
  getWorldDirection(target) {
    return super.getWorldDirection(target).negate();
  }
  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);
    this.matrixWorldInverse.copy(this.matrixWorld).invert();
  }
  updateWorldMatrix(updateParents, updateChildren) {
    super.updateWorldMatrix(updateParents, updateChildren);
    this.matrixWorldInverse.copy(this.matrixWorld).invert();
  }
  clone() {
    return new this.constructor().copy(this);
  }
};
var _v3$1 = /* @__PURE__ */ new Vector3();
var _minTarget = /* @__PURE__ */ new Vector2();
var _maxTarget = /* @__PURE__ */ new Vector2();
var PerspectiveCamera = class extends Camera {
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2e3) {
    super();
    this.isPerspectiveCamera = true;
    this.type = "PerspectiveCamera";
    this.fov = fov;
    this.zoom = 1;
    this.near = near;
    this.far = far;
    this.focus = 10;
    this.aspect = aspect;
    this.view = null;
    this.filmGauge = 35;
    this.filmOffset = 0;
    this.updateProjectionMatrix();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.fov = source.fov;
    this.zoom = source.zoom;
    this.near = source.near;
    this.far = source.far;
    this.focus = source.focus;
    this.aspect = source.aspect;
    this.view = source.view === null ? null : Object.assign({}, source.view);
    this.filmGauge = source.filmGauge;
    this.filmOffset = source.filmOffset;
    return this;
  }
  /**
   * Sets the FOV by focal length in respect to the current .filmGauge.
   *
   * The default film gauge is 35, so that the focal length can be specified for
   * a 35mm (full frame) camera.
   *
   * Values for focal length and film gauge must have the same unit.
   */
  setFocalLength(focalLength) {
    const vExtentSlope = 0.5 * this.getFilmHeight() / focalLength;
    this.fov = RAD2DEG * 2 * Math.atan(vExtentSlope);
    this.updateProjectionMatrix();
  }
  /**
   * Calculates the focal length from the current .fov and .filmGauge.
   */
  getFocalLength() {
    const vExtentSlope = Math.tan(DEG2RAD * 0.5 * this.fov);
    return 0.5 * this.getFilmHeight() / vExtentSlope;
  }
  getEffectiveFOV() {
    return RAD2DEG * 2 * Math.atan(
      Math.tan(DEG2RAD * 0.5 * this.fov) / this.zoom
    );
  }
  getFilmWidth() {
    return this.filmGauge * Math.min(this.aspect, 1);
  }
  getFilmHeight() {
    return this.filmGauge / Math.max(this.aspect, 1);
  }
  /**
   * Computes the 2D bounds of the camera's viewable rectangle at a given distance along the viewing direction.
   * Sets minTarget and maxTarget to the coordinates of the lower-left and upper-right corners of the view rectangle.
   */
  getViewBounds(distance, minTarget, maxTarget) {
    _v3$1.set(-1, -1, 0.5).applyMatrix4(this.projectionMatrixInverse);
    minTarget.set(_v3$1.x, _v3$1.y).multiplyScalar(-distance / _v3$1.z);
    _v3$1.set(1, 1, 0.5).applyMatrix4(this.projectionMatrixInverse);
    maxTarget.set(_v3$1.x, _v3$1.y).multiplyScalar(-distance / _v3$1.z);
  }
  /**
   * Computes the width and height of the camera's viewable rectangle at a given distance along the viewing direction.
   * Copies the result into the target Vector2, where x is width and y is height.
   */
  getViewSize(distance, target) {
    this.getViewBounds(distance, _minTarget, _maxTarget);
    return target.subVectors(_maxTarget, _minTarget);
  }
  /**
   * Sets an offset in a larger frustum. This is useful for multi-window or
   * multi-monitor/multi-machine setups.
   *
   * For example, if you have 3x2 monitors and each monitor is 1920x1080 and
   * the monitors are in grid like this
   *
   *   +---+---+---+
   *   | A | B | C |
   *   +---+---+---+
   *   | D | E | F |
   *   +---+---+---+
   *
   * then for each monitor you would call it like this
   *
   *   const w = 1920;
   *   const h = 1080;
   *   const fullWidth = w * 3;
   *   const fullHeight = h * 2;
   *
   *   --A--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 0, h * 0, w, h );
   *   --B--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 1, h * 0, w, h );
   *   --C--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 2, h * 0, w, h );
   *   --D--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 0, h * 1, w, h );
   *   --E--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 1, h * 1, w, h );
   *   --F--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 2, h * 1, w, h );
   *
   *   Note there is no reason monitors have to be the same size or in a grid.
   */
  setViewOffset(fullWidth, fullHeight, x, y, width, height) {
    this.aspect = fullWidth / fullHeight;
    if (this.view === null) {
      this.view = {
        enabled: true,
        fullWidth: 1,
        fullHeight: 1,
        offsetX: 0,
        offsetY: 0,
        width: 1,
        height: 1
      };
    }
    this.view.enabled = true;
    this.view.fullWidth = fullWidth;
    this.view.fullHeight = fullHeight;
    this.view.offsetX = x;
    this.view.offsetY = y;
    this.view.width = width;
    this.view.height = height;
    this.updateProjectionMatrix();
  }
  clearViewOffset() {
    if (this.view !== null) {
      this.view.enabled = false;
    }
    this.updateProjectionMatrix();
  }
  updateProjectionMatrix() {
    const near = this.near;
    let top = near * Math.tan(DEG2RAD * 0.5 * this.fov) / this.zoom;
    let height = 2 * top;
    let width = this.aspect * height;
    let left = -0.5 * width;
    const view = this.view;
    if (this.view !== null && this.view.enabled) {
      const fullWidth = view.fullWidth, fullHeight = view.fullHeight;
      left += view.offsetX * width / fullWidth;
      top -= view.offsetY * height / fullHeight;
      width *= view.width / fullWidth;
      height *= view.height / fullHeight;
    }
    const skew = this.filmOffset;
    if (skew !== 0) left += near * skew / this.getFilmWidth();
    this.projectionMatrix.makePerspective(left, left + width, top, top - height, near, this.far, this.coordinateSystem);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
  toJSON(meta) {
    const data = super.toJSON(meta);
    data.object.fov = this.fov;
    data.object.zoom = this.zoom;
    data.object.near = this.near;
    data.object.far = this.far;
    data.object.focus = this.focus;
    data.object.aspect = this.aspect;
    if (this.view !== null) data.object.view = Object.assign({}, this.view);
    data.object.filmGauge = this.filmGauge;
    data.object.filmOffset = this.filmOffset;
    return data;
  }
};
var _vector1 = /* @__PURE__ */ new Vector3();
var _vector2 = /* @__PURE__ */ new Vector3();
var _normalMatrix = /* @__PURE__ */ new Matrix3();
var Plane = class {
  constructor(normal = new Vector3(1, 0, 0), constant = 0) {
    this.isPlane = true;
    this.normal = normal;
    this.constant = constant;
  }
  set(normal, constant) {
    this.normal.copy(normal);
    this.constant = constant;
    return this;
  }
  setComponents(x, y, z, w) {
    this.normal.set(x, y, z);
    this.constant = w;
    return this;
  }
  setFromNormalAndCoplanarPoint(normal, point) {
    this.normal.copy(normal);
    this.constant = -point.dot(this.normal);
    return this;
  }
  setFromCoplanarPoints(a, b, c) {
    const normal = _vector1.subVectors(c, b).cross(_vector2.subVectors(a, b)).normalize();
    this.setFromNormalAndCoplanarPoint(normal, a);
    return this;
  }
  copy(plane) {
    this.normal.copy(plane.normal);
    this.constant = plane.constant;
    return this;
  }
  normalize() {
    const inverseNormalLength = 1 / this.normal.length();
    this.normal.multiplyScalar(inverseNormalLength);
    this.constant *= inverseNormalLength;
    return this;
  }
  negate() {
    this.constant *= -1;
    this.normal.negate();
    return this;
  }
  distanceToPoint(point) {
    return this.normal.dot(point) + this.constant;
  }
  distanceToSphere(sphere) {
    return this.distanceToPoint(sphere.center) - sphere.radius;
  }
  projectPoint(point, target) {
    return target.copy(point).addScaledVector(this.normal, -this.distanceToPoint(point));
  }
  intersectLine(line, target) {
    const direction = line.delta(_vector1);
    const denominator = this.normal.dot(direction);
    if (denominator === 0) {
      if (this.distanceToPoint(line.start) === 0) {
        return target.copy(line.start);
      }
      return null;
    }
    const t = -(line.start.dot(this.normal) + this.constant) / denominator;
    if (t < 0 || t > 1) {
      return null;
    }
    return target.copy(line.start).addScaledVector(direction, t);
  }
  intersectsLine(line) {
    const startSign = this.distanceToPoint(line.start);
    const endSign = this.distanceToPoint(line.end);
    return startSign < 0 && endSign > 0 || endSign < 0 && startSign > 0;
  }
  intersectsBox(box) {
    return box.intersectsPlane(this);
  }
  intersectsSphere(sphere) {
    return sphere.intersectsPlane(this);
  }
  coplanarPoint(target) {
    return target.copy(this.normal).multiplyScalar(-this.constant);
  }
  applyMatrix4(matrix, optionalNormalMatrix) {
    const normalMatrix = optionalNormalMatrix || _normalMatrix.getNormalMatrix(matrix);
    const referencePoint = this.coplanarPoint(_vector1).applyMatrix4(matrix);
    const normal = this.normal.applyMatrix3(normalMatrix).normalize();
    this.constant = -referencePoint.dot(normal);
    return this;
  }
  translate(offset) {
    this.constant -= offset.dot(this.normal);
    return this;
  }
  equals(plane) {
    return plane.normal.equals(this.normal) && plane.constant === this.constant;
  }
  clone() {
    return new this.constructor().copy(this);
  }
};
var _sphere$5 = /* @__PURE__ */ new Sphere();
var _vector$7 = /* @__PURE__ */ new Vector3();
var Frustum = class {
  constructor(p0 = new Plane(), p1 = new Plane(), p2 = new Plane(), p3 = new Plane(), p4 = new Plane(), p5 = new Plane()) {
    this.planes = [p0, p1, p2, p3, p4, p5];
  }
  set(p0, p1, p2, p3, p4, p5) {
    const planes = this.planes;
    planes[0].copy(p0);
    planes[1].copy(p1);
    planes[2].copy(p2);
    planes[3].copy(p3);
    planes[4].copy(p4);
    planes[5].copy(p5);
    return this;
  }
  copy(frustum) {
    const planes = this.planes;
    for (let i = 0; i < 6; i++) {
      planes[i].copy(frustum.planes[i]);
    }
    return this;
  }
  setFromProjectionMatrix(m, coordinateSystem = WebGLCoordinateSystem) {
    const planes = this.planes;
    const me = m.elements;
    const me0 = me[0], me1 = me[1], me2 = me[2], me3 = me[3];
    const me4 = me[4], me5 = me[5], me6 = me[6], me7 = me[7];
    const me8 = me[8], me9 = me[9], me10 = me[10], me11 = me[11];
    const me12 = me[12], me13 = me[13], me14 = me[14], me15 = me[15];
    planes[0].setComponents(me3 - me0, me7 - me4, me11 - me8, me15 - me12).normalize();
    planes[1].setComponents(me3 + me0, me7 + me4, me11 + me8, me15 + me12).normalize();
    planes[2].setComponents(me3 + me1, me7 + me5, me11 + me9, me15 + me13).normalize();
    planes[3].setComponents(me3 - me1, me7 - me5, me11 - me9, me15 - me13).normalize();
    planes[4].setComponents(me3 - me2, me7 - me6, me11 - me10, me15 - me14).normalize();
    if (coordinateSystem === WebGLCoordinateSystem) {
      planes[5].setComponents(me3 + me2, me7 + me6, me11 + me10, me15 + me14).normalize();
    } else if (coordinateSystem === WebGPUCoordinateSystem) {
      planes[5].setComponents(me2, me6, me10, me14).normalize();
    } else {
      throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: " + coordinateSystem);
    }
    return this;
  }
  intersectsObject(object) {
    if (object.boundingSphere !== void 0) {
      if (object.boundingSphere === null) object.computeBoundingSphere();
      _sphere$5.copy(object.boundingSphere).applyMatrix4(object.matrixWorld);
    } else {
      const geometry = object.geometry;
      if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
      _sphere$5.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
    }
    return this.intersectsSphere(_sphere$5);
  }
  intersectsSprite(sprite) {
    _sphere$5.center.set(0, 0, 0);
    _sphere$5.radius = 0.7071067811865476;
    _sphere$5.applyMatrix4(sprite.matrixWorld);
    return this.intersectsSphere(_sphere$5);
  }
  intersectsSphere(sphere) {
    const planes = this.planes;
    const center = sphere.center;
    const negRadius = -sphere.radius;
    for (let i = 0; i < 6; i++) {
      const distance = planes[i].distanceToPoint(center);
      if (distance < negRadius) {
        return false;
      }
    }
    return true;
  }
  intersectsBox(box) {
    const planes = this.planes;
    for (let i = 0; i < 6; i++) {
      const plane = planes[i];
      _vector$7.x = plane.normal.x > 0 ? box.max.x : box.min.x;
      _vector$7.y = plane.normal.y > 0 ? box.max.y : box.min.y;
      _vector$7.z = plane.normal.z > 0 ? box.max.z : box.min.z;
      if (plane.distanceToPoint(_vector$7) < 0) {
        return false;
      }
    }
    return true;
  }
  containsPoint(point) {
    const planes = this.planes;
    for (let i = 0; i < 6; i++) {
      if (planes[i].distanceToPoint(point) < 0) {
        return false;
      }
    }
    return true;
  }
  clone() {
    return new this.constructor().copy(this);
  }
};
var alphahash_fragment = "#ifdef USE_ALPHAHASH\n	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;\n#endif";
var alphahash_pars_fragment = "#ifdef USE_ALPHAHASH\n	const float ALPHA_HASH_SCALE = 0.05;\n	float hash2D( vec2 value ) {\n		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );\n	}\n	float hash3D( vec3 value ) {\n		return hash2D( vec2( hash2D( value.xy ), value.z ) );\n	}\n	float getAlphaHashThreshold( vec3 position ) {\n		float maxDeriv = max(\n			length( dFdx( position.xyz ) ),\n			length( dFdy( position.xyz ) )\n		);\n		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );\n		vec2 pixScales = vec2(\n			exp2( floor( log2( pixScale ) ) ),\n			exp2( ceil( log2( pixScale ) ) )\n		);\n		vec2 alpha = vec2(\n			hash3D( floor( pixScales.x * position.xyz ) ),\n			hash3D( floor( pixScales.y * position.xyz ) )\n		);\n		float lerpFactor = fract( log2( pixScale ) );\n		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;\n		float a = min( lerpFactor, 1.0 - lerpFactor );\n		vec3 cases = vec3(\n			x * x / ( 2.0 * a * ( 1.0 - a ) ),\n			( x - 0.5 * a ) / ( 1.0 - a ),\n			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )\n		);\n		float threshold = ( x < ( 1.0 - a ) )\n			? ( ( x < a ) ? cases.x : cases.y )\n			: cases.z;\n		return clamp( threshold , 1.0e-6, 1.0 );\n	}\n#endif";
var alphamap_fragment = "#ifdef USE_ALPHAMAP\n	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;\n#endif";
var alphamap_pars_fragment = "#ifdef USE_ALPHAMAP\n	uniform sampler2D alphaMap;\n#endif";
var alphatest_fragment = "#ifdef USE_ALPHATEST\n	#ifdef ALPHA_TO_COVERAGE\n	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );\n	if ( diffuseColor.a == 0.0 ) discard;\n	#else\n	if ( diffuseColor.a < alphaTest ) discard;\n	#endif\n#endif";
var alphatest_pars_fragment = "#ifdef USE_ALPHATEST\n	uniform float alphaTest;\n#endif";
var aomap_fragment = "#ifdef USE_AOMAP\n	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;\n	reflectedLight.indirectDiffuse *= ambientOcclusion;\n	#if defined( USE_CLEARCOAT ) \n		clearcoatSpecularIndirect *= ambientOcclusion;\n	#endif\n	#if defined( USE_SHEEN ) \n		sheenSpecularIndirect *= ambientOcclusion;\n	#endif\n	#if defined( USE_ENVMAP ) && defined( STANDARD )\n		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );\n		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );\n	#endif\n#endif";
var aomap_pars_fragment = "#ifdef USE_AOMAP\n	uniform sampler2D aoMap;\n	uniform float aoMapIntensity;\n#endif";
var batching_pars_vertex = "#ifdef USE_BATCHING\n	attribute float batchId;\n	uniform highp sampler2D batchingTexture;\n	mat4 getBatchingMatrix( const in float i ) {\n		int size = textureSize( batchingTexture, 0 ).x;\n		int j = int( i ) * 4;\n		int x = j % size;\n		int y = j / size;\n		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );\n		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );\n		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );\n		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );\n		return mat4( v1, v2, v3, v4 );\n	}\n#endif";
var batching_vertex = "#ifdef USE_BATCHING\n	mat4 batchingMatrix = getBatchingMatrix( batchId );\n#endif";
var begin_vertex = "vec3 transformed = vec3( position );\n#ifdef USE_ALPHAHASH\n	vPosition = vec3( position );\n#endif";
var beginnormal_vertex = "vec3 objectNormal = vec3( normal );\n#ifdef USE_TANGENT\n	vec3 objectTangent = vec3( tangent.xyz );\n#endif";
var bsdfs = "float G_BlinnPhong_Implicit( ) {\n	return 0.25;\n}\nfloat D_BlinnPhong( const in float shininess, const in float dotNH ) {\n	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );\n}\nvec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {\n	vec3 halfDir = normalize( lightDir + viewDir );\n	float dotNH = saturate( dot( normal, halfDir ) );\n	float dotVH = saturate( dot( viewDir, halfDir ) );\n	vec3 F = F_Schlick( specularColor, 1.0, dotVH );\n	float G = G_BlinnPhong_Implicit( );\n	float D = D_BlinnPhong( shininess, dotNH );\n	return F * ( G * D );\n} // validated";
var iridescence_fragment = "#ifdef USE_IRIDESCENCE\n	const mat3 XYZ_TO_REC709 = mat3(\n		 3.2404542, -0.9692660,  0.0556434,\n		-1.5371385,  1.8760108, -0.2040259,\n		-0.4985314,  0.0415560,  1.0572252\n	);\n	vec3 Fresnel0ToIor( vec3 fresnel0 ) {\n		vec3 sqrtF0 = sqrt( fresnel0 );\n		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );\n	}\n	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {\n		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );\n	}\n	float IorToFresnel0( float transmittedIor, float incidentIor ) {\n		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));\n	}\n	vec3 evalSensitivity( float OPD, vec3 shift ) {\n		float phase = 2.0 * PI * OPD * 1.0e-9;\n		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );\n		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );\n		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );\n		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );\n		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );\n		xyz /= 1.0685e-7;\n		vec3 rgb = XYZ_TO_REC709 * xyz;\n		return rgb;\n	}\n	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {\n		vec3 I;\n		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );\n		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );\n		float cosTheta2Sq = 1.0 - sinTheta2Sq;\n		if ( cosTheta2Sq < 0.0 ) {\n			return vec3( 1.0 );\n		}\n		float cosTheta2 = sqrt( cosTheta2Sq );\n		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );\n		float R12 = F_Schlick( R0, 1.0, cosTheta1 );\n		float T121 = 1.0 - R12;\n		float phi12 = 0.0;\n		if ( iridescenceIOR < outsideIOR ) phi12 = PI;\n		float phi21 = PI - phi12;\n		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );\n		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );\n		vec3 phi23 = vec3( 0.0 );\n		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;\n		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;\n		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;\n		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;\n		vec3 phi = vec3( phi21 ) + phi23;\n		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );\n		vec3 r123 = sqrt( R123 );\n		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );\n		vec3 C0 = R12 + Rs;\n		I = C0;\n		vec3 Cm = Rs - T121;\n		for ( int m = 1; m <= 2; ++ m ) {\n			Cm *= r123;\n			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );\n			I += Cm * Sm;\n		}\n		return max( I, vec3( 0.0 ) );\n	}\n#endif";
var bumpmap_pars_fragment = "#ifdef USE_BUMPMAP\n	uniform sampler2D bumpMap;\n	uniform float bumpScale;\n	vec2 dHdxy_fwd() {\n		vec2 dSTdx = dFdx( vBumpMapUv );\n		vec2 dSTdy = dFdy( vBumpMapUv );\n		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;\n		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;\n		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;\n		return vec2( dBx, dBy );\n	}\n	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {\n		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );\n		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );\n		vec3 vN = surf_norm;\n		vec3 R1 = cross( vSigmaY, vN );\n		vec3 R2 = cross( vN, vSigmaX );\n		float fDet = dot( vSigmaX, R1 ) * faceDirection;\n		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );\n		return normalize( abs( fDet ) * surf_norm - vGrad );\n	}\n#endif";
var clipping_planes_fragment = "#if NUM_CLIPPING_PLANES > 0\n	vec4 plane;\n	#ifdef ALPHA_TO_COVERAGE\n		float distanceToPlane, distanceGradient;\n		float clipOpacity = 1.0;\n		#pragma unroll_loop_start\n		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {\n			plane = clippingPlanes[ i ];\n			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;\n			distanceGradient = fwidth( distanceToPlane ) / 2.0;\n			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );\n			if ( clipOpacity == 0.0 ) discard;\n		}\n		#pragma unroll_loop_end\n		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES\n			float unionClipOpacity = 1.0;\n			#pragma unroll_loop_start\n			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {\n				plane = clippingPlanes[ i ];\n				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;\n				distanceGradient = fwidth( distanceToPlane ) / 2.0;\n				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );\n			}\n			#pragma unroll_loop_end\n			clipOpacity *= 1.0 - unionClipOpacity;\n		#endif\n		diffuseColor.a *= clipOpacity;\n		if ( diffuseColor.a == 0.0 ) discard;\n	#else\n		#pragma unroll_loop_start\n		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {\n			plane = clippingPlanes[ i ];\n			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;\n		}\n		#pragma unroll_loop_end\n		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES\n			bool clipped = true;\n			#pragma unroll_loop_start\n			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {\n				plane = clippingPlanes[ i ];\n				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;\n			}\n			#pragma unroll_loop_end\n			if ( clipped ) discard;\n		#endif\n	#endif\n#endif";
var clipping_planes_pars_fragment = "#if NUM_CLIPPING_PLANES > 0\n	varying vec3 vClipPosition;\n	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];\n#endif";
var clipping_planes_pars_vertex = "#if NUM_CLIPPING_PLANES > 0\n	varying vec3 vClipPosition;\n#endif";
var clipping_planes_vertex = "#if NUM_CLIPPING_PLANES > 0\n	vClipPosition = - mvPosition.xyz;\n#endif";
var color_fragment = "#if defined( USE_COLOR_ALPHA )\n	diffuseColor *= vColor;\n#elif defined( USE_COLOR )\n	diffuseColor.rgb *= vColor;\n#endif";
var color_pars_fragment = "#if defined( USE_COLOR_ALPHA )\n	varying vec4 vColor;\n#elif defined( USE_COLOR )\n	varying vec3 vColor;\n#endif";
var color_pars_vertex = "#if defined( USE_COLOR_ALPHA )\n	varying vec4 vColor;\n#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n	varying vec3 vColor;\n#endif";
var color_vertex = "#if defined( USE_COLOR_ALPHA )\n	vColor = vec4( 1.0 );\n#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n	vColor = vec3( 1.0 );\n#endif\n#ifdef USE_COLOR\n	vColor *= color;\n#endif\n#ifdef USE_INSTANCING_COLOR\n	vColor.xyz *= instanceColor.xyz;\n#endif";
var common = "#define PI 3.141592653589793\n#define PI2 6.283185307179586\n#define PI_HALF 1.5707963267948966\n#define RECIPROCAL_PI 0.3183098861837907\n#define RECIPROCAL_PI2 0.15915494309189535\n#define EPSILON 1e-6\n#ifndef saturate\n#define saturate( a ) clamp( a, 0.0, 1.0 )\n#endif\n#define whiteComplement( a ) ( 1.0 - saturate( a ) )\nfloat pow2( const in float x ) { return x*x; }\nvec3 pow2( const in vec3 x ) { return x*x; }\nfloat pow3( const in float x ) { return x*x*x; }\nfloat pow4( const in float x ) { float x2 = x*x; return x2*x2; }\nfloat max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }\nfloat average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }\nhighp float rand( const in vec2 uv ) {\n	const highp float a = 12.9898, b = 78.233, c = 43758.5453;\n	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );\n	return fract( sin( sn ) * c );\n}\n#ifdef HIGH_PRECISION\n	float precisionSafeLength( vec3 v ) { return length( v ); }\n#else\n	float precisionSafeLength( vec3 v ) {\n		float maxComponent = max3( abs( v ) );\n		return length( v / maxComponent ) * maxComponent;\n	}\n#endif\nstruct IncidentLight {\n	vec3 color;\n	vec3 direction;\n	bool visible;\n};\nstruct ReflectedLight {\n	vec3 directDiffuse;\n	vec3 directSpecular;\n	vec3 indirectDiffuse;\n	vec3 indirectSpecular;\n};\n#ifdef USE_ALPHAHASH\n	varying vec3 vPosition;\n#endif\nvec3 transformDirection( in vec3 dir, in mat4 matrix ) {\n	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );\n}\nvec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {\n	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );\n}\nmat3 transposeMat3( const in mat3 m ) {\n	mat3 tmp;\n	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );\n	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );\n	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );\n	return tmp;\n}\nfloat luminance( const in vec3 rgb ) {\n	const vec3 weights = vec3( 0.2126729, 0.7151522, 0.0721750 );\n	return dot( weights, rgb );\n}\nbool isPerspectiveMatrix( mat4 m ) {\n	return m[ 2 ][ 3 ] == - 1.0;\n}\nvec2 equirectUv( in vec3 dir ) {\n	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;\n	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;\n	return vec2( u, v );\n}\nvec3 BRDF_Lambert( const in vec3 diffuseColor ) {\n	return RECIPROCAL_PI * diffuseColor;\n}\nvec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {\n	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n}\nfloat F_Schlick( const in float f0, const in float f90, const in float dotVH ) {\n	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n} // validated";
var cube_uv_reflection_fragment = "#ifdef ENVMAP_TYPE_CUBE_UV\n	#define cubeUV_minMipLevel 4.0\n	#define cubeUV_minTileSize 16.0\n	float getFace( vec3 direction ) {\n		vec3 absDirection = abs( direction );\n		float face = - 1.0;\n		if ( absDirection.x > absDirection.z ) {\n			if ( absDirection.x > absDirection.y )\n				face = direction.x > 0.0 ? 0.0 : 3.0;\n			else\n				face = direction.y > 0.0 ? 1.0 : 4.0;\n		} else {\n			if ( absDirection.z > absDirection.y )\n				face = direction.z > 0.0 ? 2.0 : 5.0;\n			else\n				face = direction.y > 0.0 ? 1.0 : 4.0;\n		}\n		return face;\n	}\n	vec2 getUV( vec3 direction, float face ) {\n		vec2 uv;\n		if ( face == 0.0 ) {\n			uv = vec2( direction.z, direction.y ) / abs( direction.x );\n		} else if ( face == 1.0 ) {\n			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );\n		} else if ( face == 2.0 ) {\n			uv = vec2( - direction.x, direction.y ) / abs( direction.z );\n		} else if ( face == 3.0 ) {\n			uv = vec2( - direction.z, direction.y ) / abs( direction.x );\n		} else if ( face == 4.0 ) {\n			uv = vec2( - direction.x, direction.z ) / abs( direction.y );\n		} else {\n			uv = vec2( direction.x, direction.y ) / abs( direction.z );\n		}\n		return 0.5 * ( uv + 1.0 );\n	}\n	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {\n		float face = getFace( direction );\n		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );\n		mipInt = max( mipInt, cubeUV_minMipLevel );\n		float faceSize = exp2( mipInt );\n		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;\n		if ( face > 2.0 ) {\n			uv.y += faceSize;\n			face -= 3.0;\n		}\n		uv.x += face * faceSize;\n		uv.x += filterInt * 3.0 * cubeUV_minTileSize;\n		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );\n		uv.x *= CUBEUV_TEXEL_WIDTH;\n		uv.y *= CUBEUV_TEXEL_HEIGHT;\n		#ifdef texture2DGradEXT\n			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;\n		#else\n			return texture2D( envMap, uv ).rgb;\n		#endif\n	}\n	#define cubeUV_r0 1.0\n	#define cubeUV_m0 - 2.0\n	#define cubeUV_r1 0.8\n	#define cubeUV_m1 - 1.0\n	#define cubeUV_r4 0.4\n	#define cubeUV_m4 2.0\n	#define cubeUV_r5 0.305\n	#define cubeUV_m5 3.0\n	#define cubeUV_r6 0.21\n	#define cubeUV_m6 4.0\n	float roughnessToMip( float roughness ) {\n		float mip = 0.0;\n		if ( roughness >= cubeUV_r1 ) {\n			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;\n		} else if ( roughness >= cubeUV_r4 ) {\n			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;\n		} else if ( roughness >= cubeUV_r5 ) {\n			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;\n		} else if ( roughness >= cubeUV_r6 ) {\n			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;\n		} else {\n			mip = - 2.0 * log2( 1.16 * roughness );		}\n		return mip;\n	}\n	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {\n		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );\n		float mipF = fract( mip );\n		float mipInt = floor( mip );\n		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );\n		if ( mipF == 0.0 ) {\n			return vec4( color0, 1.0 );\n		} else {\n			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );\n			return vec4( mix( color0, color1, mipF ), 1.0 );\n		}\n	}\n#endif";
var defaultnormal_vertex = "vec3 transformedNormal = objectNormal;\n#ifdef USE_TANGENT\n	vec3 transformedTangent = objectTangent;\n#endif\n#ifdef USE_BATCHING\n	mat3 bm = mat3( batchingMatrix );\n	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );\n	transformedNormal = bm * transformedNormal;\n	#ifdef USE_TANGENT\n		transformedTangent = bm * transformedTangent;\n	#endif\n#endif\n#ifdef USE_INSTANCING\n	mat3 im = mat3( instanceMatrix );\n	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );\n	transformedNormal = im * transformedNormal;\n	#ifdef USE_TANGENT\n		transformedTangent = im * transformedTangent;\n	#endif\n#endif\ntransformedNormal = normalMatrix * transformedNormal;\n#ifdef FLIP_SIDED\n	transformedNormal = - transformedNormal;\n#endif\n#ifdef USE_TANGENT\n	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;\n	#ifdef FLIP_SIDED\n		transformedTangent = - transformedTangent;\n	#endif\n#endif";
var displacementmap_pars_vertex = "#ifdef USE_DISPLACEMENTMAP\n	uniform sampler2D displacementMap;\n	uniform float displacementScale;\n	uniform float displacementBias;\n#endif";
var displacementmap_vertex = "#ifdef USE_DISPLACEMENTMAP\n	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );\n#endif";
var emissivemap_fragment = "#ifdef USE_EMISSIVEMAP\n	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );\n	totalEmissiveRadiance *= emissiveColor.rgb;\n#endif";
var emissivemap_pars_fragment = "#ifdef USE_EMISSIVEMAP\n	uniform sampler2D emissiveMap;\n#endif";
var colorspace_fragment = "gl_FragColor = linearToOutputTexel( gl_FragColor );";
var colorspace_pars_fragment = "\nconst mat3 LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = mat3(\n	vec3( 0.8224621, 0.177538, 0.0 ),\n	vec3( 0.0331941, 0.9668058, 0.0 ),\n	vec3( 0.0170827, 0.0723974, 0.9105199 )\n);\nconst mat3 LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = mat3(\n	vec3( 1.2249401, - 0.2249404, 0.0 ),\n	vec3( - 0.0420569, 1.0420571, 0.0 ),\n	vec3( - 0.0196376, - 0.0786361, 1.0982735 )\n);\nvec4 LinearSRGBToLinearDisplayP3( in vec4 value ) {\n	return vec4( value.rgb * LINEAR_SRGB_TO_LINEAR_DISPLAY_P3, value.a );\n}\nvec4 LinearDisplayP3ToLinearSRGB( in vec4 value ) {\n	return vec4( value.rgb * LINEAR_DISPLAY_P3_TO_LINEAR_SRGB, value.a );\n}\nvec4 LinearTransferOETF( in vec4 value ) {\n	return value;\n}\nvec4 sRGBTransferOETF( in vec4 value ) {\n	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );\n}\nvec4 LinearToLinear( in vec4 value ) {\n	return value;\n}\nvec4 LinearTosRGB( in vec4 value ) {\n	return sRGBTransferOETF( value );\n}";
var envmap_fragment = "#ifdef USE_ENVMAP\n	#ifdef ENV_WORLDPOS\n		vec3 cameraToFrag;\n		if ( isOrthographic ) {\n			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );\n		} else {\n			cameraToFrag = normalize( vWorldPosition - cameraPosition );\n		}\n		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\n		#ifdef ENVMAP_MODE_REFLECTION\n			vec3 reflectVec = reflect( cameraToFrag, worldNormal );\n		#else\n			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );\n		#endif\n	#else\n		vec3 reflectVec = vReflect;\n	#endif\n	#ifdef ENVMAP_TYPE_CUBE\n		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );\n	#else\n		vec4 envColor = vec4( 0.0 );\n	#endif\n	#ifdef ENVMAP_BLENDING_MULTIPLY\n		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );\n	#elif defined( ENVMAP_BLENDING_MIX )\n		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );\n	#elif defined( ENVMAP_BLENDING_ADD )\n		outgoingLight += envColor.xyz * specularStrength * reflectivity;\n	#endif\n#endif";
var envmap_common_pars_fragment = "#ifdef USE_ENVMAP\n	uniform float envMapIntensity;\n	uniform float flipEnvMap;\n	uniform mat3 envMapRotation;\n	#ifdef ENVMAP_TYPE_CUBE\n		uniform samplerCube envMap;\n	#else\n		uniform sampler2D envMap;\n	#endif\n	\n#endif";
var envmap_pars_fragment = "#ifdef USE_ENVMAP\n	uniform float reflectivity;\n	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )\n		#define ENV_WORLDPOS\n	#endif\n	#ifdef ENV_WORLDPOS\n		varying vec3 vWorldPosition;\n		uniform float refractionRatio;\n	#else\n		varying vec3 vReflect;\n	#endif\n#endif";
var envmap_pars_vertex = "#ifdef USE_ENVMAP\n	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )\n		#define ENV_WORLDPOS\n	#endif\n	#ifdef ENV_WORLDPOS\n		\n		varying vec3 vWorldPosition;\n	#else\n		varying vec3 vReflect;\n		uniform float refractionRatio;\n	#endif\n#endif";
var envmap_vertex = "#ifdef USE_ENVMAP\n	#ifdef ENV_WORLDPOS\n		vWorldPosition = worldPosition.xyz;\n	#else\n		vec3 cameraToVertex;\n		if ( isOrthographic ) {\n			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );\n		} else {\n			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );\n		}\n		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n		#ifdef ENVMAP_MODE_REFLECTION\n			vReflect = reflect( cameraToVertex, worldNormal );\n		#else\n			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );\n		#endif\n	#endif\n#endif";
var fog_vertex = "#ifdef USE_FOG\n	vFogDepth = - mvPosition.z;\n#endif";
var fog_pars_vertex = "#ifdef USE_FOG\n	varying float vFogDepth;\n#endif";
var fog_fragment = "#ifdef USE_FOG\n	#ifdef FOG_EXP2\n		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n	#else\n		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );\n	#endif\n	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif";
var fog_pars_fragment = "#ifdef USE_FOG\n	uniform vec3 fogColor;\n	varying float vFogDepth;\n	#ifdef FOG_EXP2\n		uniform float fogDensity;\n	#else\n		uniform float fogNear;\n		uniform float fogFar;\n	#endif\n#endif";
var gradientmap_pars_fragment = "#ifdef USE_GRADIENTMAP\n	uniform sampler2D gradientMap;\n#endif\nvec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {\n	float dotNL = dot( normal, lightDirection );\n	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );\n	#ifdef USE_GRADIENTMAP\n		return vec3( texture2D( gradientMap, coord ).r );\n	#else\n		vec2 fw = fwidth( coord ) * 0.5;\n		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );\n	#endif\n}";
var lightmap_pars_fragment = "#ifdef USE_LIGHTMAP\n	uniform sampler2D lightMap;\n	uniform float lightMapIntensity;\n#endif";
var lights_lambert_fragment = "LambertMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;\nmaterial.specularStrength = specularStrength;";
var lights_lambert_pars_fragment = "varying vec3 vViewPosition;\nstruct LambertMaterial {\n	vec3 diffuseColor;\n	float specularStrength;\n};\nvoid RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {\n	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n	vec3 irradiance = dotNL * directLight.color;\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\n#define RE_Direct				RE_Direct_Lambert\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert";
var lights_pars_begin = "uniform bool receiveShadow;\nuniform vec3 ambientLightColor;\n#if defined( USE_LIGHT_PROBES )\n	uniform vec3 lightProbe[ 9 ];\n#endif\nvec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {\n	float x = normal.x, y = normal.y, z = normal.z;\n	vec3 result = shCoefficients[ 0 ] * 0.886227;\n	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;\n	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;\n	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;\n	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;\n	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;\n	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );\n	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;\n	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );\n	return result;\n}\nvec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {\n	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\n	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );\n	return irradiance;\n}\nvec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {\n	vec3 irradiance = ambientLightColor;\n	return irradiance;\n}\nfloat getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {\n	#if defined ( LEGACY_LIGHTS )\n		if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) {\n			return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );\n		}\n		return 1.0;\n	#else\n		float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );\n		if ( cutoffDistance > 0.0 ) {\n			distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );\n		}\n		return distanceFalloff;\n	#endif\n}\nfloat getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {\n	return smoothstep( coneCosine, penumbraCosine, angleCosine );\n}\n#if NUM_DIR_LIGHTS > 0\n	struct DirectionalLight {\n		vec3 direction;\n		vec3 color;\n	};\n	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];\n	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {\n		light.color = directionalLight.color;\n		light.direction = directionalLight.direction;\n		light.visible = true;\n	}\n#endif\n#if NUM_POINT_LIGHTS > 0\n	struct PointLight {\n		vec3 position;\n		vec3 color;\n		float distance;\n		float decay;\n	};\n	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];\n	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {\n		vec3 lVector = pointLight.position - geometryPosition;\n		light.direction = normalize( lVector );\n		float lightDistance = length( lVector );\n		light.color = pointLight.color;\n		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );\n		light.visible = ( light.color != vec3( 0.0 ) );\n	}\n#endif\n#if NUM_SPOT_LIGHTS > 0\n	struct SpotLight {\n		vec3 position;\n		vec3 direction;\n		vec3 color;\n		float distance;\n		float decay;\n		float coneCos;\n		float penumbraCos;\n	};\n	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];\n	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {\n		vec3 lVector = spotLight.position - geometryPosition;\n		light.direction = normalize( lVector );\n		float angleCos = dot( light.direction, spotLight.direction );\n		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );\n		if ( spotAttenuation > 0.0 ) {\n			float lightDistance = length( lVector );\n			light.color = spotLight.color * spotAttenuation;\n			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );\n			light.visible = ( light.color != vec3( 0.0 ) );\n		} else {\n			light.color = vec3( 0.0 );\n			light.visible = false;\n		}\n	}\n#endif\n#if NUM_RECT_AREA_LIGHTS > 0\n	struct RectAreaLight {\n		vec3 color;\n		vec3 position;\n		vec3 halfWidth;\n		vec3 halfHeight;\n	};\n	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;\n	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];\n#endif\n#if NUM_HEMI_LIGHTS > 0\n	struct HemisphereLight {\n		vec3 direction;\n		vec3 skyColor;\n		vec3 groundColor;\n	};\n	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];\n	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {\n		float dotNL = dot( normal, hemiLight.direction );\n		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;\n		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );\n		return irradiance;\n	}\n#endif";
var envmap_physical_pars_fragment = "#ifdef USE_ENVMAP\n	vec3 getIBLIrradiance( const in vec3 normal ) {\n		#ifdef ENVMAP_TYPE_CUBE_UV\n			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\n			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );\n			return PI * envMapColor.rgb * envMapIntensity;\n		#else\n			return vec3( 0.0 );\n		#endif\n	}\n	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {\n		#ifdef ENVMAP_TYPE_CUBE_UV\n			vec3 reflectVec = reflect( - viewDir, normal );\n			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );\n			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );\n			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );\n			return envMapColor.rgb * envMapIntensity;\n		#else\n			return vec3( 0.0 );\n		#endif\n	}\n	#ifdef USE_ANISOTROPY\n		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {\n			#ifdef ENVMAP_TYPE_CUBE_UV\n				vec3 bentNormal = cross( bitangent, viewDir );\n				bentNormal = normalize( cross( bentNormal, bitangent ) );\n				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );\n				return getIBLRadiance( viewDir, bentNormal, roughness );\n			#else\n				return vec3( 0.0 );\n			#endif\n		}\n	#endif\n#endif";
var lights_toon_fragment = "ToonMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;";
var lights_toon_pars_fragment = "varying vec3 vViewPosition;\nstruct ToonMaterial {\n	vec3 diffuseColor;\n};\nvoid RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {\n	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\n#define RE_Direct				RE_Direct_Toon\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon";
var lights_phong_fragment = "BlinnPhongMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;\nmaterial.specularColor = specular;\nmaterial.specularShininess = shininess;\nmaterial.specularStrength = specularStrength;";
var lights_phong_pars_fragment = "varying vec3 vViewPosition;\nstruct BlinnPhongMaterial {\n	vec3 diffuseColor;\n	vec3 specularColor;\n	float specularShininess;\n	float specularStrength;\n};\nvoid RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {\n	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n	vec3 irradiance = dotNL * directLight.color;\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;\n}\nvoid RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\n#define RE_Direct				RE_Direct_BlinnPhong\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong";
var lights_physical_fragment = "PhysicalMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );\nvec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );\nfloat geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );\nmaterial.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;\nmaterial.roughness = min( material.roughness, 1.0 );\n#ifdef IOR\n	material.ior = ior;\n	#ifdef USE_SPECULAR\n		float specularIntensityFactor = specularIntensity;\n		vec3 specularColorFactor = specularColor;\n		#ifdef USE_SPECULAR_COLORMAP\n			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;\n		#endif\n		#ifdef USE_SPECULAR_INTENSITYMAP\n			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;\n		#endif\n		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );\n	#else\n		float specularIntensityFactor = 1.0;\n		vec3 specularColorFactor = vec3( 1.0 );\n		material.specularF90 = 1.0;\n	#endif\n	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );\n#else\n	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );\n	material.specularF90 = 1.0;\n#endif\n#ifdef USE_CLEARCOAT\n	material.clearcoat = clearcoat;\n	material.clearcoatRoughness = clearcoatRoughness;\n	material.clearcoatF0 = vec3( 0.04 );\n	material.clearcoatF90 = 1.0;\n	#ifdef USE_CLEARCOATMAP\n		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;\n	#endif\n	#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;\n	#endif\n	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );\n	material.clearcoatRoughness += geometryRoughness;\n	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );\n#endif\n#ifdef USE_DISPERSION\n	material.dispersion = dispersion;\n#endif\n#ifdef USE_IRIDESCENCE\n	material.iridescence = iridescence;\n	material.iridescenceIOR = iridescenceIOR;\n	#ifdef USE_IRIDESCENCEMAP\n		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;\n	#endif\n	#ifdef USE_IRIDESCENCE_THICKNESSMAP\n		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;\n	#else\n		material.iridescenceThickness = iridescenceThicknessMaximum;\n	#endif\n#endif\n#ifdef USE_SHEEN\n	material.sheenColor = sheenColor;\n	#ifdef USE_SHEEN_COLORMAP\n		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;\n	#endif\n	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );\n	#ifdef USE_SHEEN_ROUGHNESSMAP\n		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;\n	#endif\n#endif\n#ifdef USE_ANISOTROPY\n	#ifdef USE_ANISOTROPYMAP\n		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );\n		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;\n		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;\n	#else\n		vec2 anisotropyV = anisotropyVector;\n	#endif\n	material.anisotropy = length( anisotropyV );\n	if( material.anisotropy == 0.0 ) {\n		anisotropyV = vec2( 1.0, 0.0 );\n	} else {\n		anisotropyV /= material.anisotropy;\n		material.anisotropy = saturate( material.anisotropy );\n	}\n	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );\n	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;\n	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;\n#endif";
var lights_physical_pars_fragment = "struct PhysicalMaterial {\n	vec3 diffuseColor;\n	float roughness;\n	vec3 specularColor;\n	float specularF90;\n	float dispersion;\n	#ifdef USE_CLEARCOAT\n		float clearcoat;\n		float clearcoatRoughness;\n		vec3 clearcoatF0;\n		float clearcoatF90;\n	#endif\n	#ifdef USE_IRIDESCENCE\n		float iridescence;\n		float iridescenceIOR;\n		float iridescenceThickness;\n		vec3 iridescenceFresnel;\n		vec3 iridescenceF0;\n	#endif\n	#ifdef USE_SHEEN\n		vec3 sheenColor;\n		float sheenRoughness;\n	#endif\n	#ifdef IOR\n		float ior;\n	#endif\n	#ifdef USE_TRANSMISSION\n		float transmission;\n		float transmissionAlpha;\n		float thickness;\n		float attenuationDistance;\n		vec3 attenuationColor;\n	#endif\n	#ifdef USE_ANISOTROPY\n		float anisotropy;\n		float alphaT;\n		vec3 anisotropyT;\n		vec3 anisotropyB;\n	#endif\n};\nvec3 clearcoatSpecularDirect = vec3( 0.0 );\nvec3 clearcoatSpecularIndirect = vec3( 0.0 );\nvec3 sheenSpecularDirect = vec3( 0.0 );\nvec3 sheenSpecularIndirect = vec3(0.0 );\nvec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {\n    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );\n    float x2 = x * x;\n    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );\n    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );\n}\nfloat V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {\n	float a2 = pow2( alpha );\n	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );\n	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );\n	return 0.5 / max( gv + gl, EPSILON );\n}\nfloat D_GGX( const in float alpha, const in float dotNH ) {\n	float a2 = pow2( alpha );\n	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;\n	return RECIPROCAL_PI * a2 / pow2( denom );\n}\n#ifdef USE_ANISOTROPY\n	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {\n		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );\n		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );\n		float v = 0.5 / ( gv + gl );\n		return saturate(v);\n	}\n	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {\n		float a2 = alphaT * alphaB;\n		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );\n		highp float v2 = dot( v, v );\n		float w2 = a2 / v2;\n		return RECIPROCAL_PI * a2 * pow2 ( w2 );\n	}\n#endif\n#ifdef USE_CLEARCOAT\n	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {\n		vec3 f0 = material.clearcoatF0;\n		float f90 = material.clearcoatF90;\n		float roughness = material.clearcoatRoughness;\n		float alpha = pow2( roughness );\n		vec3 halfDir = normalize( lightDir + viewDir );\n		float dotNL = saturate( dot( normal, lightDir ) );\n		float dotNV = saturate( dot( normal, viewDir ) );\n		float dotNH = saturate( dot( normal, halfDir ) );\n		float dotVH = saturate( dot( viewDir, halfDir ) );\n		vec3 F = F_Schlick( f0, f90, dotVH );\n		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );\n		float D = D_GGX( alpha, dotNH );\n		return F * ( V * D );\n	}\n#endif\nvec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {\n	vec3 f0 = material.specularColor;\n	float f90 = material.specularF90;\n	float roughness = material.roughness;\n	float alpha = pow2( roughness );\n	vec3 halfDir = normalize( lightDir + viewDir );\n	float dotNL = saturate( dot( normal, lightDir ) );\n	float dotNV = saturate( dot( normal, viewDir ) );\n	float dotNH = saturate( dot( normal, halfDir ) );\n	float dotVH = saturate( dot( viewDir, halfDir ) );\n	vec3 F = F_Schlick( f0, f90, dotVH );\n	#ifdef USE_IRIDESCENCE\n		F = mix( F, material.iridescenceFresnel, material.iridescence );\n	#endif\n	#ifdef USE_ANISOTROPY\n		float dotTL = dot( material.anisotropyT, lightDir );\n		float dotTV = dot( material.anisotropyT, viewDir );\n		float dotTH = dot( material.anisotropyT, halfDir );\n		float dotBL = dot( material.anisotropyB, lightDir );\n		float dotBV = dot( material.anisotropyB, viewDir );\n		float dotBH = dot( material.anisotropyB, halfDir );\n		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );\n		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );\n	#else\n		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );\n		float D = D_GGX( alpha, dotNH );\n	#endif\n	return F * ( V * D );\n}\nvec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {\n	const float LUT_SIZE = 64.0;\n	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;\n	const float LUT_BIAS = 0.5 / LUT_SIZE;\n	float dotNV = saturate( dot( N, V ) );\n	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );\n	uv = uv * LUT_SCALE + LUT_BIAS;\n	return uv;\n}\nfloat LTC_ClippedSphereFormFactor( const in vec3 f ) {\n	float l = length( f );\n	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );\n}\nvec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {\n	float x = dot( v1, v2 );\n	float y = abs( x );\n	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;\n	float b = 3.4175940 + ( 4.1616724 + y ) * y;\n	float v = a / b;\n	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;\n	return cross( v1, v2 ) * theta_sintheta;\n}\nvec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {\n	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];\n	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];\n	vec3 lightNormal = cross( v1, v2 );\n	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );\n	vec3 T1, T2;\n	T1 = normalize( V - N * dot( V, N ) );\n	T2 = - cross( N, T1 );\n	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );\n	vec3 coords[ 4 ];\n	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );\n	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );\n	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );\n	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );\n	coords[ 0 ] = normalize( coords[ 0 ] );\n	coords[ 1 ] = normalize( coords[ 1 ] );\n	coords[ 2 ] = normalize( coords[ 2 ] );\n	coords[ 3 ] = normalize( coords[ 3 ] );\n	vec3 vectorFormFactor = vec3( 0.0 );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );\n	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );\n	return vec3( result );\n}\n#if defined( USE_SHEEN )\nfloat D_Charlie( float roughness, float dotNH ) {\n	float alpha = pow2( roughness );\n	float invAlpha = 1.0 / alpha;\n	float cos2h = dotNH * dotNH;\n	float sin2h = max( 1.0 - cos2h, 0.0078125 );\n	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );\n}\nfloat V_Neubelt( float dotNV, float dotNL ) {\n	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );\n}\nvec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {\n	vec3 halfDir = normalize( lightDir + viewDir );\n	float dotNL = saturate( dot( normal, lightDir ) );\n	float dotNV = saturate( dot( normal, viewDir ) );\n	float dotNH = saturate( dot( normal, halfDir ) );\n	float D = D_Charlie( sheenRoughness, dotNH );\n	float V = V_Neubelt( dotNV, dotNL );\n	return sheenColor * ( D * V );\n}\n#endif\nfloat IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {\n	float dotNV = saturate( dot( normal, viewDir ) );\n	float r2 = roughness * roughness;\n	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;\n	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;\n	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );\n	return saturate( DG * RECIPROCAL_PI );\n}\nvec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {\n	float dotNV = saturate( dot( normal, viewDir ) );\n	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );\n	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );\n	vec4 r = roughness * c0 + c1;\n	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;\n	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;\n	return fab;\n}\nvec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {\n	vec2 fab = DFGApprox( normal, viewDir, roughness );\n	return specularColor * fab.x + specularF90 * fab.y;\n}\n#ifdef USE_IRIDESCENCE\nvoid computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {\n#else\nvoid computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {\n#endif\n	vec2 fab = DFGApprox( normal, viewDir, roughness );\n	#ifdef USE_IRIDESCENCE\n		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );\n	#else\n		vec3 Fr = specularColor;\n	#endif\n	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;\n	float Ess = fab.x + fab.y;\n	float Ems = 1.0 - Ess;\n	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );\n	singleScatter += FssEss;\n	multiScatter += Fms * Ems;\n}\n#if NUM_RECT_AREA_LIGHTS > 0\n	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {\n		vec3 normal = geometryNormal;\n		vec3 viewDir = geometryViewDir;\n		vec3 position = geometryPosition;\n		vec3 lightPos = rectAreaLight.position;\n		vec3 halfWidth = rectAreaLight.halfWidth;\n		vec3 halfHeight = rectAreaLight.halfHeight;\n		vec3 lightColor = rectAreaLight.color;\n		float roughness = material.roughness;\n		vec3 rectCoords[ 4 ];\n		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;\n		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;\n		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;\n		vec2 uv = LTC_Uv( normal, viewDir, roughness );\n		vec4 t1 = texture2D( ltc_1, uv );\n		vec4 t2 = texture2D( ltc_2, uv );\n		mat3 mInv = mat3(\n			vec3( t1.x, 0, t1.y ),\n			vec3(    0, 1,    0 ),\n			vec3( t1.z, 0, t1.w )\n		);\n		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );\n		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );\n		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );\n	}\n#endif\nvoid RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {\n	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n	vec3 irradiance = dotNL * directLight.color;\n	#ifdef USE_CLEARCOAT\n		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );\n		vec3 ccIrradiance = dotNLcc * directLight.color;\n		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );\n	#endif\n	#ifdef USE_SHEEN\n		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );\n	#endif\n	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {\n	#ifdef USE_CLEARCOAT\n		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );\n	#endif\n	#ifdef USE_SHEEN\n		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );\n	#endif\n	vec3 singleScattering = vec3( 0.0 );\n	vec3 multiScattering = vec3( 0.0 );\n	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;\n	#ifdef USE_IRIDESCENCE\n		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );\n	#else\n		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );\n	#endif\n	vec3 totalScattering = singleScattering + multiScattering;\n	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );\n	reflectedLight.indirectSpecular += radiance * singleScattering;\n	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;\n	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;\n}\n#define RE_Direct				RE_Direct_Physical\n#define RE_Direct_RectArea		RE_Direct_RectArea_Physical\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical\n#define RE_IndirectSpecular		RE_IndirectSpecular_Physical\nfloat computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {\n	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );\n}";
var lights_fragment_begin = "\nvec3 geometryPosition = - vViewPosition;\nvec3 geometryNormal = normal;\nvec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );\nvec3 geometryClearcoatNormal = vec3( 0.0 );\n#ifdef USE_CLEARCOAT\n	geometryClearcoatNormal = clearcoatNormal;\n#endif\n#ifdef USE_IRIDESCENCE\n	float dotNVi = saturate( dot( normal, geometryViewDir ) );\n	if ( material.iridescenceThickness == 0.0 ) {\n		material.iridescence = 0.0;\n	} else {\n		material.iridescence = saturate( material.iridescence );\n	}\n	if ( material.iridescence > 0.0 ) {\n		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );\n		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );\n	}\n#endif\nIncidentLight directLight;\n#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )\n	PointLight pointLight;\n	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0\n	PointLightShadow pointLightShadow;\n	#endif\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {\n		pointLight = pointLights[ i ];\n		getPointLightInfo( pointLight, geometryPosition, directLight );\n		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )\n		pointLightShadow = pointLightShadows[ i ];\n		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;\n		#endif\n		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )\n	SpotLight spotLight;\n	vec4 spotColor;\n	vec3 spotLightCoord;\n	bool inSpotLightMap;\n	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0\n	SpotLightShadow spotLightShadow;\n	#endif\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {\n		spotLight = spotLights[ i ];\n		getSpotLightInfo( spotLight, geometryPosition, directLight );\n		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )\n		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX\n		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )\n		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS\n		#else\n		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )\n		#endif\n		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )\n			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;\n			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );\n			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );\n			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;\n		#endif\n		#undef SPOT_LIGHT_MAP_INDEX\n		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )\n		spotLightShadow = spotLightShadows[ i ];\n		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;\n		#endif\n		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )\n	DirectionalLight directionalLight;\n	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n	DirectionalLightShadow directionalLightShadow;\n	#endif\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {\n		directionalLight = directionalLights[ i ];\n		getDirectionalLightInfo( directionalLight, directLight );\n		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )\n		directionalLightShadow = directionalLightShadows[ i ];\n		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n		#endif\n		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )\n	RectAreaLight rectAreaLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {\n		rectAreaLight = rectAreaLights[ i ];\n		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if defined( RE_IndirectDiffuse )\n	vec3 iblIrradiance = vec3( 0.0 );\n	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );\n	#if defined( USE_LIGHT_PROBES )\n		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );\n	#endif\n	#if ( NUM_HEMI_LIGHTS > 0 )\n		#pragma unroll_loop_start\n		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {\n			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );\n		}\n		#pragma unroll_loop_end\n	#endif\n#endif\n#if defined( RE_IndirectSpecular )\n	vec3 radiance = vec3( 0.0 );\n	vec3 clearcoatRadiance = vec3( 0.0 );\n#endif";
var lights_fragment_maps = "#if defined( RE_IndirectDiffuse )\n	#ifdef USE_LIGHTMAP\n		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );\n		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;\n		irradiance += lightMapIrradiance;\n	#endif\n	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )\n		iblIrradiance += getIBLIrradiance( geometryNormal );\n	#endif\n#endif\n#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )\n	#ifdef USE_ANISOTROPY\n		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );\n	#else\n		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );\n	#endif\n	#ifdef USE_CLEARCOAT\n		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );\n	#endif\n#endif";
var lights_fragment_end = "#if defined( RE_IndirectDiffuse )\n	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n#endif\n#if defined( RE_IndirectSpecular )\n	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n#endif";
var logdepthbuf_fragment = "#if defined( USE_LOGDEPTHBUF )\n	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;\n#endif";
var logdepthbuf_pars_fragment = "#if defined( USE_LOGDEPTHBUF )\n	uniform float logDepthBufFC;\n	varying float vFragDepth;\n	varying float vIsPerspective;\n#endif";
var logdepthbuf_pars_vertex = "#ifdef USE_LOGDEPTHBUF\n	varying float vFragDepth;\n	varying float vIsPerspective;\n#endif";
var logdepthbuf_vertex = "#ifdef USE_LOGDEPTHBUF\n	vFragDepth = 1.0 + gl_Position.w;\n	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );\n#endif";
var map_fragment = "#ifdef USE_MAP\n	vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n	#ifdef DECODE_VIDEO_TEXTURE\n		sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );\n	\n	#endif\n	diffuseColor *= sampledDiffuseColor;\n#endif";
var map_pars_fragment = "#ifdef USE_MAP\n	uniform sampler2D map;\n#endif";
var map_particle_fragment = "#if defined( USE_MAP ) || defined( USE_ALPHAMAP )\n	#if defined( USE_POINTS_UV )\n		vec2 uv = vUv;\n	#else\n		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;\n	#endif\n#endif\n#ifdef USE_MAP\n	diffuseColor *= texture2D( map, uv );\n#endif\n#ifdef USE_ALPHAMAP\n	diffuseColor.a *= texture2D( alphaMap, uv ).g;\n#endif";
var map_particle_pars_fragment = "#if defined( USE_POINTS_UV )\n	varying vec2 vUv;\n#else\n	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )\n		uniform mat3 uvTransform;\n	#endif\n#endif\n#ifdef USE_MAP\n	uniform sampler2D map;\n#endif\n#ifdef USE_ALPHAMAP\n	uniform sampler2D alphaMap;\n#endif";
var metalnessmap_fragment = "float metalnessFactor = metalness;\n#ifdef USE_METALNESSMAP\n	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );\n	metalnessFactor *= texelMetalness.b;\n#endif";
var metalnessmap_pars_fragment = "#ifdef USE_METALNESSMAP\n	uniform sampler2D metalnessMap;\n#endif";
var morphinstance_vertex = "#ifdef USE_INSTANCING_MORPH\n	float morphTargetInfluences[MORPHTARGETS_COUNT];\n	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;\n	}\n#endif";
var morphcolor_vertex = "#if defined( USE_MORPHCOLORS ) && defined( MORPHTARGETS_TEXTURE )\n	vColor *= morphTargetBaseInfluence;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		#if defined( USE_COLOR_ALPHA )\n			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];\n		#elif defined( USE_COLOR )\n			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];\n		#endif\n	}\n#endif";
var morphnormal_vertex = "#ifdef USE_MORPHNORMALS\n	objectNormal *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n			if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];\n		}\n	#else\n		objectNormal += morphNormal0 * morphTargetInfluences[ 0 ];\n		objectNormal += morphNormal1 * morphTargetInfluences[ 1 ];\n		objectNormal += morphNormal2 * morphTargetInfluences[ 2 ];\n		objectNormal += morphNormal3 * morphTargetInfluences[ 3 ];\n	#endif\n#endif";
var morphtarget_pars_vertex = "#ifdef USE_MORPHTARGETS\n	#ifndef USE_INSTANCING_MORPH\n		uniform float morphTargetBaseInfluence;\n	#endif\n	#ifdef MORPHTARGETS_TEXTURE\n		#ifndef USE_INSTANCING_MORPH\n			uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n		#endif\n		uniform sampler2DArray morphTargetsTexture;\n		uniform ivec2 morphTargetsTextureSize;\n		vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {\n			int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;\n			int y = texelIndex / morphTargetsTextureSize.x;\n			int x = texelIndex - y * morphTargetsTextureSize.x;\n			ivec3 morphUV = ivec3( x, y, morphTargetIndex );\n			return texelFetch( morphTargetsTexture, morphUV, 0 );\n		}\n	#else\n		#ifndef USE_MORPHNORMALS\n			uniform float morphTargetInfluences[ 8 ];\n		#else\n			uniform float morphTargetInfluences[ 4 ];\n		#endif\n	#endif\n#endif";
var morphtarget_vertex = "#ifdef USE_MORPHTARGETS\n	transformed *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n			if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];\n		}\n	#else\n		transformed += morphTarget0 * morphTargetInfluences[ 0 ];\n		transformed += morphTarget1 * morphTargetInfluences[ 1 ];\n		transformed += morphTarget2 * morphTargetInfluences[ 2 ];\n		transformed += morphTarget3 * morphTargetInfluences[ 3 ];\n		#ifndef USE_MORPHNORMALS\n			transformed += morphTarget4 * morphTargetInfluences[ 4 ];\n			transformed += morphTarget5 * morphTargetInfluences[ 5 ];\n			transformed += morphTarget6 * morphTargetInfluences[ 6 ];\n			transformed += morphTarget7 * morphTargetInfluences[ 7 ];\n		#endif\n	#endif\n#endif";
var normal_fragment_begin = "float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;\n#ifdef FLAT_SHADED\n	vec3 fdx = dFdx( vViewPosition );\n	vec3 fdy = dFdy( vViewPosition );\n	vec3 normal = normalize( cross( fdx, fdy ) );\n#else\n	vec3 normal = normalize( vNormal );\n	#ifdef DOUBLE_SIDED\n		normal *= faceDirection;\n	#endif\n#endif\n#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )\n	#ifdef USE_TANGENT\n		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );\n	#else\n		mat3 tbn = getTangentFrame( - vViewPosition, normal,\n		#if defined( USE_NORMALMAP )\n			vNormalMapUv\n		#elif defined( USE_CLEARCOAT_NORMALMAP )\n			vClearcoatNormalMapUv\n		#else\n			vUv\n		#endif\n		);\n	#endif\n	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )\n		tbn[0] *= faceDirection;\n		tbn[1] *= faceDirection;\n	#endif\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	#ifdef USE_TANGENT\n		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );\n	#else\n		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );\n	#endif\n	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )\n		tbn2[0] *= faceDirection;\n		tbn2[1] *= faceDirection;\n	#endif\n#endif\nvec3 nonPerturbedNormal = normal;";
var normal_fragment_maps = "#ifdef USE_NORMALMAP_OBJECTSPACE\n	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n	#ifdef FLIP_SIDED\n		normal = - normal;\n	#endif\n	#ifdef DOUBLE_SIDED\n		normal = normal * faceDirection;\n	#endif\n	normal = normalize( normalMatrix * normal );\n#elif defined( USE_NORMALMAP_TANGENTSPACE )\n	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n	mapN.xy *= normalScale;\n	normal = normalize( tbn * mapN );\n#elif defined( USE_BUMPMAP )\n	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );\n#endif";
var normal_pars_fragment = "#ifndef FLAT_SHADED\n	varying vec3 vNormal;\n	#ifdef USE_TANGENT\n		varying vec3 vTangent;\n		varying vec3 vBitangent;\n	#endif\n#endif";
var normal_pars_vertex = "#ifndef FLAT_SHADED\n	varying vec3 vNormal;\n	#ifdef USE_TANGENT\n		varying vec3 vTangent;\n		varying vec3 vBitangent;\n	#endif\n#endif";
var normal_vertex = "#ifndef FLAT_SHADED\n	vNormal = normalize( transformedNormal );\n	#ifdef USE_TANGENT\n		vTangent = normalize( transformedTangent );\n		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );\n	#endif\n#endif";
var normalmap_pars_fragment = "#ifdef USE_NORMALMAP\n	uniform sampler2D normalMap;\n	uniform vec2 normalScale;\n#endif\n#ifdef USE_NORMALMAP_OBJECTSPACE\n	uniform mat3 normalMatrix;\n#endif\n#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )\n	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {\n		vec3 q0 = dFdx( eye_pos.xyz );\n		vec3 q1 = dFdy( eye_pos.xyz );\n		vec2 st0 = dFdx( uv.st );\n		vec2 st1 = dFdy( uv.st );\n		vec3 N = surf_norm;\n		vec3 q1perp = cross( q1, N );\n		vec3 q0perp = cross( N, q0 );\n		vec3 T = q1perp * st0.x + q0perp * st1.x;\n		vec3 B = q1perp * st0.y + q0perp * st1.y;\n		float det = max( dot( T, T ), dot( B, B ) );\n		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );\n		return mat3( T * scale, B * scale, N );\n	}\n#endif";
var clearcoat_normal_fragment_begin = "#ifdef USE_CLEARCOAT\n	vec3 clearcoatNormal = nonPerturbedNormal;\n#endif";
var clearcoat_normal_fragment_maps = "#ifdef USE_CLEARCOAT_NORMALMAP\n	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;\n	clearcoatMapN.xy *= clearcoatNormalScale;\n	clearcoatNormal = normalize( tbn2 * clearcoatMapN );\n#endif";
var clearcoat_pars_fragment = "#ifdef USE_CLEARCOATMAP\n	uniform sampler2D clearcoatMap;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	uniform sampler2D clearcoatNormalMap;\n	uniform vec2 clearcoatNormalScale;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	uniform sampler2D clearcoatRoughnessMap;\n#endif";
var iridescence_pars_fragment = "#ifdef USE_IRIDESCENCEMAP\n	uniform sampler2D iridescenceMap;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	uniform sampler2D iridescenceThicknessMap;\n#endif";
var opaque_fragment = "#ifdef OPAQUE\ndiffuseColor.a = 1.0;\n#endif\n#ifdef USE_TRANSMISSION\ndiffuseColor.a *= material.transmissionAlpha;\n#endif\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );";
var packing = "vec3 packNormalToRGB( const in vec3 normal ) {\n	return normalize( normal ) * 0.5 + 0.5;\n}\nvec3 unpackRGBToNormal( const in vec3 rgb ) {\n	return 2.0 * rgb.xyz - 1.0;\n}\nconst float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;\nconst vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256., 256. );\nconst vec4 UnpackFactors = UnpackDownscale / vec4( PackFactors, 1. );\nconst float ShiftRight8 = 1. / 256.;\nvec4 packDepthToRGBA( const in float v ) {\n	vec4 r = vec4( fract( v * PackFactors ), v );\n	r.yzw -= r.xyz * ShiftRight8;	return r * PackUpscale;\n}\nfloat unpackRGBAToDepth( const in vec4 v ) {\n	return dot( v, UnpackFactors );\n}\nvec2 packDepthToRG( in highp float v ) {\n	return packDepthToRGBA( v ).yx;\n}\nfloat unpackRGToDepth( const in highp vec2 v ) {\n	return unpackRGBAToDepth( vec4( v.xy, 0.0, 0.0 ) );\n}\nvec4 pack2HalfToRGBA( vec2 v ) {\n	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );\n	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );\n}\nvec2 unpackRGBATo2Half( vec4 v ) {\n	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );\n}\nfloat viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {\n	return ( viewZ + near ) / ( near - far );\n}\nfloat orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {\n	return depth * ( near - far ) - near;\n}\nfloat viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {\n	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );\n}\nfloat perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {\n	return ( near * far ) / ( ( far - near ) * depth - far );\n}";
var premultiplied_alpha_fragment = "#ifdef PREMULTIPLIED_ALPHA\n	gl_FragColor.rgb *= gl_FragColor.a;\n#endif";
var project_vertex = "vec4 mvPosition = vec4( transformed, 1.0 );\n#ifdef USE_BATCHING\n	mvPosition = batchingMatrix * mvPosition;\n#endif\n#ifdef USE_INSTANCING\n	mvPosition = instanceMatrix * mvPosition;\n#endif\nmvPosition = modelViewMatrix * mvPosition;\ngl_Position = projectionMatrix * mvPosition;";
var dithering_fragment = "#ifdef DITHERING\n	gl_FragColor.rgb = dithering( gl_FragColor.rgb );\n#endif";
var dithering_pars_fragment = "#ifdef DITHERING\n	vec3 dithering( vec3 color ) {\n		float grid_position = rand( gl_FragCoord.xy );\n		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );\n		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );\n		return color + dither_shift_RGB;\n	}\n#endif";
var roughnessmap_fragment = "float roughnessFactor = roughness;\n#ifdef USE_ROUGHNESSMAP\n	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );\n	roughnessFactor *= texelRoughness.g;\n#endif";
var roughnessmap_pars_fragment = "#ifdef USE_ROUGHNESSMAP\n	uniform sampler2D roughnessMap;\n#endif";
var shadowmap_pars_fragment = "#if NUM_SPOT_LIGHT_COORDS > 0\n	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];\n#endif\n#if NUM_SPOT_LIGHT_MAPS > 0\n	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];\n#endif\n#ifdef USE_SHADOWMAP\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];\n		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];\n		struct DirectionalLightShadow {\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_SPOT_LIGHT_SHADOWS > 0\n		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];\n		struct SpotLightShadow {\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];\n		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];\n		struct PointLightShadow {\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n			float shadowCameraNear;\n			float shadowCameraFar;\n		};\n		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];\n	#endif\n	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {\n		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );\n	}\n	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {\n		return unpackRGBATo2Half( texture2D( shadow, uv ) );\n	}\n	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){\n		float occlusion = 1.0;\n		vec2 distribution = texture2DDistribution( shadow, uv );\n		float hard_shadow = step( compare , distribution.x );\n		if (hard_shadow != 1.0 ) {\n			float distance = compare - distribution.x ;\n			float variance = max( 0.00000, distribution.y * distribution.y );\n			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );\n		}\n		return occlusion;\n	}\n	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {\n		float shadow = 1.0;\n		shadowCoord.xyz /= shadowCoord.w;\n		shadowCoord.z += shadowBias;\n		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;\n		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;\n		if ( frustumTest ) {\n		#if defined( SHADOWMAP_TYPE_PCF )\n			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;\n			float dx0 = - texelSize.x * shadowRadius;\n			float dy0 = - texelSize.y * shadowRadius;\n			float dx1 = + texelSize.x * shadowRadius;\n			float dy1 = + texelSize.y * shadowRadius;\n			float dx2 = dx0 / 2.0;\n			float dy2 = dy0 / 2.0;\n			float dx3 = dx1 / 2.0;\n			float dy3 = dy1 / 2.0;\n			shadow = (\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )\n			) * ( 1.0 / 17.0 );\n		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )\n			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;\n			float dx = texelSize.x;\n			float dy = texelSize.y;\n			vec2 uv = shadowCoord.xy;\n			vec2 f = fract( uv * shadowMapSize + 0.5 );\n			uv -= f * texelSize;\n			shadow = (\n				texture2DCompare( shadowMap, uv, shadowCoord.z ) +\n				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +\n				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),\n					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),\n					 f.x ) +\n				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),\n					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),\n					 f.x ) +\n				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),\n					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),\n					 f.y ) +\n				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),\n					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),\n					 f.y ) +\n				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),\n						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),\n						  f.x ),\n					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),\n						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),\n						  f.x ),\n					 f.y )\n			) * ( 1.0 / 9.0 );\n		#elif defined( SHADOWMAP_TYPE_VSM )\n			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );\n		#else\n			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );\n		#endif\n		}\n		return shadow;\n	}\n	vec2 cubeToUV( vec3 v, float texelSizeY ) {\n		vec3 absV = abs( v );\n		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );\n		absV *= scaleToCube;\n		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );\n		vec2 planar = v.xy;\n		float almostATexel = 1.5 * texelSizeY;\n		float almostOne = 1.0 - almostATexel;\n		if ( absV.z >= almostOne ) {\n			if ( v.z > 0.0 )\n				planar.x = 4.0 - v.x;\n		} else if ( absV.x >= almostOne ) {\n			float signX = sign( v.x );\n			planar.x = v.z * signX + 2.0 * signX;\n		} else if ( absV.y >= almostOne ) {\n			float signY = sign( v.y );\n			planar.x = v.x + 2.0 * signY + 2.0;\n			planar.y = v.z * signY - 2.0;\n		}\n		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );\n	}\n	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {\n		float shadow = 1.0;\n		vec3 lightToPosition = shadowCoord.xyz;\n		\n		float lightToPositionLength = length( lightToPosition );\n		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {\n			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;\n			vec3 bd3D = normalize( lightToPosition );\n			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );\n			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )\n				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;\n				shadow = (\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )\n				) * ( 1.0 / 9.0 );\n			#else\n				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );\n			#endif\n		}\n		return shadow;\n	}\n#endif";
var shadowmap_pars_vertex = "#if NUM_SPOT_LIGHT_COORDS > 0\n	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];\n	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];\n#endif\n#ifdef USE_SHADOWMAP\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];\n		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];\n		struct DirectionalLightShadow {\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_SPOT_LIGHT_SHADOWS > 0\n		struct SpotLightShadow {\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];\n		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];\n		struct PointLightShadow {\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n			float shadowCameraNear;\n			float shadowCameraFar;\n		};\n		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];\n	#endif\n#endif";
var shadowmap_vertex = "#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )\n	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n	vec4 shadowWorldPosition;\n#endif\n#if defined( USE_SHADOWMAP )\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n		#pragma unroll_loop_start\n		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {\n			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );\n			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;\n		}\n		#pragma unroll_loop_end\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n		#pragma unroll_loop_start\n		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {\n			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );\n			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;\n		}\n		#pragma unroll_loop_end\n	#endif\n#endif\n#if NUM_SPOT_LIGHT_COORDS > 0\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {\n		shadowWorldPosition = worldPosition;\n		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )\n			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;\n		#endif\n		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;\n	}\n	#pragma unroll_loop_end\n#endif";
var shadowmask_pars_fragment = "float getShadowMask() {\n	float shadow = 1.0;\n	#ifdef USE_SHADOWMAP\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n	DirectionalLightShadow directionalLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {\n		directionalLight = directionalLightShadows[ i ];\n		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n	}\n	#pragma unroll_loop_end\n	#endif\n	#if NUM_SPOT_LIGHT_SHADOWS > 0\n	SpotLightShadow spotLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {\n		spotLight = spotLightShadows[ i ];\n		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;\n	}\n	#pragma unroll_loop_end\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n	PointLightShadow pointLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {\n		pointLight = pointLightShadows[ i ];\n		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;\n	}\n	#pragma unroll_loop_end\n	#endif\n	#endif\n	return shadow;\n}";
var skinbase_vertex = "#ifdef USE_SKINNING\n	mat4 boneMatX = getBoneMatrix( skinIndex.x );\n	mat4 boneMatY = getBoneMatrix( skinIndex.y );\n	mat4 boneMatZ = getBoneMatrix( skinIndex.z );\n	mat4 boneMatW = getBoneMatrix( skinIndex.w );\n#endif";
var skinning_pars_vertex = "#ifdef USE_SKINNING\n	uniform mat4 bindMatrix;\n	uniform mat4 bindMatrixInverse;\n	uniform highp sampler2D boneTexture;\n	mat4 getBoneMatrix( const in float i ) {\n		int size = textureSize( boneTexture, 0 ).x;\n		int j = int( i ) * 4;\n		int x = j % size;\n		int y = j / size;\n		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );\n		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );\n		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );\n		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );\n		return mat4( v1, v2, v3, v4 );\n	}\n#endif";
var skinning_vertex = "#ifdef USE_SKINNING\n	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );\n	vec4 skinned = vec4( 0.0 );\n	skinned += boneMatX * skinVertex * skinWeight.x;\n	skinned += boneMatY * skinVertex * skinWeight.y;\n	skinned += boneMatZ * skinVertex * skinWeight.z;\n	skinned += boneMatW * skinVertex * skinWeight.w;\n	transformed = ( bindMatrixInverse * skinned ).xyz;\n#endif";
var skinnormal_vertex = "#ifdef USE_SKINNING\n	mat4 skinMatrix = mat4( 0.0 );\n	skinMatrix += skinWeight.x * boneMatX;\n	skinMatrix += skinWeight.y * boneMatY;\n	skinMatrix += skinWeight.z * boneMatZ;\n	skinMatrix += skinWeight.w * boneMatW;\n	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;\n	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;\n	#ifdef USE_TANGENT\n		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;\n	#endif\n#endif";
var specularmap_fragment = "float specularStrength;\n#ifdef USE_SPECULARMAP\n	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );\n	specularStrength = texelSpecular.r;\n#else\n	specularStrength = 1.0;\n#endif";
var specularmap_pars_fragment = "#ifdef USE_SPECULARMAP\n	uniform sampler2D specularMap;\n#endif";
var tonemapping_fragment = "#if defined( TONE_MAPPING )\n	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );\n#endif";
var tonemapping_pars_fragment = "#ifndef saturate\n#define saturate( a ) clamp( a, 0.0, 1.0 )\n#endif\nuniform float toneMappingExposure;\nvec3 LinearToneMapping( vec3 color ) {\n	return saturate( toneMappingExposure * color );\n}\nvec3 ReinhardToneMapping( vec3 color ) {\n	color *= toneMappingExposure;\n	return saturate( color / ( vec3( 1.0 ) + color ) );\n}\nvec3 OptimizedCineonToneMapping( vec3 color ) {\n	color *= toneMappingExposure;\n	color = max( vec3( 0.0 ), color - 0.004 );\n	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );\n}\nvec3 RRTAndODTFit( vec3 v ) {\n	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;\n	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;\n	return a / b;\n}\nvec3 ACESFilmicToneMapping( vec3 color ) {\n	const mat3 ACESInputMat = mat3(\n		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),\n		vec3( 0.04823, 0.01566, 0.83777 )\n	);\n	const mat3 ACESOutputMat = mat3(\n		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),\n		vec3( -0.07367, -0.00605,  1.07602 )\n	);\n	color *= toneMappingExposure / 0.6;\n	color = ACESInputMat * color;\n	color = RRTAndODTFit( color );\n	color = ACESOutputMat * color;\n	return saturate( color );\n}\nconst mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(\n	vec3( 1.6605, - 0.1246, - 0.0182 ),\n	vec3( - 0.5876, 1.1329, - 0.1006 ),\n	vec3( - 0.0728, - 0.0083, 1.1187 )\n);\nconst mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(\n	vec3( 0.6274, 0.0691, 0.0164 ),\n	vec3( 0.3293, 0.9195, 0.0880 ),\n	vec3( 0.0433, 0.0113, 0.8956 )\n);\nvec3 agxDefaultContrastApprox( vec3 x ) {\n	vec3 x2 = x * x;\n	vec3 x4 = x2 * x2;\n	return + 15.5 * x4 * x2\n		- 40.14 * x4 * x\n		+ 31.96 * x4\n		- 6.868 * x2 * x\n		+ 0.4298 * x2\n		+ 0.1191 * x\n		- 0.00232;\n}\nvec3 AgXToneMapping( vec3 color ) {\n	const mat3 AgXInsetMatrix = mat3(\n		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),\n		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),\n		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )\n	);\n	const mat3 AgXOutsetMatrix = mat3(\n		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),\n		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),\n		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )\n	);\n	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;\n	color *= toneMappingExposure;\n	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;\n	color = AgXInsetMatrix * color;\n	color = max( color, 1e-10 );	color = log2( color );\n	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );\n	color = clamp( color, 0.0, 1.0 );\n	color = agxDefaultContrastApprox( color );\n	color = AgXOutsetMatrix * color;\n	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );\n	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;\n	color = clamp( color, 0.0, 1.0 );\n	return color;\n}\nvec3 NeutralToneMapping( vec3 color ) {\n	const float StartCompression = 0.8 - 0.04;\n	const float Desaturation = 0.15;\n	color *= toneMappingExposure;\n	float x = min( color.r, min( color.g, color.b ) );\n	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;\n	color -= offset;\n	float peak = max( color.r, max( color.g, color.b ) );\n	if ( peak < StartCompression ) return color;\n	float d = 1. - StartCompression;\n	float newPeak = 1. - d * d / ( peak + d - StartCompression );\n	color *= newPeak / peak;\n	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );\n	return mix( color, vec3( newPeak ), g );\n}\nvec3 CustomToneMapping( vec3 color ) { return color; }";
var transmission_fragment = "#ifdef USE_TRANSMISSION\n	material.transmission = transmission;\n	material.transmissionAlpha = 1.0;\n	material.thickness = thickness;\n	material.attenuationDistance = attenuationDistance;\n	material.attenuationColor = attenuationColor;\n	#ifdef USE_TRANSMISSIONMAP\n		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;\n	#endif\n	#ifdef USE_THICKNESSMAP\n		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;\n	#endif\n	vec3 pos = vWorldPosition;\n	vec3 v = normalize( cameraPosition - pos );\n	vec3 n = inverseTransformDirection( normal, viewMatrix );\n	vec4 transmitted = getIBLVolumeRefraction(\n		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,\n		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,\n		material.attenuationColor, material.attenuationDistance );\n	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );\n	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );\n#endif";
var transmission_pars_fragment = "#ifdef USE_TRANSMISSION\n	uniform float transmission;\n	uniform float thickness;\n	uniform float attenuationDistance;\n	uniform vec3 attenuationColor;\n	#ifdef USE_TRANSMISSIONMAP\n		uniform sampler2D transmissionMap;\n	#endif\n	#ifdef USE_THICKNESSMAP\n		uniform sampler2D thicknessMap;\n	#endif\n	uniform vec2 transmissionSamplerSize;\n	uniform sampler2D transmissionSamplerMap;\n	uniform mat4 modelMatrix;\n	uniform mat4 projectionMatrix;\n	varying vec3 vWorldPosition;\n	float w0( float a ) {\n		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );\n	}\n	float w1( float a ) {\n		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );\n	}\n	float w2( float a ){\n		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );\n	}\n	float w3( float a ) {\n		return ( 1.0 / 6.0 ) * ( a * a * a );\n	}\n	float g0( float a ) {\n		return w0( a ) + w1( a );\n	}\n	float g1( float a ) {\n		return w2( a ) + w3( a );\n	}\n	float h0( float a ) {\n		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );\n	}\n	float h1( float a ) {\n		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );\n	}\n	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {\n		uv = uv * texelSize.zw + 0.5;\n		vec2 iuv = floor( uv );\n		vec2 fuv = fract( uv );\n		float g0x = g0( fuv.x );\n		float g1x = g1( fuv.x );\n		float h0x = h0( fuv.x );\n		float h1x = h1( fuv.x );\n		float h0y = h0( fuv.y );\n		float h1y = h1( fuv.y );\n		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;\n		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;\n		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;\n		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;\n		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +\n			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );\n	}\n	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {\n		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );\n		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );\n		vec2 fLodSizeInv = 1.0 / fLodSize;\n		vec2 cLodSizeInv = 1.0 / cLodSize;\n		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );\n		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );\n		return mix( fSample, cSample, fract( lod ) );\n	}\n	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {\n		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );\n		vec3 modelScale;\n		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );\n		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );\n		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );\n		return normalize( refractionVector ) * thickness * modelScale;\n	}\n	float applyIorToRoughness( const in float roughness, const in float ior ) {\n		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );\n	}\n	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {\n		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );\n		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );\n	}\n	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {\n		if ( isinf( attenuationDistance ) ) {\n			return vec3( 1.0 );\n		} else {\n			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;\n			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;\n		}\n	}\n	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,\n		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,\n		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,\n		const in vec3 attenuationColor, const in float attenuationDistance ) {\n		vec4 transmittedLight;\n		vec3 transmittance;\n		#ifdef USE_DISPERSION\n			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;\n			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );\n			for ( int i = 0; i < 3; i ++ ) {\n				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );\n				vec3 refractedRayExit = position + transmissionRay;\n		\n				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );\n				vec2 refractionCoords = ndcPos.xy / ndcPos.w;\n				refractionCoords += 1.0;\n				refractionCoords /= 2.0;\n		\n				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );\n				transmittedLight[ i ] = transmissionSample[ i ];\n				transmittedLight.a += transmissionSample.a;\n				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];\n			}\n			transmittedLight.a /= 3.0;\n		\n		#else\n		\n			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );\n			vec3 refractedRayExit = position + transmissionRay;\n			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );\n			vec2 refractionCoords = ndcPos.xy / ndcPos.w;\n			refractionCoords += 1.0;\n			refractionCoords /= 2.0;\n			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );\n			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );\n		\n		#endif\n		vec3 attenuatedColor = transmittance * transmittedLight.rgb;\n		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );\n		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;\n		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );\n	}\n#endif";
var uv_pars_fragment = "#if defined( USE_UV ) || defined( USE_ANISOTROPY )\n	varying vec2 vUv;\n#endif\n#ifdef USE_MAP\n	varying vec2 vMapUv;\n#endif\n#ifdef USE_ALPHAMAP\n	varying vec2 vAlphaMapUv;\n#endif\n#ifdef USE_LIGHTMAP\n	varying vec2 vLightMapUv;\n#endif\n#ifdef USE_AOMAP\n	varying vec2 vAoMapUv;\n#endif\n#ifdef USE_BUMPMAP\n	varying vec2 vBumpMapUv;\n#endif\n#ifdef USE_NORMALMAP\n	varying vec2 vNormalMapUv;\n#endif\n#ifdef USE_EMISSIVEMAP\n	varying vec2 vEmissiveMapUv;\n#endif\n#ifdef USE_METALNESSMAP\n	varying vec2 vMetalnessMapUv;\n#endif\n#ifdef USE_ROUGHNESSMAP\n	varying vec2 vRoughnessMapUv;\n#endif\n#ifdef USE_ANISOTROPYMAP\n	varying vec2 vAnisotropyMapUv;\n#endif\n#ifdef USE_CLEARCOATMAP\n	varying vec2 vClearcoatMapUv;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	varying vec2 vClearcoatNormalMapUv;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	varying vec2 vClearcoatRoughnessMapUv;\n#endif\n#ifdef USE_IRIDESCENCEMAP\n	varying vec2 vIridescenceMapUv;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	varying vec2 vIridescenceThicknessMapUv;\n#endif\n#ifdef USE_SHEEN_COLORMAP\n	varying vec2 vSheenColorMapUv;\n#endif\n#ifdef USE_SHEEN_ROUGHNESSMAP\n	varying vec2 vSheenRoughnessMapUv;\n#endif\n#ifdef USE_SPECULARMAP\n	varying vec2 vSpecularMapUv;\n#endif\n#ifdef USE_SPECULAR_COLORMAP\n	varying vec2 vSpecularColorMapUv;\n#endif\n#ifdef USE_SPECULAR_INTENSITYMAP\n	varying vec2 vSpecularIntensityMapUv;\n#endif\n#ifdef USE_TRANSMISSIONMAP\n	uniform mat3 transmissionMapTransform;\n	varying vec2 vTransmissionMapUv;\n#endif\n#ifdef USE_THICKNESSMAP\n	uniform mat3 thicknessMapTransform;\n	varying vec2 vThicknessMapUv;\n#endif";
var uv_pars_vertex = "#if defined( USE_UV ) || defined( USE_ANISOTROPY )\n	varying vec2 vUv;\n#endif\n#ifdef USE_MAP\n	uniform mat3 mapTransform;\n	varying vec2 vMapUv;\n#endif\n#ifdef USE_ALPHAMAP\n	uniform mat3 alphaMapTransform;\n	varying vec2 vAlphaMapUv;\n#endif\n#ifdef USE_LIGHTMAP\n	uniform mat3 lightMapTransform;\n	varying vec2 vLightMapUv;\n#endif\n#ifdef USE_AOMAP\n	uniform mat3 aoMapTransform;\n	varying vec2 vAoMapUv;\n#endif\n#ifdef USE_BUMPMAP\n	uniform mat3 bumpMapTransform;\n	varying vec2 vBumpMapUv;\n#endif\n#ifdef USE_NORMALMAP\n	uniform mat3 normalMapTransform;\n	varying vec2 vNormalMapUv;\n#endif\n#ifdef USE_DISPLACEMENTMAP\n	uniform mat3 displacementMapTransform;\n	varying vec2 vDisplacementMapUv;\n#endif\n#ifdef USE_EMISSIVEMAP\n	uniform mat3 emissiveMapTransform;\n	varying vec2 vEmissiveMapUv;\n#endif\n#ifdef USE_METALNESSMAP\n	uniform mat3 metalnessMapTransform;\n	varying vec2 vMetalnessMapUv;\n#endif\n#ifdef USE_ROUGHNESSMAP\n	uniform mat3 roughnessMapTransform;\n	varying vec2 vRoughnessMapUv;\n#endif\n#ifdef USE_ANISOTROPYMAP\n	uniform mat3 anisotropyMapTransform;\n	varying vec2 vAnisotropyMapUv;\n#endif\n#ifdef USE_CLEARCOATMAP\n	uniform mat3 clearcoatMapTransform;\n	varying vec2 vClearcoatMapUv;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	uniform mat3 clearcoatNormalMapTransform;\n	varying vec2 vClearcoatNormalMapUv;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	uniform mat3 clearcoatRoughnessMapTransform;\n	varying vec2 vClearcoatRoughnessMapUv;\n#endif\n#ifdef USE_SHEEN_COLORMAP\n	uniform mat3 sheenColorMapTransform;\n	varying vec2 vSheenColorMapUv;\n#endif\n#ifdef USE_SHEEN_ROUGHNESSMAP\n	uniform mat3 sheenRoughnessMapTransform;\n	varying vec2 vSheenRoughnessMapUv;\n#endif\n#ifdef USE_IRIDESCENCEMAP\n	uniform mat3 iridescenceMapTransform;\n	varying vec2 vIridescenceMapUv;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	uniform mat3 iridescenceThicknessMapTransform;\n	varying vec2 vIridescenceThicknessMapUv;\n#endif\n#ifdef USE_SPECULARMAP\n	uniform mat3 specularMapTransform;\n	varying vec2 vSpecularMapUv;\n#endif\n#ifdef USE_SPECULAR_COLORMAP\n	uniform mat3 specularColorMapTransform;\n	varying vec2 vSpecularColorMapUv;\n#endif\n#ifdef USE_SPECULAR_INTENSITYMAP\n	uniform mat3 specularIntensityMapTransform;\n	varying vec2 vSpecularIntensityMapUv;\n#endif\n#ifdef USE_TRANSMISSIONMAP\n	uniform mat3 transmissionMapTransform;\n	varying vec2 vTransmissionMapUv;\n#endif\n#ifdef USE_THICKNESSMAP\n	uniform mat3 thicknessMapTransform;\n	varying vec2 vThicknessMapUv;\n#endif";
var uv_vertex = "#if defined( USE_UV ) || defined( USE_ANISOTROPY )\n	vUv = vec3( uv, 1 ).xy;\n#endif\n#ifdef USE_MAP\n	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_ALPHAMAP\n	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_LIGHTMAP\n	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_AOMAP\n	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_BUMPMAP\n	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_NORMALMAP\n	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_DISPLACEMENTMAP\n	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_EMISSIVEMAP\n	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_METALNESSMAP\n	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_ROUGHNESSMAP\n	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_ANISOTROPYMAP\n	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_CLEARCOATMAP\n	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_IRIDESCENCEMAP\n	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SHEEN_COLORMAP\n	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SHEEN_ROUGHNESSMAP\n	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SPECULARMAP\n	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SPECULAR_COLORMAP\n	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SPECULAR_INTENSITYMAP\n	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_TRANSMISSIONMAP\n	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_THICKNESSMAP\n	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;\n#endif";
var worldpos_vertex = "#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\n	vec4 worldPosition = vec4( transformed, 1.0 );\n	#ifdef USE_BATCHING\n		worldPosition = batchingMatrix * worldPosition;\n	#endif\n	#ifdef USE_INSTANCING\n		worldPosition = instanceMatrix * worldPosition;\n	#endif\n	worldPosition = modelMatrix * worldPosition;\n#endif";
var vertex$h = "varying vec2 vUv;\nuniform mat3 uvTransform;\nvoid main() {\n	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;\n	gl_Position = vec4( position.xy, 1.0, 1.0 );\n}";
var fragment$h = "uniform sampler2D t2D;\nuniform float backgroundIntensity;\nvarying vec2 vUv;\nvoid main() {\n	vec4 texColor = texture2D( t2D, vUv );\n	#ifdef DECODE_VIDEO_TEXTURE\n		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );\n	#endif\n	texColor.rgb *= backgroundIntensity;\n	gl_FragColor = texColor;\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$g = "varying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vWorldDirection = transformDirection( position, modelMatrix );\n	#include <begin_vertex>\n	#include <project_vertex>\n	gl_Position.z = gl_Position.w;\n}";
var fragment$g = "#ifdef ENVMAP_TYPE_CUBE\n	uniform samplerCube envMap;\n#elif defined( ENVMAP_TYPE_CUBE_UV )\n	uniform sampler2D envMap;\n#endif\nuniform float flipEnvMap;\nuniform float backgroundBlurriness;\nuniform float backgroundIntensity;\nuniform mat3 backgroundRotation;\nvarying vec3 vWorldDirection;\n#include <cube_uv_reflection_fragment>\nvoid main() {\n	#ifdef ENVMAP_TYPE_CUBE\n		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );\n	#elif defined( ENVMAP_TYPE_CUBE_UV )\n		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );\n	#else\n		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );\n	#endif\n	texColor.rgb *= backgroundIntensity;\n	gl_FragColor = texColor;\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$f = "varying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vWorldDirection = transformDirection( position, modelMatrix );\n	#include <begin_vertex>\n	#include <project_vertex>\n	gl_Position.z = gl_Position.w;\n}";
var fragment$f = "uniform samplerCube tCube;\nuniform float tFlip;\nuniform float opacity;\nvarying vec3 vWorldDirection;\nvoid main() {\n	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );\n	gl_FragColor = texColor;\n	gl_FragColor.a *= opacity;\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$e = "#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvarying vec2 vHighPrecisionZW;\nvoid main() {\n	#include <uv_vertex>\n	#include <batching_vertex>\n	#include <skinbase_vertex>\n	#include <morphinstance_vertex>\n	#ifdef USE_DISPLACEMENTMAP\n		#include <beginnormal_vertex>\n		#include <morphnormal_vertex>\n		#include <skinnormal_vertex>\n	#endif\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vHighPrecisionZW = gl_Position.zw;\n}";
var fragment$e = "#if DEPTH_PACKING == 3200\n	uniform float opacity;\n#endif\n#include <common>\n#include <packing>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvarying vec2 vHighPrecisionZW;\nvoid main() {\n	vec4 diffuseColor = vec4( 1.0 );\n	#include <clipping_planes_fragment>\n	#if DEPTH_PACKING == 3200\n		diffuseColor.a = opacity;\n	#endif\n	#include <map_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <logdepthbuf_fragment>\n	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;\n	#if DEPTH_PACKING == 3200\n		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );\n	#elif DEPTH_PACKING == 3201\n		gl_FragColor = packDepthToRGBA( fragCoordZ );\n	#endif\n}";
var vertex$d = "#define DISTANCE\nvarying vec3 vWorldPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <batching_vertex>\n	#include <skinbase_vertex>\n	#include <morphinstance_vertex>\n	#ifdef USE_DISPLACEMENTMAP\n		#include <beginnormal_vertex>\n		#include <morphnormal_vertex>\n		#include <skinnormal_vertex>\n	#endif\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <worldpos_vertex>\n	#include <clipping_planes_vertex>\n	vWorldPosition = worldPosition.xyz;\n}";
var fragment$d = "#define DISTANCE\nuniform vec3 referencePosition;\nuniform float nearDistance;\nuniform float farDistance;\nvarying vec3 vWorldPosition;\n#include <common>\n#include <packing>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main () {\n	vec4 diffuseColor = vec4( 1.0 );\n	#include <clipping_planes_fragment>\n	#include <map_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	float dist = length( vWorldPosition - referencePosition );\n	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );\n	dist = saturate( dist );\n	gl_FragColor = packDepthToRGBA( dist );\n}";
var vertex$c = "varying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vWorldDirection = transformDirection( position, modelMatrix );\n	#include <begin_vertex>\n	#include <project_vertex>\n}";
var fragment$c = "uniform sampler2D tEquirect;\nvarying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vec3 direction = normalize( vWorldDirection );\n	vec2 sampleUV = equirectUv( direction );\n	gl_FragColor = texture2D( tEquirect, sampleUV );\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$b = "uniform float scale;\nattribute float lineDistance;\nvarying float vLineDistance;\n#include <common>\n#include <uv_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	vLineDistance = scale * lineDistance;\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <fog_vertex>\n}";
var fragment$b = "uniform vec3 diffuse;\nuniform float opacity;\nuniform float dashSize;\nuniform float totalSize;\nvarying float vLineDistance;\n#include <common>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	if ( mod( vLineDistance, totalSize ) > dashSize ) {\n		discard;\n	}\n	vec3 outgoingLight = vec3( 0.0 );\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	outgoingLight = diffuseColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n}";
var vertex$a = "#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <envmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )\n		#include <beginnormal_vertex>\n		#include <morphnormal_vertex>\n		#include <skinbase_vertex>\n		#include <skinnormal_vertex>\n		#include <defaultnormal_vertex>\n	#endif\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <worldpos_vertex>\n	#include <envmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$a = "uniform vec3 diffuse;\nuniform float opacity;\n#ifndef FLAT_SHADED\n	varying vec3 vNormal;\n#endif\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <specularmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <specularmap_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	#ifdef USE_LIGHTMAP\n		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );\n		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;\n	#else\n		reflectedLight.indirectDiffuse += vec3( 1.0 );\n	#endif\n	#include <aomap_fragment>\n	reflectedLight.indirectDiffuse *= diffuseColor.rgb;\n	vec3 outgoingLight = reflectedLight.indirectDiffuse;\n	#include <envmap_fragment>\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$9 = "#define LAMBERT\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <envmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <envmap_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$9 = "#define LAMBERT\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform float opacity;\n#include <common>\n#include <packing>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_lambert_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <specularmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <specularmap_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_lambert_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n	#include <envmap_fragment>\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$8 = "#define MATCAP\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <color_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <fog_vertex>\n	vViewPosition = - mvPosition.xyz;\n}";
var fragment$8 = "#define MATCAP\nuniform vec3 diffuse;\nuniform float opacity;\nuniform sampler2D matcap;\nvarying vec3 vViewPosition;\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <fog_pars_fragment>\n#include <normal_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	vec3 viewDir = normalize( vViewPosition );\n	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );\n	vec3 y = cross( viewDir, x );\n	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;\n	#ifdef USE_MATCAP\n		vec4 matcapColor = texture2D( matcap, uv );\n	#else\n		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );\n	#endif\n	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$7 = "#define NORMAL\n#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )\n	varying vec3 vViewPosition;\n#endif\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphinstance_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )\n	vViewPosition = - mvPosition.xyz;\n#endif\n}";
var fragment$7 = "#define NORMAL\nuniform float opacity;\n#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )\n	varying vec3 vViewPosition;\n#endif\n#include <packing>\n#include <uv_pars_fragment>\n#include <normal_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );\n	#include <clipping_planes_fragment>\n	#include <logdepthbuf_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );\n	#ifdef OPAQUE\n		gl_FragColor.a = 1.0;\n	#endif\n}";
var vertex$6 = "#define PHONG\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <envmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphinstance_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <envmap_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$6 = "#define PHONG\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform vec3 specular;\nuniform float shininess;\nuniform float opacity;\n#include <common>\n#include <packing>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_phong_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <specularmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <specularmap_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_phong_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;\n	#include <envmap_fragment>\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$5 = "#define STANDARD\nvarying vec3 vViewPosition;\n#ifdef USE_TRANSMISSION\n	varying vec3 vWorldPosition;\n#endif\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n#ifdef USE_TRANSMISSION\n	vWorldPosition = worldPosition.xyz;\n#endif\n}";
var fragment$5 = "#define STANDARD\n#ifdef PHYSICAL\n	#define IOR\n	#define USE_SPECULAR\n#endif\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform float roughness;\nuniform float metalness;\nuniform float opacity;\n#ifdef IOR\n	uniform float ior;\n#endif\n#ifdef USE_SPECULAR\n	uniform float specularIntensity;\n	uniform vec3 specularColor;\n	#ifdef USE_SPECULAR_COLORMAP\n		uniform sampler2D specularColorMap;\n	#endif\n	#ifdef USE_SPECULAR_INTENSITYMAP\n		uniform sampler2D specularIntensityMap;\n	#endif\n#endif\n#ifdef USE_CLEARCOAT\n	uniform float clearcoat;\n	uniform float clearcoatRoughness;\n#endif\n#ifdef USE_DISPERSION\n	uniform float dispersion;\n#endif\n#ifdef USE_IRIDESCENCE\n	uniform float iridescence;\n	uniform float iridescenceIOR;\n	uniform float iridescenceThicknessMinimum;\n	uniform float iridescenceThicknessMaximum;\n#endif\n#ifdef USE_SHEEN\n	uniform vec3 sheenColor;\n	uniform float sheenRoughness;\n	#ifdef USE_SHEEN_COLORMAP\n		uniform sampler2D sheenColorMap;\n	#endif\n	#ifdef USE_SHEEN_ROUGHNESSMAP\n		uniform sampler2D sheenRoughnessMap;\n	#endif\n#endif\n#ifdef USE_ANISOTROPY\n	uniform vec2 anisotropyVector;\n	#ifdef USE_ANISOTROPYMAP\n		uniform sampler2D anisotropyMap;\n	#endif\n#endif\nvarying vec3 vViewPosition;\n#include <common>\n#include <packing>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <iridescence_fragment>\n#include <cube_uv_reflection_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_physical_pars_fragment>\n#include <fog_pars_fragment>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_physical_pars_fragment>\n#include <transmission_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <clearcoat_pars_fragment>\n#include <iridescence_pars_fragment>\n#include <roughnessmap_pars_fragment>\n#include <metalnessmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <roughnessmap_fragment>\n	#include <metalnessmap_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <clearcoat_normal_fragment_begin>\n	#include <clearcoat_normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_physical_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;\n	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;\n	#include <transmission_fragment>\n	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\n	#ifdef USE_SHEEN\n		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );\n		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;\n	#endif\n	#ifdef USE_CLEARCOAT\n		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );\n		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );\n		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;\n	#endif\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$4 = "#define TOON\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$4 = "#define TOON\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform float opacity;\n#include <common>\n#include <packing>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <gradientmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_toon_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_toon_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$3 = "uniform float size;\nuniform float scale;\n#include <common>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\n#ifdef USE_POINTS_UV\n	varying vec2 vUv;\n	uniform mat3 uvTransform;\n#endif\nvoid main() {\n	#ifdef USE_POINTS_UV\n		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;\n	#endif\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <project_vertex>\n	gl_PointSize = size;\n	#ifdef USE_SIZEATTENUATION\n		bool isPerspective = isPerspectiveMatrix( projectionMatrix );\n		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );\n	#endif\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <worldpos_vertex>\n	#include <fog_vertex>\n}";
var fragment$3 = "uniform vec3 diffuse;\nuniform float opacity;\n#include <common>\n#include <color_pars_fragment>\n#include <map_particle_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	vec3 outgoingLight = vec3( 0.0 );\n	#include <logdepthbuf_fragment>\n	#include <map_particle_fragment>\n	#include <color_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	outgoingLight = diffuseColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n}";
var vertex$2 = "#include <common>\n#include <batching_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <shadowmap_pars_vertex>\nvoid main() {\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphinstance_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <worldpos_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$2 = "uniform vec3 color;\nuniform float opacity;\n#include <common>\n#include <packing>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <logdepthbuf_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>\nvoid main() {\n	#include <logdepthbuf_fragment>\n	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n}";
var vertex$1 = "uniform float rotation;\nuniform vec2 center;\n#include <common>\n#include <uv_pars_vertex>\n#include <fog_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );\n	vec2 scale;\n	scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );\n	scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );\n	#ifndef USE_SIZEATTENUATION\n		bool isPerspective = isPerspectiveMatrix( projectionMatrix );\n		if ( isPerspective ) scale *= - mvPosition.z;\n	#endif\n	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;\n	vec2 rotatedPosition;\n	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;\n	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;\n	mvPosition.xy += rotatedPosition;\n	gl_Position = projectionMatrix * mvPosition;\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <fog_vertex>\n}";
var fragment$1 = "uniform vec3 diffuse;\nuniform float opacity;\n#include <common>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	vec3 outgoingLight = vec3( 0.0 );\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	outgoingLight = diffuseColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n}";
var ShaderChunk = {
  alphahash_fragment,
  alphahash_pars_fragment,
  alphamap_fragment,
  alphamap_pars_fragment,
  alphatest_fragment,
  alphatest_pars_fragment,
  aomap_fragment,
  aomap_pars_fragment,
  batching_pars_vertex,
  batching_vertex,
  begin_vertex,
  beginnormal_vertex,
  bsdfs,
  iridescence_fragment,
  bumpmap_pars_fragment,
  clipping_planes_fragment,
  clipping_planes_pars_fragment,
  clipping_planes_pars_vertex,
  clipping_planes_vertex,
  color_fragment,
  color_pars_fragment,
  color_pars_vertex,
  color_vertex,
  common,
  cube_uv_reflection_fragment,
  defaultnormal_vertex,
  displacementmap_pars_vertex,
  displacementmap_vertex,
  emissivemap_fragment,
  emissivemap_pars_fragment,
  colorspace_fragment,
  colorspace_pars_fragment,
  envmap_fragment,
  envmap_common_pars_fragment,
  envmap_pars_fragment,
  envmap_pars_vertex,
  envmap_physical_pars_fragment,
  envmap_vertex,
  fog_vertex,
  fog_pars_vertex,
  fog_fragment,
  fog_pars_fragment,
  gradientmap_pars_fragment,
  lightmap_pars_fragment,
  lights_lambert_fragment,
  lights_lambert_pars_fragment,
  lights_pars_begin,
  lights_toon_fragment,
  lights_toon_pars_fragment,
  lights_phong_fragment,
  lights_phong_pars_fragment,
  lights_physical_fragment,
  lights_physical_pars_fragment,
  lights_fragment_begin,
  lights_fragment_maps,
  lights_fragment_end,
  logdepthbuf_fragment,
  logdepthbuf_pars_fragment,
  logdepthbuf_pars_vertex,
  logdepthbuf_vertex,
  map_fragment,
  map_pars_fragment,
  map_particle_fragment,
  map_particle_pars_fragment,
  metalnessmap_fragment,
  metalnessmap_pars_fragment,
  morphinstance_vertex,
  morphcolor_vertex,
  morphnormal_vertex,
  morphtarget_pars_vertex,
  morphtarget_vertex,
  normal_fragment_begin,
  normal_fragment_maps,
  normal_pars_fragment,
  normal_pars_vertex,
  normal_vertex,
  normalmap_pars_fragment,
  clearcoat_normal_fragment_begin,
  clearcoat_normal_fragment_maps,
  clearcoat_pars_fragment,
  iridescence_pars_fragment,
  opaque_fragment,
  packing,
  premultiplied_alpha_fragment,
  project_vertex,
  dithering_fragment,
  dithering_pars_fragment,
  roughnessmap_fragment,
  roughnessmap_pars_fragment,
  shadowmap_pars_fragment,
  shadowmap_pars_vertex,
  shadowmap_vertex,
  shadowmask_pars_fragment,
  skinbase_vertex,
  skinning_pars_vertex,
  skinning_vertex,
  skinnormal_vertex,
  specularmap_fragment,
  specularmap_pars_fragment,
  tonemapping_fragment,
  tonemapping_pars_fragment,
  transmission_fragment,
  transmission_pars_fragment,
  uv_pars_fragment,
  uv_pars_vertex,
  uv_vertex,
  worldpos_vertex,
  background_vert: vertex$h,
  background_frag: fragment$h,
  backgroundCube_vert: vertex$g,
  backgroundCube_frag: fragment$g,
  cube_vert: vertex$f,
  cube_frag: fragment$f,
  depth_vert: vertex$e,
  depth_frag: fragment$e,
  distanceRGBA_vert: vertex$d,
  distanceRGBA_frag: fragment$d,
  equirect_vert: vertex$c,
  equirect_frag: fragment$c,
  linedashed_vert: vertex$b,
  linedashed_frag: fragment$b,
  meshbasic_vert: vertex$a,
  meshbasic_frag: fragment$a,
  meshlambert_vert: vertex$9,
  meshlambert_frag: fragment$9,
  meshmatcap_vert: vertex$8,
  meshmatcap_frag: fragment$8,
  meshnormal_vert: vertex$7,
  meshnormal_frag: fragment$7,
  meshphong_vert: vertex$6,
  meshphong_frag: fragment$6,
  meshphysical_vert: vertex$5,
  meshphysical_frag: fragment$5,
  meshtoon_vert: vertex$4,
  meshtoon_frag: fragment$4,
  points_vert: vertex$3,
  points_frag: fragment$3,
  shadow_vert: vertex$2,
  shadow_frag: fragment$2,
  sprite_vert: vertex$1,
  sprite_frag: fragment$1
};
var UniformsLib = {
  common: {
    diffuse: { value: /* @__PURE__ */ new Color(16777215) },
    opacity: { value: 1 },
    map: { value: null },
    mapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaMap: { value: null },
    alphaMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaTest: { value: 0 }
  },
  specularmap: {
    specularMap: { value: null },
    specularMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  envmap: {
    envMap: { value: null },
    envMapRotation: { value: /* @__PURE__ */ new Matrix3() },
    flipEnvMap: { value: -1 },
    reflectivity: { value: 1 },
    // basic, lambert, phong
    ior: { value: 1.5 },
    // physical
    refractionRatio: { value: 0.98 }
    // basic, lambert, phong
  },
  aomap: {
    aoMap: { value: null },
    aoMapIntensity: { value: 1 },
    aoMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  lightmap: {
    lightMap: { value: null },
    lightMapIntensity: { value: 1 },
    lightMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  bumpmap: {
    bumpMap: { value: null },
    bumpMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    bumpScale: { value: 1 }
  },
  normalmap: {
    normalMap: { value: null },
    normalMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    normalScale: { value: /* @__PURE__ */ new Vector2(1, 1) }
  },
  displacementmap: {
    displacementMap: { value: null },
    displacementMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    displacementScale: { value: 1 },
    displacementBias: { value: 0 }
  },
  emissivemap: {
    emissiveMap: { value: null },
    emissiveMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  metalnessmap: {
    metalnessMap: { value: null },
    metalnessMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  roughnessmap: {
    roughnessMap: { value: null },
    roughnessMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  gradientmap: {
    gradientMap: { value: null }
  },
  fog: {
    fogDensity: { value: 25e-5 },
    fogNear: { value: 1 },
    fogFar: { value: 2e3 },
    fogColor: { value: /* @__PURE__ */ new Color(16777215) }
  },
  lights: {
    ambientLightColor: { value: [] },
    lightProbe: { value: [] },
    directionalLights: { value: [], properties: {
      direction: {},
      color: {}
    } },
    directionalLightShadows: { value: [], properties: {
      shadowBias: {},
      shadowNormalBias: {},
      shadowRadius: {},
      shadowMapSize: {}
    } },
    directionalShadowMap: { value: [] },
    directionalShadowMatrix: { value: [] },
    spotLights: { value: [], properties: {
      color: {},
      position: {},
      direction: {},
      distance: {},
      coneCos: {},
      penumbraCos: {},
      decay: {}
    } },
    spotLightShadows: { value: [], properties: {
      shadowBias: {},
      shadowNormalBias: {},
      shadowRadius: {},
      shadowMapSize: {}
    } },
    spotLightMap: { value: [] },
    spotShadowMap: { value: [] },
    spotLightMatrix: { value: [] },
    pointLights: { value: [], properties: {
      color: {},
      position: {},
      decay: {},
      distance: {}
    } },
    pointLightShadows: { value: [], properties: {
      shadowBias: {},
      shadowNormalBias: {},
      shadowRadius: {},
      shadowMapSize: {},
      shadowCameraNear: {},
      shadowCameraFar: {}
    } },
    pointShadowMap: { value: [] },
    pointShadowMatrix: { value: [] },
    hemisphereLights: { value: [], properties: {
      direction: {},
      skyColor: {},
      groundColor: {}
    } },
    // TODO (abelnation): RectAreaLight BRDF data needs to be moved from example to main src
    rectAreaLights: { value: [], properties: {
      color: {},
      position: {},
      width: {},
      height: {}
    } },
    ltc_1: { value: null },
    ltc_2: { value: null }
  },
  points: {
    diffuse: { value: /* @__PURE__ */ new Color(16777215) },
    opacity: { value: 1 },
    size: { value: 1 },
    scale: { value: 1 },
    map: { value: null },
    alphaMap: { value: null },
    alphaMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaTest: { value: 0 },
    uvTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  sprite: {
    diffuse: { value: /* @__PURE__ */ new Color(16777215) },
    opacity: { value: 1 },
    center: { value: /* @__PURE__ */ new Vector2(0.5, 0.5) },
    rotation: { value: 0 },
    map: { value: null },
    mapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaMap: { value: null },
    alphaMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaTest: { value: 0 }
  }
};
var ShaderLib = {
  basic: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.specularmap,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.fog
    ]),
    vertexShader: ShaderChunk.meshbasic_vert,
    fragmentShader: ShaderChunk.meshbasic_frag
  },
  lambert: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.specularmap,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) }
      }
    ]),
    vertexShader: ShaderChunk.meshlambert_vert,
    fragmentShader: ShaderChunk.meshlambert_frag
  },
  phong: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.specularmap,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) },
        specular: { value: /* @__PURE__ */ new Color(1118481) },
        shininess: { value: 30 }
      }
    ]),
    vertexShader: ShaderChunk.meshphong_vert,
    fragmentShader: ShaderChunk.meshphong_frag
  },
  standard: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.roughnessmap,
      UniformsLib.metalnessmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) },
        roughness: { value: 1 },
        metalness: { value: 0 },
        envMapIntensity: { value: 1 }
      }
    ]),
    vertexShader: ShaderChunk.meshphysical_vert,
    fragmentShader: ShaderChunk.meshphysical_frag
  },
  toon: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.gradientmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) }
      }
    ]),
    vertexShader: ShaderChunk.meshtoon_vert,
    fragmentShader: ShaderChunk.meshtoon_frag
  },
  matcap: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.fog,
      {
        matcap: { value: null }
      }
    ]),
    vertexShader: ShaderChunk.meshmatcap_vert,
    fragmentShader: ShaderChunk.meshmatcap_frag
  },
  points: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.points,
      UniformsLib.fog
    ]),
    vertexShader: ShaderChunk.points_vert,
    fragmentShader: ShaderChunk.points_frag
  },
  dashed: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.fog,
      {
        scale: { value: 1 },
        dashSize: { value: 1 },
        totalSize: { value: 2 }
      }
    ]),
    vertexShader: ShaderChunk.linedashed_vert,
    fragmentShader: ShaderChunk.linedashed_frag
  },
  depth: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.displacementmap
    ]),
    vertexShader: ShaderChunk.depth_vert,
    fragmentShader: ShaderChunk.depth_frag
  },
  normal: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      {
        opacity: { value: 1 }
      }
    ]),
    vertexShader: ShaderChunk.meshnormal_vert,
    fragmentShader: ShaderChunk.meshnormal_frag
  },
  sprite: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.sprite,
      UniformsLib.fog
    ]),
    vertexShader: ShaderChunk.sprite_vert,
    fragmentShader: ShaderChunk.sprite_frag
  },
  background: {
    uniforms: {
      uvTransform: { value: /* @__PURE__ */ new Matrix3() },
      t2D: { value: null },
      backgroundIntensity: { value: 1 }
    },
    vertexShader: ShaderChunk.background_vert,
    fragmentShader: ShaderChunk.background_frag
  },
  backgroundCube: {
    uniforms: {
      envMap: { value: null },
      flipEnvMap: { value: -1 },
      backgroundBlurriness: { value: 0 },
      backgroundIntensity: { value: 1 },
      backgroundRotation: { value: /* @__PURE__ */ new Matrix3() }
    },
    vertexShader: ShaderChunk.backgroundCube_vert,
    fragmentShader: ShaderChunk.backgroundCube_frag
  },
  cube: {
    uniforms: {
      tCube: { value: null },
      tFlip: { value: -1 },
      opacity: { value: 1 }
    },
    vertexShader: ShaderChunk.cube_vert,
    fragmentShader: ShaderChunk.cube_frag
  },
  equirect: {
    uniforms: {
      tEquirect: { value: null }
    },
    vertexShader: ShaderChunk.equirect_vert,
    fragmentShader: ShaderChunk.equirect_frag
  },
  distanceRGBA: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.displacementmap,
      {
        referencePosition: { value: /* @__PURE__ */ new Vector3() },
        nearDistance: { value: 1 },
        farDistance: { value: 1e3 }
      }
    ]),
    vertexShader: ShaderChunk.distanceRGBA_vert,
    fragmentShader: ShaderChunk.distanceRGBA_frag
  },
  shadow: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.lights,
      UniformsLib.fog,
      {
        color: { value: /* @__PURE__ */ new Color(0) },
        opacity: { value: 1 }
      }
    ]),
    vertexShader: ShaderChunk.shadow_vert,
    fragmentShader: ShaderChunk.shadow_frag
  }
};
ShaderLib.physical = {
  uniforms: /* @__PURE__ */ mergeUniforms([
    ShaderLib.standard.uniforms,
    {
      clearcoat: { value: 0 },
      clearcoatMap: { value: null },
      clearcoatMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      clearcoatNormalMap: { value: null },
      clearcoatNormalMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      clearcoatNormalScale: { value: /* @__PURE__ */ new Vector2(1, 1) },
      clearcoatRoughness: { value: 0 },
      clearcoatRoughnessMap: { value: null },
      clearcoatRoughnessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      dispersion: { value: 0 },
      iridescence: { value: 0 },
      iridescenceMap: { value: null },
      iridescenceMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      iridescenceIOR: { value: 1.3 },
      iridescenceThicknessMinimum: { value: 100 },
      iridescenceThicknessMaximum: { value: 400 },
      iridescenceThicknessMap: { value: null },
      iridescenceThicknessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      sheen: { value: 0 },
      sheenColor: { value: /* @__PURE__ */ new Color(0) },
      sheenColorMap: { value: null },
      sheenColorMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      sheenRoughness: { value: 1 },
      sheenRoughnessMap: { value: null },
      sheenRoughnessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      transmission: { value: 0 },
      transmissionMap: { value: null },
      transmissionMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      transmissionSamplerSize: { value: /* @__PURE__ */ new Vector2() },
      transmissionSamplerMap: { value: null },
      thickness: { value: 0 },
      thicknessMap: { value: null },
      thicknessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      attenuationDistance: { value: 0 },
      attenuationColor: { value: /* @__PURE__ */ new Color(0) },
      specularColor: { value: /* @__PURE__ */ new Color(1, 1, 1) },
      specularColorMap: { value: null },
      specularColorMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      specularIntensity: { value: 1 },
      specularIntensityMap: { value: null },
      specularIntensityMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      anisotropyVector: { value: /* @__PURE__ */ new Vector2() },
      anisotropyMap: { value: null },
      anisotropyMapTransform: { value: /* @__PURE__ */ new Matrix3() }
    }
  ]),
  vertexShader: ShaderChunk.meshphysical_vert,
  fragmentShader: ShaderChunk.meshphysical_frag
};
var OrthographicCamera = class extends Camera {
  constructor(left = -1, right = 1, top = 1, bottom = -1, near = 0.1, far = 2e3) {
    super();
    this.isOrthographicCamera = true;
    this.type = "OrthographicCamera";
    this.zoom = 1;
    this.view = null;
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
    this.near = near;
    this.far = far;
    this.updateProjectionMatrix();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.left = source.left;
    this.right = source.right;
    this.top = source.top;
    this.bottom = source.bottom;
    this.near = source.near;
    this.far = source.far;
    this.zoom = source.zoom;
    this.view = source.view === null ? null : Object.assign({}, source.view);
    return this;
  }
  setViewOffset(fullWidth, fullHeight, x, y, width, height) {
    if (this.view === null) {
      this.view = {
        enabled: true,
        fullWidth: 1,
        fullHeight: 1,
        offsetX: 0,
        offsetY: 0,
        width: 1,
        height: 1
      };
    }
    this.view.enabled = true;
    this.view.fullWidth = fullWidth;
    this.view.fullHeight = fullHeight;
    this.view.offsetX = x;
    this.view.offsetY = y;
    this.view.width = width;
    this.view.height = height;
    this.updateProjectionMatrix();
  }
  clearViewOffset() {
    if (this.view !== null) {
      this.view.enabled = false;
    }
    this.updateProjectionMatrix();
  }
  updateProjectionMatrix() {
    const dx = (this.right - this.left) / (2 * this.zoom);
    const dy = (this.top - this.bottom) / (2 * this.zoom);
    const cx = (this.right + this.left) / 2;
    const cy = (this.top + this.bottom) / 2;
    let left = cx - dx;
    let right = cx + dx;
    let top = cy + dy;
    let bottom = cy - dy;
    if (this.view !== null && this.view.enabled) {
      const scaleW = (this.right - this.left) / this.view.fullWidth / this.zoom;
      const scaleH = (this.top - this.bottom) / this.view.fullHeight / this.zoom;
      left += scaleW * this.view.offsetX;
      right = left + scaleW * this.view.width;
      top -= scaleH * this.view.offsetY;
      bottom = top - scaleH * this.view.height;
    }
    this.projectionMatrix.makeOrthographic(left, right, top, bottom, this.near, this.far, this.coordinateSystem);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
  toJSON(meta) {
    const data = super.toJSON(meta);
    data.object.zoom = this.zoom;
    data.object.left = this.left;
    data.object.right = this.right;
    data.object.top = this.top;
    data.object.bottom = this.bottom;
    data.object.near = this.near;
    data.object.far = this.far;
    if (this.view !== null) data.object.view = Object.assign({}, this.view);
    return data;
  }
};
var PHI = (1 + Math.sqrt(5)) / 2;
var INV_PHI = 1 / PHI;
var _axisDirections = [
  /* @__PURE__ */ new Vector3(-PHI, INV_PHI, 0),
  /* @__PURE__ */ new Vector3(PHI, INV_PHI, 0),
  /* @__PURE__ */ new Vector3(-INV_PHI, 0, PHI),
  /* @__PURE__ */ new Vector3(INV_PHI, 0, PHI),
  /* @__PURE__ */ new Vector3(0, PHI, -INV_PHI),
  /* @__PURE__ */ new Vector3(0, PHI, INV_PHI),
  /* @__PURE__ */ new Vector3(-1, 1, -1),
  /* @__PURE__ */ new Vector3(1, 1, -1),
  /* @__PURE__ */ new Vector3(-1, 1, 1),
  /* @__PURE__ */ new Vector3(1, 1, 1)
];
var DepthTexture = class extends Texture {
  constructor(width, height, type, mapping, wrapS, wrapT, magFilter, minFilter, anisotropy, format) {
    format = format !== void 0 ? format : DepthFormat;
    if (format !== DepthFormat && format !== DepthStencilFormat) {
      throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");
    }
    if (type === void 0 && format === DepthFormat) type = UnsignedIntType;
    if (type === void 0 && format === DepthStencilFormat) type = UnsignedInt248Type;
    super(null, mapping, wrapS, wrapT, magFilter, minFilter, format, type, anisotropy);
    this.isDepthTexture = true;
    this.image = { width, height };
    this.magFilter = magFilter !== void 0 ? magFilter : NearestFilter;
    this.minFilter = minFilter !== void 0 ? minFilter : NearestFilter;
    this.flipY = false;
    this.generateMipmaps = false;
    this.compareFunction = null;
  }
  copy(source) {
    super.copy(source);
    this.compareFunction = source.compareFunction;
    return this;
  }
  toJSON(meta) {
    const data = super.toJSON(meta);
    if (this.compareFunction !== null) data.compareFunction = this.compareFunction;
    return data;
  }
};
var emptyShadowTexture = /* @__PURE__ */ new DepthTexture(1, 1);
emptyShadowTexture.compareFunction = LessEqualCompare;
var mat4array = new Float32Array(16);
var mat3array = new Float32Array(9);
var mat2array = new Float32Array(4);
var Group = class extends Object3D {
  constructor() {
    super();
    this.isGroup = true;
    this.type = "Group";
  }
};
var _basePosition = /* @__PURE__ */ new Vector3();
var _skinIndex = /* @__PURE__ */ new Vector4();
var _skinWeight = /* @__PURE__ */ new Vector4();
var _vector3 = /* @__PURE__ */ new Vector3();
var _matrix4 = /* @__PURE__ */ new Matrix4();
var _vertex = /* @__PURE__ */ new Vector3();
var _sphere$4 = /* @__PURE__ */ new Sphere();
var _inverseMatrix$2 = /* @__PURE__ */ new Matrix4();
var _ray$2 = /* @__PURE__ */ new Ray();
var SkinnedMesh = class extends Mesh {
  constructor(geometry, material) {
    super(geometry, material);
    this.isSkinnedMesh = true;
    this.type = "SkinnedMesh";
    this.bindMode = AttachedBindMode;
    this.bindMatrix = new Matrix4();
    this.bindMatrixInverse = new Matrix4();
    this.boundingBox = null;
    this.boundingSphere = null;
  }
  computeBoundingBox() {
    const geometry = this.geometry;
    if (this.boundingBox === null) {
      this.boundingBox = new Box3();
    }
    this.boundingBox.makeEmpty();
    const positionAttribute = geometry.getAttribute("position");
    for (let i = 0; i < positionAttribute.count; i++) {
      this.getVertexPosition(i, _vertex);
      this.boundingBox.expandByPoint(_vertex);
    }
  }
  computeBoundingSphere() {
    const geometry = this.geometry;
    if (this.boundingSphere === null) {
      this.boundingSphere = new Sphere();
    }
    this.boundingSphere.makeEmpty();
    const positionAttribute = geometry.getAttribute("position");
    for (let i = 0; i < positionAttribute.count; i++) {
      this.getVertexPosition(i, _vertex);
      this.boundingSphere.expandByPoint(_vertex);
    }
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.bindMode = source.bindMode;
    this.bindMatrix.copy(source.bindMatrix);
    this.bindMatrixInverse.copy(source.bindMatrixInverse);
    this.skeleton = source.skeleton;
    if (source.boundingBox !== null) this.boundingBox = source.boundingBox.clone();
    if (source.boundingSphere !== null) this.boundingSphere = source.boundingSphere.clone();
    return this;
  }
  raycast(raycaster, intersects2) {
    const material = this.material;
    const matrixWorld = this.matrixWorld;
    if (material === void 0) return;
    if (this.boundingSphere === null) this.computeBoundingSphere();
    _sphere$4.copy(this.boundingSphere);
    _sphere$4.applyMatrix4(matrixWorld);
    if (raycaster.ray.intersectsSphere(_sphere$4) === false) return;
    _inverseMatrix$2.copy(matrixWorld).invert();
    _ray$2.copy(raycaster.ray).applyMatrix4(_inverseMatrix$2);
    if (this.boundingBox !== null) {
      if (_ray$2.intersectsBox(this.boundingBox) === false) return;
    }
    this._computeIntersections(raycaster, intersects2, _ray$2);
  }
  getVertexPosition(index, target) {
    super.getVertexPosition(index, target);
    this.applyBoneTransform(index, target);
    return target;
  }
  bind(skeleton, bindMatrix) {
    this.skeleton = skeleton;
    if (bindMatrix === void 0) {
      this.updateMatrixWorld(true);
      this.skeleton.calculateInverses();
      bindMatrix = this.matrixWorld;
    }
    this.bindMatrix.copy(bindMatrix);
    this.bindMatrixInverse.copy(bindMatrix).invert();
  }
  pose() {
    this.skeleton.pose();
  }
  normalizeSkinWeights() {
    const vector = new Vector4();
    const skinWeight = this.geometry.attributes.skinWeight;
    for (let i = 0, l = skinWeight.count; i < l; i++) {
      vector.fromBufferAttribute(skinWeight, i);
      const scale = 1 / vector.manhattanLength();
      if (scale !== Infinity) {
        vector.multiplyScalar(scale);
      } else {
        vector.set(1, 0, 0, 0);
      }
      skinWeight.setXYZW(i, vector.x, vector.y, vector.z, vector.w);
    }
  }
  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);
    if (this.bindMode === AttachedBindMode) {
      this.bindMatrixInverse.copy(this.matrixWorld).invert();
    } else if (this.bindMode === DetachedBindMode) {
      this.bindMatrixInverse.copy(this.bindMatrix).invert();
    } else {
      console.warn("THREE.SkinnedMesh: Unrecognized bindMode: " + this.bindMode);
    }
  }
  applyBoneTransform(index, vector) {
    const skeleton = this.skeleton;
    const geometry = this.geometry;
    _skinIndex.fromBufferAttribute(geometry.attributes.skinIndex, index);
    _skinWeight.fromBufferAttribute(geometry.attributes.skinWeight, index);
    _basePosition.copy(vector).applyMatrix4(this.bindMatrix);
    vector.set(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const weight = _skinWeight.getComponent(i);
      if (weight !== 0) {
        const boneIndex = _skinIndex.getComponent(i);
        _matrix4.multiplyMatrices(skeleton.bones[boneIndex].matrixWorld, skeleton.boneInverses[boneIndex]);
        vector.addScaledVector(_vector3.copy(_basePosition).applyMatrix4(_matrix4), weight);
      }
    }
    return vector.applyMatrix4(this.bindMatrixInverse);
  }
};
var Bone = class extends Object3D {
  constructor() {
    super();
    this.isBone = true;
    this.type = "Bone";
  }
};
var DataTexture = class extends Texture {
  constructor(data = null, width = 1, height = 1, format, type, mapping, wrapS, wrapT, magFilter = NearestFilter, minFilter = NearestFilter, anisotropy, colorSpace) {
    super(null, mapping, wrapS, wrapT, magFilter, minFilter, format, type, anisotropy, colorSpace);
    this.isDataTexture = true;
    this.image = { data, width, height };
    this.generateMipmaps = false;
    this.flipY = false;
    this.unpackAlignment = 1;
  }
};
var _offsetMatrix = /* @__PURE__ */ new Matrix4();
var _identityMatrix$1 = /* @__PURE__ */ new Matrix4();
var Skeleton = class _Skeleton {
  constructor(bones = [], boneInverses = []) {
    this.uuid = generateUUID();
    this.bones = bones.slice(0);
    this.boneInverses = boneInverses;
    this.boneMatrices = null;
    this.boneTexture = null;
    this.init();
  }
  init() {
    const bones = this.bones;
    const boneInverses = this.boneInverses;
    this.boneMatrices = new Float32Array(bones.length * 16);
    if (boneInverses.length === 0) {
      this.calculateInverses();
    } else {
      if (bones.length !== boneInverses.length) {
        console.warn("THREE.Skeleton: Number of inverse bone matrices does not match amount of bones.");
        this.boneInverses = [];
        for (let i = 0, il = this.bones.length; i < il; i++) {
          this.boneInverses.push(new Matrix4());
        }
      }
    }
  }
  calculateInverses() {
    this.boneInverses.length = 0;
    for (let i = 0, il = this.bones.length; i < il; i++) {
      const inverse = new Matrix4();
      if (this.bones[i]) {
        inverse.copy(this.bones[i].matrixWorld).invert();
      }
      this.boneInverses.push(inverse);
    }
  }
  pose() {
    for (let i = 0, il = this.bones.length; i < il; i++) {
      const bone = this.bones[i];
      if (bone) {
        bone.matrixWorld.copy(this.boneInverses[i]).invert();
      }
    }
    for (let i = 0, il = this.bones.length; i < il; i++) {
      const bone = this.bones[i];
      if (bone) {
        if (bone.parent && bone.parent.isBone) {
          bone.matrix.copy(bone.parent.matrixWorld).invert();
          bone.matrix.multiply(bone.matrixWorld);
        } else {
          bone.matrix.copy(bone.matrixWorld);
        }
        bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
      }
    }
  }
  update() {
    const bones = this.bones;
    const boneInverses = this.boneInverses;
    const boneMatrices = this.boneMatrices;
    const boneTexture = this.boneTexture;
    for (let i = 0, il = bones.length; i < il; i++) {
      const matrix = bones[i] ? bones[i].matrixWorld : _identityMatrix$1;
      _offsetMatrix.multiplyMatrices(matrix, boneInverses[i]);
      _offsetMatrix.toArray(boneMatrices, i * 16);
    }
    if (boneTexture !== null) {
      boneTexture.needsUpdate = true;
    }
  }
  clone() {
    return new _Skeleton(this.bones, this.boneInverses);
  }
  computeBoneTexture() {
    let size = Math.sqrt(this.bones.length * 4);
    size = Math.ceil(size / 4) * 4;
    size = Math.max(size, 4);
    const boneMatrices = new Float32Array(size * size * 4);
    boneMatrices.set(this.boneMatrices);
    const boneTexture = new DataTexture(boneMatrices, size, size, RGBAFormat, FloatType);
    boneTexture.needsUpdate = true;
    this.boneMatrices = boneMatrices;
    this.boneTexture = boneTexture;
    return this;
  }
  getBoneByName(name) {
    for (let i = 0, il = this.bones.length; i < il; i++) {
      const bone = this.bones[i];
      if (bone.name === name) {
        return bone;
      }
    }
    return void 0;
  }
  dispose() {
    if (this.boneTexture !== null) {
      this.boneTexture.dispose();
      this.boneTexture = null;
    }
  }
  fromJSON(json, bones) {
    this.uuid = json.uuid;
    for (let i = 0, l = json.bones.length; i < l; i++) {
      const uuid = json.bones[i];
      let bone = bones[uuid];
      if (bone === void 0) {
        console.warn("THREE.Skeleton: No bone found with UUID:", uuid);
        bone = new Bone();
      }
      this.bones.push(bone);
      this.boneInverses.push(new Matrix4().fromArray(json.boneInverses[i]));
    }
    this.init();
    return this;
  }
  toJSON() {
    const data = {
      metadata: {
        version: 4.6,
        type: "Skeleton",
        generator: "Skeleton.toJSON"
      },
      bones: [],
      boneInverses: []
    };
    data.uuid = this.uuid;
    const bones = this.bones;
    const boneInverses = this.boneInverses;
    for (let i = 0, l = bones.length; i < l; i++) {
      const bone = bones[i];
      data.bones.push(bone.uuid);
      const boneInverse = boneInverses[i];
      data.boneInverses.push(boneInverse.toArray());
    }
    return data;
  }
};
var LineBasicMaterial = class extends Material {
  constructor(parameters) {
    super();
    this.isLineBasicMaterial = true;
    this.type = "LineBasicMaterial";
    this.color = new Color(16777215);
    this.map = null;
    this.linewidth = 1;
    this.linecap = "round";
    this.linejoin = "round";
    this.fog = true;
    this.setValues(parameters);
  }
  copy(source) {
    super.copy(source);
    this.color.copy(source.color);
    this.map = source.map;
    this.linewidth = source.linewidth;
    this.linecap = source.linecap;
    this.linejoin = source.linejoin;
    this.fog = source.fog;
    return this;
  }
};
var _vStart = /* @__PURE__ */ new Vector3();
var _vEnd = /* @__PURE__ */ new Vector3();
var _inverseMatrix$1 = /* @__PURE__ */ new Matrix4();
var _ray$1 = /* @__PURE__ */ new Ray();
var _sphere$1 = /* @__PURE__ */ new Sphere();
var _intersectPointOnRay = /* @__PURE__ */ new Vector3();
var _intersectPointOnSegment = /* @__PURE__ */ new Vector3();
var Line = class extends Object3D {
  constructor(geometry = new BufferGeometry(), material = new LineBasicMaterial()) {
    super();
    this.isLine = true;
    this.type = "Line";
    this.geometry = geometry;
    this.material = material;
    this.updateMorphTargets();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.material = Array.isArray(source.material) ? source.material.slice() : source.material;
    this.geometry = source.geometry;
    return this;
  }
  computeLineDistances() {
    const geometry = this.geometry;
    if (geometry.index === null) {
      const positionAttribute = geometry.attributes.position;
      const lineDistances = [0];
      for (let i = 1, l = positionAttribute.count; i < l; i++) {
        _vStart.fromBufferAttribute(positionAttribute, i - 1);
        _vEnd.fromBufferAttribute(positionAttribute, i);
        lineDistances[i] = lineDistances[i - 1];
        lineDistances[i] += _vStart.distanceTo(_vEnd);
      }
      geometry.setAttribute("lineDistance", new Float32BufferAttribute(lineDistances, 1));
    } else {
      console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");
    }
    return this;
  }
  raycast(raycaster, intersects2) {
    const geometry = this.geometry;
    const matrixWorld = this.matrixWorld;
    const threshold = raycaster.params.Line.threshold;
    const drawRange = geometry.drawRange;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    _sphere$1.copy(geometry.boundingSphere);
    _sphere$1.applyMatrix4(matrixWorld);
    _sphere$1.radius += threshold;
    if (raycaster.ray.intersectsSphere(_sphere$1) === false) return;
    _inverseMatrix$1.copy(matrixWorld).invert();
    _ray$1.copy(raycaster.ray).applyMatrix4(_inverseMatrix$1);
    const localThreshold = threshold / ((this.scale.x + this.scale.y + this.scale.z) / 3);
    const localThresholdSq = localThreshold * localThreshold;
    const step = this.isLineSegments ? 2 : 1;
    const index = geometry.index;
    const attributes = geometry.attributes;
    const positionAttribute = attributes.position;
    if (index !== null) {
      const start = Math.max(0, drawRange.start);
      const end = Math.min(index.count, drawRange.start + drawRange.count);
      for (let i = start, l = end - 1; i < l; i += step) {
        const a = index.getX(i);
        const b = index.getX(i + 1);
        const intersect = checkIntersection(this, raycaster, _ray$1, localThresholdSq, a, b);
        if (intersect) {
          intersects2.push(intersect);
        }
      }
      if (this.isLineLoop) {
        const a = index.getX(end - 1);
        const b = index.getX(start);
        const intersect = checkIntersection(this, raycaster, _ray$1, localThresholdSq, a, b);
        if (intersect) {
          intersects2.push(intersect);
        }
      }
    } else {
      const start = Math.max(0, drawRange.start);
      const end = Math.min(positionAttribute.count, drawRange.start + drawRange.count);
      for (let i = start, l = end - 1; i < l; i += step) {
        const intersect = checkIntersection(this, raycaster, _ray$1, localThresholdSq, i, i + 1);
        if (intersect) {
          intersects2.push(intersect);
        }
      }
      if (this.isLineLoop) {
        const intersect = checkIntersection(this, raycaster, _ray$1, localThresholdSq, end - 1, start);
        if (intersect) {
          intersects2.push(intersect);
        }
      }
    }
  }
  updateMorphTargets() {
    const geometry = this.geometry;
    const morphAttributes = geometry.morphAttributes;
    const keys = Object.keys(morphAttributes);
    if (keys.length > 0) {
      const morphAttribute = morphAttributes[keys[0]];
      if (morphAttribute !== void 0) {
        this.morphTargetInfluences = [];
        this.morphTargetDictionary = {};
        for (let m = 0, ml = morphAttribute.length; m < ml; m++) {
          const name = morphAttribute[m].name || String(m);
          this.morphTargetInfluences.push(0);
          this.morphTargetDictionary[name] = m;
        }
      }
    }
  }
};
function checkIntersection(object, raycaster, ray, thresholdSq, a, b) {
  const positionAttribute = object.geometry.attributes.position;
  _vStart.fromBufferAttribute(positionAttribute, a);
  _vEnd.fromBufferAttribute(positionAttribute, b);
  const distSq = ray.distanceSqToSegment(_vStart, _vEnd, _intersectPointOnRay, _intersectPointOnSegment);
  if (distSq > thresholdSq) return;
  _intersectPointOnRay.applyMatrix4(object.matrixWorld);
  const distance = raycaster.ray.origin.distanceTo(_intersectPointOnRay);
  if (distance < raycaster.near || distance > raycaster.far) return;
  return {
    distance,
    // What do we want? intersection point on the ray or on the segment??
    // point: raycaster.ray.at( distance ),
    point: _intersectPointOnSegment.clone().applyMatrix4(object.matrixWorld),
    index: a,
    face: null,
    faceIndex: null,
    object
  };
}
var Curve = class {
  constructor() {
    this.type = "Curve";
    this.arcLengthDivisions = 200;
  }
  // Virtual base class method to overwrite and implement in subclasses
  //	- t [0 .. 1]
  getPoint() {
    console.warn("THREE.Curve: .getPoint() not implemented.");
    return null;
  }
  // Get point at relative position in curve according to arc length
  // - u [0 .. 1]
  getPointAt(u, optionalTarget) {
    const t = this.getUtoTmapping(u);
    return this.getPoint(t, optionalTarget);
  }
  // Get sequence of points using getPoint( t )
  getPoints(divisions = 5) {
    const points = [];
    for (let d = 0; d <= divisions; d++) {
      points.push(this.getPoint(d / divisions));
    }
    return points;
  }
  // Get sequence of points using getPointAt( u )
  getSpacedPoints(divisions = 5) {
    const points = [];
    for (let d = 0; d <= divisions; d++) {
      points.push(this.getPointAt(d / divisions));
    }
    return points;
  }
  // Get total curve arc length
  getLength() {
    const lengths = this.getLengths();
    return lengths[lengths.length - 1];
  }
  // Get list of cumulative segment lengths
  getLengths(divisions = this.arcLengthDivisions) {
    if (this.cacheArcLengths && this.cacheArcLengths.length === divisions + 1 && !this.needsUpdate) {
      return this.cacheArcLengths;
    }
    this.needsUpdate = false;
    const cache = [];
    let current, last = this.getPoint(0);
    let sum = 0;
    cache.push(0);
    for (let p = 1; p <= divisions; p++) {
      current = this.getPoint(p / divisions);
      sum += current.distanceTo(last);
      cache.push(sum);
      last = current;
    }
    this.cacheArcLengths = cache;
    return cache;
  }
  updateArcLengths() {
    this.needsUpdate = true;
    this.getLengths();
  }
  // Given u ( 0 .. 1 ), get a t to find p. This gives you points which are equidistant
  getUtoTmapping(u, distance) {
    const arcLengths = this.getLengths();
    let i = 0;
    const il = arcLengths.length;
    let targetArcLength;
    if (distance) {
      targetArcLength = distance;
    } else {
      targetArcLength = u * arcLengths[il - 1];
    }
    let low = 0, high = il - 1, comparison;
    while (low <= high) {
      i = Math.floor(low + (high - low) / 2);
      comparison = arcLengths[i] - targetArcLength;
      if (comparison < 0) {
        low = i + 1;
      } else if (comparison > 0) {
        high = i - 1;
      } else {
        high = i;
        break;
      }
    }
    i = high;
    if (arcLengths[i] === targetArcLength) {
      return i / (il - 1);
    }
    const lengthBefore = arcLengths[i];
    const lengthAfter = arcLengths[i + 1];
    const segmentLength = lengthAfter - lengthBefore;
    const segmentFraction = (targetArcLength - lengthBefore) / segmentLength;
    const t = (i + segmentFraction) / (il - 1);
    return t;
  }
  // Returns a unit vector tangent at t
  // In case any sub curve does not implement its tangent derivation,
  // 2 points a small delta apart will be used to find its gradient
  // which seems to give a reasonable approximation
  getTangent(t, optionalTarget) {
    const delta = 1e-4;
    let t1 = t - delta;
    let t2 = t + delta;
    if (t1 < 0) t1 = 0;
    if (t2 > 1) t2 = 1;
    const pt1 = this.getPoint(t1);
    const pt2 = this.getPoint(t2);
    const tangent = optionalTarget || (pt1.isVector2 ? new Vector2() : new Vector3());
    tangent.copy(pt2).sub(pt1).normalize();
    return tangent;
  }
  getTangentAt(u, optionalTarget) {
    const t = this.getUtoTmapping(u);
    return this.getTangent(t, optionalTarget);
  }
  computeFrenetFrames(segments, closed) {
    const normal = new Vector3();
    const tangents = [];
    const normals = [];
    const binormals = [];
    const vec = new Vector3();
    const mat = new Matrix4();
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      tangents[i] = this.getTangentAt(u, new Vector3());
    }
    normals[0] = new Vector3();
    binormals[0] = new Vector3();
    let min = Number.MAX_VALUE;
    const tx = Math.abs(tangents[0].x);
    const ty = Math.abs(tangents[0].y);
    const tz = Math.abs(tangents[0].z);
    if (tx <= min) {
      min = tx;
      normal.set(1, 0, 0);
    }
    if (ty <= min) {
      min = ty;
      normal.set(0, 1, 0);
    }
    if (tz <= min) {
      normal.set(0, 0, 1);
    }
    vec.crossVectors(tangents[0], normal).normalize();
    normals[0].crossVectors(tangents[0], vec);
    binormals[0].crossVectors(tangents[0], normals[0]);
    for (let i = 1; i <= segments; i++) {
      normals[i] = normals[i - 1].clone();
      binormals[i] = binormals[i - 1].clone();
      vec.crossVectors(tangents[i - 1], tangents[i]);
      if (vec.length() > Number.EPSILON) {
        vec.normalize();
        const theta = Math.acos(clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
        normals[i].applyMatrix4(mat.makeRotationAxis(vec, theta));
      }
      binormals[i].crossVectors(tangents[i], normals[i]);
    }
    if (closed === true) {
      let theta = Math.acos(clamp(normals[0].dot(normals[segments]), -1, 1));
      theta /= segments;
      if (tangents[0].dot(vec.crossVectors(normals[0], normals[segments])) > 0) {
        theta = -theta;
      }
      for (let i = 1; i <= segments; i++) {
        normals[i].applyMatrix4(mat.makeRotationAxis(tangents[i], theta * i));
        binormals[i].crossVectors(tangents[i], normals[i]);
      }
    }
    return {
      tangents,
      normals,
      binormals
    };
  }
  clone() {
    return new this.constructor().copy(this);
  }
  copy(source) {
    this.arcLengthDivisions = source.arcLengthDivisions;
    return this;
  }
  toJSON() {
    const data = {
      metadata: {
        version: 4.6,
        type: "Curve",
        generator: "Curve.toJSON"
      }
    };
    data.arcLengthDivisions = this.arcLengthDivisions;
    data.type = this.type;
    return data;
  }
  fromJSON(json) {
    this.arcLengthDivisions = json.arcLengthDivisions;
    return this;
  }
};
var Earcut = {
  triangulate: function(data, holeIndices, dim = 2) {
    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
    let outerNode = linkedList(data, 0, outerLen, dim, true);
    const triangles = [];
    if (!outerNode || outerNode.next === outerNode.prev) return triangles;
    let minX, minY, maxX, maxY, x, y, invSize;
    if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
    if (data.length > 80 * dim) {
      minX = maxX = data[0];
      minY = maxY = data[1];
      for (let i = dim; i < outerLen; i += dim) {
        x = data[i];
        y = data[i + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      invSize = Math.max(maxX - minX, maxY - minY);
      invSize = invSize !== 0 ? 32767 / invSize : 0;
    }
    earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);
    return triangles;
  }
};
function linkedList(data, start, end, dim, clockwise) {
  let i, last;
  if (clockwise === signedArea(data, start, end, dim) > 0) {
    for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
  } else {
    for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
  }
  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}
function filterPoints(start, end) {
  if (!start) return start;
  if (!end) end = start;
  let p = start, again;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);
  return end;
}
function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
  if (!ear) return;
  if (!pass && invSize) indexCurve(ear, minX, minY, invSize);
  let stop = ear, prev, next;
  while (ear.prev !== ear.next) {
    prev = ear.prev;
    next = ear.next;
    if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
      triangles.push(prev.i / dim | 0);
      triangles.push(ear.i / dim | 0);
      triangles.push(next.i / dim | 0);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (!pass) {
        earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);
      } else if (pass === 1) {
        ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
        earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);
      } else if (pass === 2) {
        splitEarcut(ear, triangles, dim, minX, minY, invSize);
      }
      break;
    }
  }
}
function isEar(ear) {
  const a = ear.prev, b = ear, c = ear.next;
  if (area(a, b, c) >= 0) return false;
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
  const x0 = ax < bx ? ax < cx ? ax : cx : bx < cx ? bx : cx, y0 = ay < by ? ay < cy ? ay : cy : by < cy ? by : cy, x1 = ax > bx ? ax > cx ? ax : cx : bx > cx ? bx : cx, y1 = ay > by ? ay > cy ? ay : cy : by > cy ? by : cy;
  let p = c.next;
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}
function isEarHashed(ear, minX, minY, invSize) {
  const a = ear.prev, b = ear, c = ear.next;
  if (area(a, b, c) >= 0) return false;
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
  const x0 = ax < bx ? ax < cx ? ax : cx : bx < cx ? bx : cx, y0 = ay < by ? ay < cy ? ay : cy : by < cy ? by : cy, x1 = ax > bx ? ax > cx ? ax : cx : bx > cx ? bx : cx, y1 = ay > by ? ay > cy ? ay : cy : by > cy ? by : cy;
  const minZ = zOrder(x0, y0, minX, minY, invSize), maxZ = zOrder(x1, y1, minX, minY, invSize);
  let p = ear.prevZ, n = ear.nextZ;
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.prevZ;
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c && pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
    n = n.nextZ;
  }
  while (p && p.z >= minZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.prevZ;
  }
  while (n && n.z <= maxZ) {
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c && pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
    n = n.nextZ;
  }
  return true;
}
function cureLocalIntersections(start, triangles, dim) {
  let p = start;
  do {
    const a = p.prev, b = p.next.next;
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i / dim | 0);
      triangles.push(p.i / dim | 0);
      triangles.push(b.i / dim | 0);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p);
}
function splitEarcut(start, triangles, dim, minX, minY, invSize) {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c = splitPolygon(a, b);
        a = filterPoints(a, a.next);
        c = filterPoints(c, c.next);
        earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
        earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}
function eliminateHoles(data, holeIndices, outerNode, dim) {
  const queue = [];
  let i, len, start, end, list;
  for (i = 0, len = holeIndices.length; i < len; i++) {
    start = holeIndices[i] * dim;
    end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
    list = linkedList(data, start, end, dim, false);
    if (list === list.next) list.steiner = true;
    queue.push(getLeftmost(list));
  }
  queue.sort(compareX);
  for (i = 0; i < queue.length; i++) {
    outerNode = eliminateHole(queue[i], outerNode);
  }
  return outerNode;
}
function compareX(a, b) {
  return a.x - b.x;
}
function eliminateHole(hole, outerNode) {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) {
    return outerNode;
  }
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next);
}
function findHoleBridge(hole, outerNode) {
  let p = outerNode, qx = -Infinity, m;
  const hx = hole.x, hy = hole.y;
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m;
      }
    }
    p = p.next;
  } while (p !== outerNode);
  if (!m) return null;
  const stop = m, mx = m.x, my = m.y;
  let tanMin = Infinity, tan;
  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole) && (tan < tanMin || tan === tanMin && (p.x > m.x || p.x === m.x && sectorContainsSector(m, p)))) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}
function sectorContainsSector(m, p) {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}
function indexCurve(start, minX, minY, invSize) {
  let p = start;
  do {
    if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize);
    p.prevZ = p.prev;
    p.nextZ = p.next;
    p = p.next;
  } while (p !== start);
  p.prevZ.nextZ = null;
  p.prevZ = null;
  sortLinked(p);
}
function sortLinked(list) {
  let i, p, q, e, tail, numMerges, pSize, qSize, inSize = 1;
  do {
    p = list;
    list = null;
    tail = null;
    numMerges = 0;
    while (p) {
      numMerges++;
      q = p;
      pSize = 0;
      for (i = 0; i < inSize; i++) {
        pSize++;
        q = q.nextZ;
        if (!q) break;
      }
      qSize = inSize;
      while (pSize > 0 || qSize > 0 && q) {
        if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
          e = p;
          p = p.nextZ;
          pSize--;
        } else {
          e = q;
          q = q.nextZ;
          qSize--;
        }
        if (tail) tail.nextZ = e;
        else list = e;
        e.prevZ = tail;
        tail = e;
      }
      p = q;
    }
    tail.nextZ = null;
    inSize *= 2;
  } while (numMerges > 1);
  return list;
}
function zOrder(x, y, minX, minY, invSize) {
  x = (x - minX) * invSize | 0;
  y = (y - minY) * invSize | 0;
  x = (x | x << 8) & 16711935;
  x = (x | x << 4) & 252645135;
  x = (x | x << 2) & 858993459;
  x = (x | x << 1) & 1431655765;
  y = (y | y << 8) & 16711935;
  y = (y | y << 4) & 252645135;
  y = (y | y << 2) & 858993459;
  y = (y | y << 1) & 1431655765;
  return x | y << 1;
}
function getLeftmost(start) {
  let p = start, leftmost = start;
  do {
    if (p.x < leftmost.x || p.x === leftmost.x && p.y < leftmost.y) leftmost = p;
    p = p.next;
  } while (p !== start);
  return leftmost;
}
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}
function isValidDiagonal(a, b) {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) && // dones't intersect other edges
  (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && // locally visible
  (area(a.prev, a, b.prev) || area(a, b.prev, b)) || // does not create opposite-facing sectors
  equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0);
}
function area(p, q, r) {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}
function equals(p1, p2) {
  return p1.x === p2.x && p1.y === p2.y;
}
function intersects(p1, q1, p2, q2) {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}
function onSegment(p, q, r) {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}
function sign(num) {
  return num > 0 ? 1 : num < 0 ? -1 : 0;
}
function intersectsPolygon(a, b) {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}
function locallyInside(a, b) {
  return area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}
function middleInside(a, b) {
  let p = a, inside = false;
  const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
  do {
    if (p.y > py !== p.next.y > py && p.next.y !== p.y && px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)
      inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}
function splitPolygon(a, b) {
  const a2 = new Node(a.i, a.x, a.y), b2 = new Node(b.i, b.x, b.y), an = a.next, bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}
function insertNode(i, x, y, last) {
  const p = new Node(i, x, y);
  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}
function removeNode(p) {
  p.next.prev = p.prev;
  p.prev.next = p.next;
  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}
function Node(i, x, y) {
  this.i = i;
  this.x = x;
  this.y = y;
  this.prev = null;
  this.next = null;
  this.z = 0;
  this.prevZ = null;
  this.nextZ = null;
  this.steiner = false;
}
function signedArea(data, start, end, dim) {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}
var ShapeUtils = class _ShapeUtils {
  // calculate area of the contour polygon
  static area(contour) {
    const n = contour.length;
    let a = 0;
    for (let p = n - 1, q = 0; q < n; p = q++) {
      a += contour[p].x * contour[q].y - contour[q].x * contour[p].y;
    }
    return a * 0.5;
  }
  static isClockWise(pts) {
    return _ShapeUtils.area(pts) < 0;
  }
  static triangulateShape(contour, holes) {
    const vertices = [];
    const holeIndices = [];
    const faces = [];
    removeDupEndPts(contour);
    addContour(vertices, contour);
    let holeIndex = contour.length;
    holes.forEach(removeDupEndPts);
    for (let i = 0; i < holes.length; i++) {
      holeIndices.push(holeIndex);
      holeIndex += holes[i].length;
      addContour(vertices, holes[i]);
    }
    const triangles = Earcut.triangulate(vertices, holeIndices);
    for (let i = 0; i < triangles.length; i += 3) {
      faces.push(triangles.slice(i, i + 3));
    }
    return faces;
  }
};
function removeDupEndPts(points) {
  const l = points.length;
  if (l > 2 && points[l - 1].equals(points[0])) {
    points.pop();
  }
}
function addContour(vertices, contour) {
  for (let i = 0; i < contour.length; i++) {
    vertices.push(contour[i].x);
    vertices.push(contour[i].y);
  }
}
var MeshPhongMaterial = class extends Material {
  constructor(parameters) {
    super();
    this.isMeshPhongMaterial = true;
    this.type = "MeshPhongMaterial";
    this.color = new Color(16777215);
    this.specular = new Color(1118481);
    this.shininess = 30;
    this.map = null;
    this.lightMap = null;
    this.lightMapIntensity = 1;
    this.aoMap = null;
    this.aoMapIntensity = 1;
    this.emissive = new Color(0);
    this.emissiveIntensity = 1;
    this.emissiveMap = null;
    this.bumpMap = null;
    this.bumpScale = 1;
    this.normalMap = null;
    this.normalMapType = TangentSpaceNormalMap;
    this.normalScale = new Vector2(1, 1);
    this.displacementMap = null;
    this.displacementScale = 1;
    this.displacementBias = 0;
    this.specularMap = null;
    this.alphaMap = null;
    this.envMap = null;
    this.envMapRotation = new Euler();
    this.combine = MultiplyOperation;
    this.reflectivity = 1;
    this.refractionRatio = 0.98;
    this.wireframe = false;
    this.wireframeLinewidth = 1;
    this.wireframeLinecap = "round";
    this.wireframeLinejoin = "round";
    this.flatShading = false;
    this.fog = true;
    this.setValues(parameters);
  }
  copy(source) {
    super.copy(source);
    this.color.copy(source.color);
    this.specular.copy(source.specular);
    this.shininess = source.shininess;
    this.map = source.map;
    this.lightMap = source.lightMap;
    this.lightMapIntensity = source.lightMapIntensity;
    this.aoMap = source.aoMap;
    this.aoMapIntensity = source.aoMapIntensity;
    this.emissive.copy(source.emissive);
    this.emissiveMap = source.emissiveMap;
    this.emissiveIntensity = source.emissiveIntensity;
    this.bumpMap = source.bumpMap;
    this.bumpScale = source.bumpScale;
    this.normalMap = source.normalMap;
    this.normalMapType = source.normalMapType;
    this.normalScale.copy(source.normalScale);
    this.displacementMap = source.displacementMap;
    this.displacementScale = source.displacementScale;
    this.displacementBias = source.displacementBias;
    this.specularMap = source.specularMap;
    this.alphaMap = source.alphaMap;
    this.envMap = source.envMap;
    this.envMapRotation.copy(source.envMapRotation);
    this.combine = source.combine;
    this.reflectivity = source.reflectivity;
    this.refractionRatio = source.refractionRatio;
    this.wireframe = source.wireframe;
    this.wireframeLinewidth = source.wireframeLinewidth;
    this.wireframeLinecap = source.wireframeLinecap;
    this.wireframeLinejoin = source.wireframeLinejoin;
    this.flatShading = source.flatShading;
    this.fog = source.fog;
    return this;
  }
};
var MeshLambertMaterial = class extends Material {
  constructor(parameters) {
    super();
    this.isMeshLambertMaterial = true;
    this.type = "MeshLambertMaterial";
    this.color = new Color(16777215);
    this.map = null;
    this.lightMap = null;
    this.lightMapIntensity = 1;
    this.aoMap = null;
    this.aoMapIntensity = 1;
    this.emissive = new Color(0);
    this.emissiveIntensity = 1;
    this.emissiveMap = null;
    this.bumpMap = null;
    this.bumpScale = 1;
    this.normalMap = null;
    this.normalMapType = TangentSpaceNormalMap;
    this.normalScale = new Vector2(1, 1);
    this.displacementMap = null;
    this.displacementScale = 1;
    this.displacementBias = 0;
    this.specularMap = null;
    this.alphaMap = null;
    this.envMap = null;
    this.envMapRotation = new Euler();
    this.combine = MultiplyOperation;
    this.reflectivity = 1;
    this.refractionRatio = 0.98;
    this.wireframe = false;
    this.wireframeLinewidth = 1;
    this.wireframeLinecap = "round";
    this.wireframeLinejoin = "round";
    this.flatShading = false;
    this.fog = true;
    this.setValues(parameters);
  }
  copy(source) {
    super.copy(source);
    this.color.copy(source.color);
    this.map = source.map;
    this.lightMap = source.lightMap;
    this.lightMapIntensity = source.lightMapIntensity;
    this.aoMap = source.aoMap;
    this.aoMapIntensity = source.aoMapIntensity;
    this.emissive.copy(source.emissive);
    this.emissiveMap = source.emissiveMap;
    this.emissiveIntensity = source.emissiveIntensity;
    this.bumpMap = source.bumpMap;
    this.bumpScale = source.bumpScale;
    this.normalMap = source.normalMap;
    this.normalMapType = source.normalMapType;
    this.normalScale.copy(source.normalScale);
    this.displacementMap = source.displacementMap;
    this.displacementScale = source.displacementScale;
    this.displacementBias = source.displacementBias;
    this.specularMap = source.specularMap;
    this.alphaMap = source.alphaMap;
    this.envMap = source.envMap;
    this.envMapRotation.copy(source.envMapRotation);
    this.combine = source.combine;
    this.reflectivity = source.reflectivity;
    this.refractionRatio = source.refractionRatio;
    this.wireframe = source.wireframe;
    this.wireframeLinewidth = source.wireframeLinewidth;
    this.wireframeLinecap = source.wireframeLinecap;
    this.wireframeLinejoin = source.wireframeLinejoin;
    this.flatShading = source.flatShading;
    this.fog = source.fog;
    return this;
  }
};
function convertArray(array, type, forceClone) {
  if (!array || // let 'undefined' and 'null' pass
  !forceClone && array.constructor === type) return array;
  if (typeof type.BYTES_PER_ELEMENT === "number") {
    return new type(array);
  }
  return Array.prototype.slice.call(array);
}
function isTypedArray(object) {
  return ArrayBuffer.isView(object) && !(object instanceof DataView);
}
function getKeyframeOrder(times) {
  function compareTime(i, j) {
    return times[i] - times[j];
  }
  const n = times.length;
  const result = new Array(n);
  for (let i = 0; i !== n; ++i) result[i] = i;
  result.sort(compareTime);
  return result;
}
function sortedArray(values, stride, order) {
  const nValues = values.length;
  const result = new values.constructor(nValues);
  for (let i = 0, dstOffset = 0; dstOffset !== nValues; ++i) {
    const srcOffset = order[i] * stride;
    for (let j = 0; j !== stride; ++j) {
      result[dstOffset++] = values[srcOffset + j];
    }
  }
  return result;
}
function flattenJSON(jsonKeys, times, values, valuePropertyName) {
  let i = 1, key = jsonKeys[0];
  while (key !== void 0 && key[valuePropertyName] === void 0) {
    key = jsonKeys[i++];
  }
  if (key === void 0) return;
  let value = key[valuePropertyName];
  if (value === void 0) return;
  if (Array.isArray(value)) {
    do {
      value = key[valuePropertyName];
      if (value !== void 0) {
        times.push(key.time);
        values.push.apply(values, value);
      }
      key = jsonKeys[i++];
    } while (key !== void 0);
  } else if (value.toArray !== void 0) {
    do {
      value = key[valuePropertyName];
      if (value !== void 0) {
        times.push(key.time);
        value.toArray(values, values.length);
      }
      key = jsonKeys[i++];
    } while (key !== void 0);
  } else {
    do {
      value = key[valuePropertyName];
      if (value !== void 0) {
        times.push(key.time);
        values.push(value);
      }
      key = jsonKeys[i++];
    } while (key !== void 0);
  }
}
var Interpolant = class {
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    this.parameterPositions = parameterPositions;
    this._cachedIndex = 0;
    this.resultBuffer = resultBuffer !== void 0 ? resultBuffer : new sampleValues.constructor(sampleSize);
    this.sampleValues = sampleValues;
    this.valueSize = sampleSize;
    this.settings = null;
    this.DefaultSettings_ = {};
  }
  evaluate(t) {
    const pp = this.parameterPositions;
    let i1 = this._cachedIndex, t1 = pp[i1], t0 = pp[i1 - 1];
    validate_interval: {
      seek: {
        let right;
        linear_scan: {
          forward_scan: if (!(t < t1)) {
            for (let giveUpAt = i1 + 2; ; ) {
              if (t1 === void 0) {
                if (t < t0) break forward_scan;
                i1 = pp.length;
                this._cachedIndex = i1;
                return this.copySampleValue_(i1 - 1);
              }
              if (i1 === giveUpAt) break;
              t0 = t1;
              t1 = pp[++i1];
              if (t < t1) {
                break seek;
              }
            }
            right = pp.length;
            break linear_scan;
          }
          if (!(t >= t0)) {
            const t1global = pp[1];
            if (t < t1global) {
              i1 = 2;
              t0 = t1global;
            }
            for (let giveUpAt = i1 - 2; ; ) {
              if (t0 === void 0) {
                this._cachedIndex = 0;
                return this.copySampleValue_(0);
              }
              if (i1 === giveUpAt) break;
              t1 = t0;
              t0 = pp[--i1 - 1];
              if (t >= t0) {
                break seek;
              }
            }
            right = i1;
            i1 = 0;
            break linear_scan;
          }
          break validate_interval;
        }
        while (i1 < right) {
          const mid = i1 + right >>> 1;
          if (t < pp[mid]) {
            right = mid;
          } else {
            i1 = mid + 1;
          }
        }
        t1 = pp[i1];
        t0 = pp[i1 - 1];
        if (t0 === void 0) {
          this._cachedIndex = 0;
          return this.copySampleValue_(0);
        }
        if (t1 === void 0) {
          i1 = pp.length;
          this._cachedIndex = i1;
          return this.copySampleValue_(i1 - 1);
        }
      }
      this._cachedIndex = i1;
      this.intervalChanged_(i1, t0, t1);
    }
    return this.interpolate_(i1, t0, t, t1);
  }
  getSettings_() {
    return this.settings || this.DefaultSettings_;
  }
  copySampleValue_(index) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, offset = index * stride;
    for (let i = 0; i !== stride; ++i) {
      result[i] = values[offset + i];
    }
    return result;
  }
  // Template methods for derived classes:
  interpolate_() {
    throw new Error("call to abstract method");
  }
  intervalChanged_() {
  }
};
var CubicInterpolant = class extends Interpolant {
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
    this._weightPrev = -0;
    this._offsetPrev = -0;
    this._weightNext = -0;
    this._offsetNext = -0;
    this.DefaultSettings_ = {
      endingStart: ZeroCurvatureEnding,
      endingEnd: ZeroCurvatureEnding
    };
  }
  intervalChanged_(i1, t0, t1) {
    const pp = this.parameterPositions;
    let iPrev = i1 - 2, iNext = i1 + 1, tPrev = pp[iPrev], tNext = pp[iNext];
    if (tPrev === void 0) {
      switch (this.getSettings_().endingStart) {
        case ZeroSlopeEnding:
          iPrev = i1;
          tPrev = 2 * t0 - t1;
          break;
        case WrapAroundEnding:
          iPrev = pp.length - 2;
          tPrev = t0 + pp[iPrev] - pp[iPrev + 1];
          break;
        default:
          iPrev = i1;
          tPrev = t1;
      }
    }
    if (tNext === void 0) {
      switch (this.getSettings_().endingEnd) {
        case ZeroSlopeEnding:
          iNext = i1;
          tNext = 2 * t1 - t0;
          break;
        case WrapAroundEnding:
          iNext = 1;
          tNext = t1 + pp[1] - pp[0];
          break;
        default:
          iNext = i1 - 1;
          tNext = t0;
      }
    }
    const halfDt = (t1 - t0) * 0.5, stride = this.valueSize;
    this._weightPrev = halfDt / (t0 - tPrev);
    this._weightNext = halfDt / (tNext - t1);
    this._offsetPrev = iPrev * stride;
    this._offsetNext = iNext * stride;
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, o1 = i1 * stride, o0 = o1 - stride, oP = this._offsetPrev, oN = this._offsetNext, wP = this._weightPrev, wN = this._weightNext, p = (t - t0) / (t1 - t0), pp = p * p, ppp = pp * p;
    const sP = -wP * ppp + 2 * wP * pp - wP * p;
    const s0 = (1 + wP) * ppp + (-1.5 - 2 * wP) * pp + (-0.5 + wP) * p + 1;
    const s1 = (-1 - wN) * ppp + (1.5 + wN) * pp + 0.5 * p;
    const sN = wN * ppp - wN * pp;
    for (let i = 0; i !== stride; ++i) {
      result[i] = sP * values[oP + i] + s0 * values[o0 + i] + s1 * values[o1 + i] + sN * values[oN + i];
    }
    return result;
  }
};
var LinearInterpolant = class extends Interpolant {
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, offset1 = i1 * stride, offset0 = offset1 - stride, weight1 = (t - t0) / (t1 - t0), weight0 = 1 - weight1;
    for (let i = 0; i !== stride; ++i) {
      result[i] = values[offset0 + i] * weight0 + values[offset1 + i] * weight1;
    }
    return result;
  }
};
var DiscreteInterpolant = class extends Interpolant {
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  interpolate_(i1) {
    return this.copySampleValue_(i1 - 1);
  }
};
var KeyframeTrack = class {
  constructor(name, times, values, interpolation) {
    if (name === void 0) throw new Error("THREE.KeyframeTrack: track name is undefined");
    if (times === void 0 || times.length === 0) throw new Error("THREE.KeyframeTrack: no keyframes in track named " + name);
    this.name = name;
    this.times = convertArray(times, this.TimeBufferType);
    this.values = convertArray(values, this.ValueBufferType);
    this.setInterpolation(interpolation || this.DefaultInterpolation);
  }
  // Serialization (in static context, because of constructor invocation
  // and automatic invocation of .toJSON):
  static toJSON(track) {
    const trackType = track.constructor;
    let json;
    if (trackType.toJSON !== this.toJSON) {
      json = trackType.toJSON(track);
    } else {
      json = {
        "name": track.name,
        "times": convertArray(track.times, Array),
        "values": convertArray(track.values, Array)
      };
      const interpolation = track.getInterpolation();
      if (interpolation !== track.DefaultInterpolation) {
        json.interpolation = interpolation;
      }
    }
    json.type = track.ValueTypeName;
    return json;
  }
  InterpolantFactoryMethodDiscrete(result) {
    return new DiscreteInterpolant(this.times, this.values, this.getValueSize(), result);
  }
  InterpolantFactoryMethodLinear(result) {
    return new LinearInterpolant(this.times, this.values, this.getValueSize(), result);
  }
  InterpolantFactoryMethodSmooth(result) {
    return new CubicInterpolant(this.times, this.values, this.getValueSize(), result);
  }
  setInterpolation(interpolation) {
    let factoryMethod;
    switch (interpolation) {
      case InterpolateDiscrete:
        factoryMethod = this.InterpolantFactoryMethodDiscrete;
        break;
      case InterpolateLinear:
        factoryMethod = this.InterpolantFactoryMethodLinear;
        break;
      case InterpolateSmooth:
        factoryMethod = this.InterpolantFactoryMethodSmooth;
        break;
    }
    if (factoryMethod === void 0) {
      const message = "unsupported interpolation for " + this.ValueTypeName + " keyframe track named " + this.name;
      if (this.createInterpolant === void 0) {
        if (interpolation !== this.DefaultInterpolation) {
          this.setInterpolation(this.DefaultInterpolation);
        } else {
          throw new Error(message);
        }
      }
      console.warn("THREE.KeyframeTrack:", message);
      return this;
    }
    this.createInterpolant = factoryMethod;
    return this;
  }
  getInterpolation() {
    switch (this.createInterpolant) {
      case this.InterpolantFactoryMethodDiscrete:
        return InterpolateDiscrete;
      case this.InterpolantFactoryMethodLinear:
        return InterpolateLinear;
      case this.InterpolantFactoryMethodSmooth:
        return InterpolateSmooth;
    }
  }
  getValueSize() {
    return this.values.length / this.times.length;
  }
  // move all keyframes either forwards or backwards in time
  shift(timeOffset) {
    if (timeOffset !== 0) {
      const times = this.times;
      for (let i = 0, n = times.length; i !== n; ++i) {
        times[i] += timeOffset;
      }
    }
    return this;
  }
  // scale all keyframe times by a factor (useful for frame <-> seconds conversions)
  scale(timeScale) {
    if (timeScale !== 1) {
      const times = this.times;
      for (let i = 0, n = times.length; i !== n; ++i) {
        times[i] *= timeScale;
      }
    }
    return this;
  }
  // removes keyframes before and after animation without changing any values within the range [startTime, endTime].
  // IMPORTANT: We do not shift around keys to the start of the track time, because for interpolated keys this will change their values
  trim(startTime, endTime) {
    const times = this.times, nKeys = times.length;
    let from = 0, to = nKeys - 1;
    while (from !== nKeys && times[from] < startTime) {
      ++from;
    }
    while (to !== -1 && times[to] > endTime) {
      --to;
    }
    ++to;
    if (from !== 0 || to !== nKeys) {
      if (from >= to) {
        to = Math.max(to, 1);
        from = to - 1;
      }
      const stride = this.getValueSize();
      this.times = times.slice(from, to);
      this.values = this.values.slice(from * stride, to * stride);
    }
    return this;
  }
  // ensure we do not get a GarbageInGarbageOut situation, make sure tracks are at least minimally viable
  validate() {
    let valid = true;
    const valueSize = this.getValueSize();
    if (valueSize - Math.floor(valueSize) !== 0) {
      console.error("THREE.KeyframeTrack: Invalid value size in track.", this);
      valid = false;
    }
    const times = this.times, values = this.values, nKeys = times.length;
    if (nKeys === 0) {
      console.error("THREE.KeyframeTrack: Track is empty.", this);
      valid = false;
    }
    let prevTime = null;
    for (let i = 0; i !== nKeys; i++) {
      const currTime = times[i];
      if (typeof currTime === "number" && isNaN(currTime)) {
        console.error("THREE.KeyframeTrack: Time is not a valid number.", this, i, currTime);
        valid = false;
        break;
      }
      if (prevTime !== null && prevTime > currTime) {
        console.error("THREE.KeyframeTrack: Out of order keys.", this, i, currTime, prevTime);
        valid = false;
        break;
      }
      prevTime = currTime;
    }
    if (values !== void 0) {
      if (isTypedArray(values)) {
        for (let i = 0, n = values.length; i !== n; ++i) {
          const value = values[i];
          if (isNaN(value)) {
            console.error("THREE.KeyframeTrack: Value is not a valid number.", this, i, value);
            valid = false;
            break;
          }
        }
      }
    }
    return valid;
  }
  // removes equivalent sequential keys as common in morph target sequences
  // (0,0,0,0,1,1,1,0,0,0,0,0,0,0) --> (0,0,1,1,0,0)
  optimize() {
    const times = this.times.slice(), values = this.values.slice(), stride = this.getValueSize(), smoothInterpolation = this.getInterpolation() === InterpolateSmooth, lastIndex = times.length - 1;
    let writeIndex = 1;
    for (let i = 1; i < lastIndex; ++i) {
      let keep = false;
      const time = times[i];
      const timeNext = times[i + 1];
      if (time !== timeNext && (i !== 1 || time !== times[0])) {
        if (!smoothInterpolation) {
          const offset = i * stride, offsetP = offset - stride, offsetN = offset + stride;
          for (let j = 0; j !== stride; ++j) {
            const value = values[offset + j];
            if (value !== values[offsetP + j] || value !== values[offsetN + j]) {
              keep = true;
              break;
            }
          }
        } else {
          keep = true;
        }
      }
      if (keep) {
        if (i !== writeIndex) {
          times[writeIndex] = times[i];
          const readOffset = i * stride, writeOffset = writeIndex * stride;
          for (let j = 0; j !== stride; ++j) {
            values[writeOffset + j] = values[readOffset + j];
          }
        }
        ++writeIndex;
      }
    }
    if (lastIndex > 0) {
      times[writeIndex] = times[lastIndex];
      for (let readOffset = lastIndex * stride, writeOffset = writeIndex * stride, j = 0; j !== stride; ++j) {
        values[writeOffset + j] = values[readOffset + j];
      }
      ++writeIndex;
    }
    if (writeIndex !== times.length) {
      this.times = times.slice(0, writeIndex);
      this.values = values.slice(0, writeIndex * stride);
    } else {
      this.times = times;
      this.values = values;
    }
    return this;
  }
  clone() {
    const times = this.times.slice();
    const values = this.values.slice();
    const TypedKeyframeTrack = this.constructor;
    const track = new TypedKeyframeTrack(this.name, times, values);
    track.createInterpolant = this.createInterpolant;
    return track;
  }
};
KeyframeTrack.prototype.TimeBufferType = Float32Array;
KeyframeTrack.prototype.ValueBufferType = Float32Array;
KeyframeTrack.prototype.DefaultInterpolation = InterpolateLinear;
var BooleanKeyframeTrack = class extends KeyframeTrack {
};
BooleanKeyframeTrack.prototype.ValueTypeName = "bool";
BooleanKeyframeTrack.prototype.ValueBufferType = Array;
BooleanKeyframeTrack.prototype.DefaultInterpolation = InterpolateDiscrete;
BooleanKeyframeTrack.prototype.InterpolantFactoryMethodLinear = void 0;
BooleanKeyframeTrack.prototype.InterpolantFactoryMethodSmooth = void 0;
var ColorKeyframeTrack = class extends KeyframeTrack {
};
ColorKeyframeTrack.prototype.ValueTypeName = "color";
var NumberKeyframeTrack = class extends KeyframeTrack {
};
NumberKeyframeTrack.prototype.ValueTypeName = "number";
var QuaternionLinearInterpolant = class extends Interpolant {
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, alpha = (t - t0) / (t1 - t0);
    let offset = i1 * stride;
    for (let end = offset + stride; offset !== end; offset += 4) {
      Quaternion.slerpFlat(result, 0, values, offset - stride, values, offset, alpha);
    }
    return result;
  }
};
var QuaternionKeyframeTrack = class extends KeyframeTrack {
  InterpolantFactoryMethodLinear(result) {
    return new QuaternionLinearInterpolant(this.times, this.values, this.getValueSize(), result);
  }
};
QuaternionKeyframeTrack.prototype.ValueTypeName = "quaternion";
QuaternionKeyframeTrack.prototype.DefaultInterpolation = InterpolateLinear;
QuaternionKeyframeTrack.prototype.InterpolantFactoryMethodSmooth = void 0;
var StringKeyframeTrack = class extends KeyframeTrack {
};
StringKeyframeTrack.prototype.ValueTypeName = "string";
StringKeyframeTrack.prototype.ValueBufferType = Array;
StringKeyframeTrack.prototype.DefaultInterpolation = InterpolateDiscrete;
StringKeyframeTrack.prototype.InterpolantFactoryMethodLinear = void 0;
StringKeyframeTrack.prototype.InterpolantFactoryMethodSmooth = void 0;
var VectorKeyframeTrack = class extends KeyframeTrack {
};
VectorKeyframeTrack.prototype.ValueTypeName = "vector";
var AnimationClip = class {
  constructor(name = "", duration = -1, tracks = [], blendMode = NormalAnimationBlendMode) {
    this.name = name;
    this.tracks = tracks;
    this.duration = duration;
    this.blendMode = blendMode;
    this.uuid = generateUUID();
    if (this.duration < 0) {
      this.resetDuration();
    }
  }
  static parse(json) {
    const tracks = [], jsonTracks = json.tracks, frameTime = 1 / (json.fps || 1);
    for (let i = 0, n = jsonTracks.length; i !== n; ++i) {
      tracks.push(parseKeyframeTrack(jsonTracks[i]).scale(frameTime));
    }
    const clip = new this(json.name, json.duration, tracks, json.blendMode);
    clip.uuid = json.uuid;
    return clip;
  }
  static toJSON(clip) {
    const tracks = [], clipTracks = clip.tracks;
    const json = {
      "name": clip.name,
      "duration": clip.duration,
      "tracks": tracks,
      "uuid": clip.uuid,
      "blendMode": clip.blendMode
    };
    for (let i = 0, n = clipTracks.length; i !== n; ++i) {
      tracks.push(KeyframeTrack.toJSON(clipTracks[i]));
    }
    return json;
  }
  static CreateFromMorphTargetSequence(name, morphTargetSequence, fps, noLoop) {
    const numMorphTargets = morphTargetSequence.length;
    const tracks = [];
    for (let i = 0; i < numMorphTargets; i++) {
      let times = [];
      let values = [];
      times.push(
        (i + numMorphTargets - 1) % numMorphTargets,
        i,
        (i + 1) % numMorphTargets
      );
      values.push(0, 1, 0);
      const order = getKeyframeOrder(times);
      times = sortedArray(times, 1, order);
      values = sortedArray(values, 1, order);
      if (!noLoop && times[0] === 0) {
        times.push(numMorphTargets);
        values.push(values[0]);
      }
      tracks.push(
        new NumberKeyframeTrack(
          ".morphTargetInfluences[" + morphTargetSequence[i].name + "]",
          times,
          values
        ).scale(1 / fps)
      );
    }
    return new this(name, -1, tracks);
  }
  static findByName(objectOrClipArray, name) {
    let clipArray = objectOrClipArray;
    if (!Array.isArray(objectOrClipArray)) {
      const o = objectOrClipArray;
      clipArray = o.geometry && o.geometry.animations || o.animations;
    }
    for (let i = 0; i < clipArray.length; i++) {
      if (clipArray[i].name === name) {
        return clipArray[i];
      }
    }
    return null;
  }
  static CreateClipsFromMorphTargetSequences(morphTargets, fps, noLoop) {
    const animationToMorphTargets = {};
    const pattern = /^([\w-]*?)([\d]+)$/;
    for (let i = 0, il = morphTargets.length; i < il; i++) {
      const morphTarget = morphTargets[i];
      const parts = morphTarget.name.match(pattern);
      if (parts && parts.length > 1) {
        const name = parts[1];
        let animationMorphTargets = animationToMorphTargets[name];
        if (!animationMorphTargets) {
          animationToMorphTargets[name] = animationMorphTargets = [];
        }
        animationMorphTargets.push(morphTarget);
      }
    }
    const clips = [];
    for (const name in animationToMorphTargets) {
      clips.push(this.CreateFromMorphTargetSequence(name, animationToMorphTargets[name], fps, noLoop));
    }
    return clips;
  }
  // parse the animation.hierarchy format
  static parseAnimation(animation, bones) {
    if (!animation) {
      console.error("THREE.AnimationClip: No animation in JSONLoader data.");
      return null;
    }
    const addNonemptyTrack = function(trackType, trackName, animationKeys, propertyName, destTracks) {
      if (animationKeys.length !== 0) {
        const times = [];
        const values = [];
        flattenJSON(animationKeys, times, values, propertyName);
        if (times.length !== 0) {
          destTracks.push(new trackType(trackName, times, values));
        }
      }
    };
    const tracks = [];
    const clipName = animation.name || "default";
    const fps = animation.fps || 30;
    const blendMode = animation.blendMode;
    let duration = animation.length || -1;
    const hierarchyTracks = animation.hierarchy || [];
    for (let h = 0; h < hierarchyTracks.length; h++) {
      const animationKeys = hierarchyTracks[h].keys;
      if (!animationKeys || animationKeys.length === 0) continue;
      if (animationKeys[0].morphTargets) {
        const morphTargetNames = {};
        let k;
        for (k = 0; k < animationKeys.length; k++) {
          if (animationKeys[k].morphTargets) {
            for (let m = 0; m < animationKeys[k].morphTargets.length; m++) {
              morphTargetNames[animationKeys[k].morphTargets[m]] = -1;
            }
          }
        }
        for (const morphTargetName in morphTargetNames) {
          const times = [];
          const values = [];
          for (let m = 0; m !== animationKeys[k].morphTargets.length; ++m) {
            const animationKey = animationKeys[k];
            times.push(animationKey.time);
            values.push(animationKey.morphTarget === morphTargetName ? 1 : 0);
          }
          tracks.push(new NumberKeyframeTrack(".morphTargetInfluence[" + morphTargetName + "]", times, values));
        }
        duration = morphTargetNames.length * fps;
      } else {
        const boneName = ".bones[" + bones[h].name + "]";
        addNonemptyTrack(
          VectorKeyframeTrack,
          boneName + ".position",
          animationKeys,
          "pos",
          tracks
        );
        addNonemptyTrack(
          QuaternionKeyframeTrack,
          boneName + ".quaternion",
          animationKeys,
          "rot",
          tracks
        );
        addNonemptyTrack(
          VectorKeyframeTrack,
          boneName + ".scale",
          animationKeys,
          "scl",
          tracks
        );
      }
    }
    if (tracks.length === 0) {
      return null;
    }
    const clip = new this(clipName, duration, tracks, blendMode);
    return clip;
  }
  resetDuration() {
    const tracks = this.tracks;
    let duration = 0;
    for (let i = 0, n = tracks.length; i !== n; ++i) {
      const track = this.tracks[i];
      duration = Math.max(duration, track.times[track.times.length - 1]);
    }
    this.duration = duration;
    return this;
  }
  trim() {
    for (let i = 0; i < this.tracks.length; i++) {
      this.tracks[i].trim(0, this.duration);
    }
    return this;
  }
  validate() {
    let valid = true;
    for (let i = 0; i < this.tracks.length; i++) {
      valid = valid && this.tracks[i].validate();
    }
    return valid;
  }
  optimize() {
    for (let i = 0; i < this.tracks.length; i++) {
      this.tracks[i].optimize();
    }
    return this;
  }
  clone() {
    const tracks = [];
    for (let i = 0; i < this.tracks.length; i++) {
      tracks.push(this.tracks[i].clone());
    }
    return new this.constructor(this.name, this.duration, tracks, this.blendMode);
  }
  toJSON() {
    return this.constructor.toJSON(this);
  }
};
function getTrackTypeForValueTypeName(typeName) {
  switch (typeName.toLowerCase()) {
    case "scalar":
    case "double":
    case "float":
    case "number":
    case "integer":
      return NumberKeyframeTrack;
    case "vector":
    case "vector2":
    case "vector3":
    case "vector4":
      return VectorKeyframeTrack;
    case "color":
      return ColorKeyframeTrack;
    case "quaternion":
      return QuaternionKeyframeTrack;
    case "bool":
    case "boolean":
      return BooleanKeyframeTrack;
    case "string":
      return StringKeyframeTrack;
  }
  throw new Error("THREE.KeyframeTrack: Unsupported typeName: " + typeName);
}
function parseKeyframeTrack(json) {
  if (json.type === void 0) {
    throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");
  }
  const trackType = getTrackTypeForValueTypeName(json.type);
  if (json.times === void 0) {
    const times = [], values = [];
    flattenJSON(json.keys, times, values, "value");
    json.times = times;
    json.values = values;
  }
  if (trackType.parse !== void 0) {
    return trackType.parse(json);
  } else {
    return new trackType(json.name, json.times, json.values, json.interpolation);
  }
}
var Cache = {
  enabled: false,
  files: {},
  add: function(key, file) {
    if (this.enabled === false) return;
    this.files[key] = file;
  },
  get: function(key) {
    if (this.enabled === false) return;
    return this.files[key];
  },
  remove: function(key) {
    delete this.files[key];
  },
  clear: function() {
    this.files = {};
  }
};
var LoadingManager = class {
  constructor(onLoad, onProgress, onError) {
    const scope = this;
    let isLoading = false;
    let itemsLoaded = 0;
    let itemsTotal = 0;
    let urlModifier = void 0;
    const handlers = [];
    this.onStart = void 0;
    this.onLoad = onLoad;
    this.onProgress = onProgress;
    this.onError = onError;
    this.itemStart = function(url) {
      itemsTotal++;
      if (isLoading === false) {
        if (scope.onStart !== void 0) {
          scope.onStart(url, itemsLoaded, itemsTotal);
        }
      }
      isLoading = true;
    };
    this.itemEnd = function(url) {
      itemsLoaded++;
      if (scope.onProgress !== void 0) {
        scope.onProgress(url, itemsLoaded, itemsTotal);
      }
      if (itemsLoaded === itemsTotal) {
        isLoading = false;
        if (scope.onLoad !== void 0) {
          scope.onLoad();
        }
      }
    };
    this.itemError = function(url) {
      if (scope.onError !== void 0) {
        scope.onError(url);
      }
    };
    this.resolveURL = function(url) {
      if (urlModifier) {
        return urlModifier(url);
      }
      return url;
    };
    this.setURLModifier = function(transform) {
      urlModifier = transform;
      return this;
    };
    this.addHandler = function(regex, loader) {
      handlers.push(regex, loader);
      return this;
    };
    this.removeHandler = function(regex) {
      const index = handlers.indexOf(regex);
      if (index !== -1) {
        handlers.splice(index, 2);
      }
      return this;
    };
    this.getHandler = function(file) {
      for (let i = 0, l = handlers.length; i < l; i += 2) {
        const regex = handlers[i];
        const loader = handlers[i + 1];
        if (regex.global) regex.lastIndex = 0;
        if (regex.test(file)) {
          return loader;
        }
      }
      return null;
    };
  }
};
var DefaultLoadingManager = /* @__PURE__ */ new LoadingManager();
var Loader = class {
  constructor(manager) {
    this.manager = manager !== void 0 ? manager : DefaultLoadingManager;
    this.crossOrigin = "anonymous";
    this.withCredentials = false;
    this.path = "";
    this.resourcePath = "";
    this.requestHeader = {};
  }
  load() {
  }
  loadAsync(url, onProgress) {
    const scope = this;
    return new Promise(function(resolve, reject) {
      scope.load(url, resolve, onProgress, reject);
    });
  }
  parse() {
  }
  setCrossOrigin(crossOrigin) {
    this.crossOrigin = crossOrigin;
    return this;
  }
  setWithCredentials(value) {
    this.withCredentials = value;
    return this;
  }
  setPath(path) {
    this.path = path;
    return this;
  }
  setResourcePath(resourcePath) {
    this.resourcePath = resourcePath;
    return this;
  }
  setRequestHeader(requestHeader) {
    this.requestHeader = requestHeader;
    return this;
  }
};
Loader.DEFAULT_MATERIAL_NAME = "__DEFAULT";
var loading = {};
var HttpError2 = class extends Error {
  constructor(message, response) {
    super(message);
    this.response = response;
  }
};
var FileLoader = class extends Loader {
  constructor(manager) {
    super(manager);
  }
  load(url, onLoad, onProgress, onError) {
    if (url === void 0) url = "";
    if (this.path !== void 0) url = this.path + url;
    url = this.manager.resolveURL(url);
    const cached = Cache.get(url);
    if (cached !== void 0) {
      this.manager.itemStart(url);
      setTimeout(() => {
        if (onLoad) onLoad(cached);
        this.manager.itemEnd(url);
      }, 0);
      return cached;
    }
    if (loading[url] !== void 0) {
      loading[url].push({
        onLoad,
        onProgress,
        onError
      });
      return;
    }
    loading[url] = [];
    loading[url].push({
      onLoad,
      onProgress,
      onError
    });
    const req = new Request(url, {
      headers: new Headers(this.requestHeader),
      credentials: this.withCredentials ? "include" : "same-origin"
      // An abort controller could be added within a future PR
    });
    const mimeType = this.mimeType;
    const responseType = this.responseType;
    fetch(req).then((response) => {
      if (response.status === 200 || response.status === 0) {
        if (response.status === 0) {
          console.warn("THREE.FileLoader: HTTP Status 0 received.");
        }
        if (typeof ReadableStream === "undefined" || response.body === void 0 || response.body.getReader === void 0) {
          return response;
        }
        const callbacks = loading[url];
        const reader = response.body.getReader();
        const contentLength = response.headers.get("X-File-Size") || response.headers.get("Content-Length");
        const total = contentLength ? parseInt(contentLength) : 0;
        const lengthComputable = total !== 0;
        let loaded = 0;
        const stream = new ReadableStream({
          start(controller) {
            readData();
            function readData() {
              reader.read().then(({ done, value }) => {
                if (done) {
                  controller.close();
                } else {
                  loaded += value.byteLength;
                  const event = new ProgressEvent("progress", { lengthComputable, loaded, total });
                  for (let i = 0, il = callbacks.length; i < il; i++) {
                    const callback = callbacks[i];
                    if (callback.onProgress) callback.onProgress(event);
                  }
                  controller.enqueue(value);
                  readData();
                }
              });
            }
          }
        });
        return new Response(stream);
      } else {
        throw new HttpError2(`fetch for "${response.url}" responded with ${response.status}: ${response.statusText}`, response);
      }
    }).then((response) => {
      switch (responseType) {
        case "arraybuffer":
          return response.arrayBuffer();
        case "blob":
          return response.blob();
        case "document":
          return response.text().then((text) => {
            const parser = new DOMParser();
            return parser.parseFromString(text, mimeType);
          });
        case "json":
          return response.json();
        default:
          if (mimeType === void 0) {
            return response.text();
          } else {
            const re = /charset="?([^;"\s]*)"?/i;
            const exec = re.exec(mimeType);
            const label = exec && exec[1] ? exec[1].toLowerCase() : void 0;
            const decoder = new TextDecoder(label);
            return response.arrayBuffer().then((ab) => decoder.decode(ab));
          }
      }
    }).then((data) => {
      Cache.add(url, data);
      const callbacks = loading[url];
      delete loading[url];
      for (let i = 0, il = callbacks.length; i < il; i++) {
        const callback = callbacks[i];
        if (callback.onLoad) callback.onLoad(data);
      }
    }).catch((err2) => {
      const callbacks = loading[url];
      if (callbacks === void 0) {
        this.manager.itemError(url);
        throw err2;
      }
      delete loading[url];
      for (let i = 0, il = callbacks.length; i < il; i++) {
        const callback = callbacks[i];
        if (callback.onError) callback.onError(err2);
      }
      this.manager.itemError(url);
    }).finally(() => {
      this.manager.itemEnd(url);
    });
    this.manager.itemStart(url);
  }
  setResponseType(value) {
    this.responseType = value;
    return this;
  }
  setMimeType(value) {
    this.mimeType = value;
    return this;
  }
};
var ImageLoader = class extends Loader {
  constructor(manager) {
    super(manager);
  }
  load(url, onLoad, onProgress, onError) {
    if (this.path !== void 0) url = this.path + url;
    url = this.manager.resolveURL(url);
    const scope = this;
    const cached = Cache.get(url);
    if (cached !== void 0) {
      scope.manager.itemStart(url);
      setTimeout(function() {
        if (onLoad) onLoad(cached);
        scope.manager.itemEnd(url);
      }, 0);
      return cached;
    }
    const image = createElementNS("img");
    function onImageLoad() {
      removeEventListeners();
      Cache.add(url, this);
      if (onLoad) onLoad(this);
      scope.manager.itemEnd(url);
    }
    function onImageError(event) {
      removeEventListeners();
      if (onError) onError(event);
      scope.manager.itemError(url);
      scope.manager.itemEnd(url);
    }
    function removeEventListeners() {
      image.removeEventListener("load", onImageLoad, false);
      image.removeEventListener("error", onImageError, false);
    }
    image.addEventListener("load", onImageLoad, false);
    image.addEventListener("error", onImageError, false);
    if (url.slice(0, 5) !== "data:") {
      if (this.crossOrigin !== void 0) image.crossOrigin = this.crossOrigin;
    }
    scope.manager.itemStart(url);
    image.src = url;
    return image;
  }
};
var TextureLoader = class extends Loader {
  constructor(manager) {
    super(manager);
  }
  load(url, onLoad, onProgress, onError) {
    const texture = new Texture();
    const loader = new ImageLoader(this.manager);
    loader.setCrossOrigin(this.crossOrigin);
    loader.setPath(this.path);
    loader.load(url, function(image) {
      texture.image = image;
      texture.needsUpdate = true;
      if (onLoad !== void 0) {
        onLoad(texture);
      }
    }, onProgress, onError);
    return texture;
  }
};
var Light = class extends Object3D {
  constructor(color, intensity = 1) {
    super();
    this.isLight = true;
    this.type = "Light";
    this.color = new Color(color);
    this.intensity = intensity;
  }
  dispose() {
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.color.copy(source.color);
    this.intensity = source.intensity;
    return this;
  }
  toJSON(meta) {
    const data = super.toJSON(meta);
    data.object.color = this.color.getHex();
    data.object.intensity = this.intensity;
    if (this.groundColor !== void 0) data.object.groundColor = this.groundColor.getHex();
    if (this.distance !== void 0) data.object.distance = this.distance;
    if (this.angle !== void 0) data.object.angle = this.angle;
    if (this.decay !== void 0) data.object.decay = this.decay;
    if (this.penumbra !== void 0) data.object.penumbra = this.penumbra;
    if (this.shadow !== void 0) data.object.shadow = this.shadow.toJSON();
    return data;
  }
};
var _projScreenMatrix$1 = /* @__PURE__ */ new Matrix4();
var _lightPositionWorld$1 = /* @__PURE__ */ new Vector3();
var _lookTarget$1 = /* @__PURE__ */ new Vector3();
var LightShadow = class {
  constructor(camera) {
    this.camera = camera;
    this.bias = 0;
    this.normalBias = 0;
    this.radius = 1;
    this.blurSamples = 8;
    this.mapSize = new Vector2(512, 512);
    this.map = null;
    this.mapPass = null;
    this.matrix = new Matrix4();
    this.autoUpdate = true;
    this.needsUpdate = false;
    this._frustum = new Frustum();
    this._frameExtents = new Vector2(1, 1);
    this._viewportCount = 1;
    this._viewports = [
      new Vector4(0, 0, 1, 1)
    ];
  }
  getViewportCount() {
    return this._viewportCount;
  }
  getFrustum() {
    return this._frustum;
  }
  updateMatrices(light) {
    const shadowCamera = this.camera;
    const shadowMatrix = this.matrix;
    _lightPositionWorld$1.setFromMatrixPosition(light.matrixWorld);
    shadowCamera.position.copy(_lightPositionWorld$1);
    _lookTarget$1.setFromMatrixPosition(light.target.matrixWorld);
    shadowCamera.lookAt(_lookTarget$1);
    shadowCamera.updateMatrixWorld();
    _projScreenMatrix$1.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(_projScreenMatrix$1);
    shadowMatrix.set(
      0.5,
      0,
      0,
      0.5,
      0,
      0.5,
      0,
      0.5,
      0,
      0,
      0.5,
      0.5,
      0,
      0,
      0,
      1
    );
    shadowMatrix.multiply(_projScreenMatrix$1);
  }
  getViewport(viewportIndex) {
    return this._viewports[viewportIndex];
  }
  getFrameExtents() {
    return this._frameExtents;
  }
  dispose() {
    if (this.map) {
      this.map.dispose();
    }
    if (this.mapPass) {
      this.mapPass.dispose();
    }
  }
  copy(source) {
    this.camera = source.camera.clone();
    this.bias = source.bias;
    this.radius = source.radius;
    this.mapSize.copy(source.mapSize);
    return this;
  }
  clone() {
    return new this.constructor().copy(this);
  }
  toJSON() {
    const object = {};
    if (this.bias !== 0) object.bias = this.bias;
    if (this.normalBias !== 0) object.normalBias = this.normalBias;
    if (this.radius !== 1) object.radius = this.radius;
    if (this.mapSize.x !== 512 || this.mapSize.y !== 512) object.mapSize = this.mapSize.toArray();
    object.camera = this.camera.toJSON(false).object;
    delete object.camera.matrix;
    return object;
  }
};
var SpotLightShadow = class extends LightShadow {
  constructor() {
    super(new PerspectiveCamera(50, 1, 0.5, 500));
    this.isSpotLightShadow = true;
    this.focus = 1;
  }
  updateMatrices(light) {
    const camera = this.camera;
    const fov = RAD2DEG * 2 * light.angle * this.focus;
    const aspect = this.mapSize.width / this.mapSize.height;
    const far = light.distance || camera.far;
    if (fov !== camera.fov || aspect !== camera.aspect || far !== camera.far) {
      camera.fov = fov;
      camera.aspect = aspect;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    super.updateMatrices(light);
  }
  copy(source) {
    super.copy(source);
    this.focus = source.focus;
    return this;
  }
};
var SpotLight = class extends Light {
  constructor(color, intensity, distance = 0, angle = Math.PI / 3, penumbra = 0, decay = 2) {
    super(color, intensity);
    this.isSpotLight = true;
    this.type = "SpotLight";
    this.position.copy(Object3D.DEFAULT_UP);
    this.updateMatrix();
    this.target = new Object3D();
    this.distance = distance;
    this.angle = angle;
    this.penumbra = penumbra;
    this.decay = decay;
    this.map = null;
    this.shadow = new SpotLightShadow();
  }
  get power() {
    return this.intensity * Math.PI;
  }
  set power(power) {
    this.intensity = power / Math.PI;
  }
  dispose() {
    this.shadow.dispose();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.distance = source.distance;
    this.angle = source.angle;
    this.penumbra = source.penumbra;
    this.decay = source.decay;
    this.target = source.target.clone();
    this.shadow = source.shadow.clone();
    return this;
  }
};
var _projScreenMatrix = /* @__PURE__ */ new Matrix4();
var _lightPositionWorld = /* @__PURE__ */ new Vector3();
var _lookTarget = /* @__PURE__ */ new Vector3();
var PointLightShadow = class extends LightShadow {
  constructor() {
    super(new PerspectiveCamera(90, 1, 0.5, 500));
    this.isPointLightShadow = true;
    this._frameExtents = new Vector2(4, 2);
    this._viewportCount = 6;
    this._viewports = [
      // These viewports map a cube-map onto a 2D texture with the
      // following orientation:
      //
      //  xzXZ
      //   y Y
      //
      // X - Positive x direction
      // x - Negative x direction
      // Y - Positive y direction
      // y - Negative y direction
      // Z - Positive z direction
      // z - Negative z direction
      // positive X
      new Vector4(2, 1, 1, 1),
      // negative X
      new Vector4(0, 1, 1, 1),
      // positive Z
      new Vector4(3, 1, 1, 1),
      // negative Z
      new Vector4(1, 1, 1, 1),
      // positive Y
      new Vector4(3, 0, 1, 1),
      // negative Y
      new Vector4(1, 0, 1, 1)
    ];
    this._cubeDirections = [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0),
      new Vector3(0, -1, 0)
    ];
    this._cubeUps = [
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1)
    ];
  }
  updateMatrices(light, viewportIndex = 0) {
    const camera = this.camera;
    const shadowMatrix = this.matrix;
    const far = light.distance || camera.far;
    if (far !== camera.far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    _lightPositionWorld.setFromMatrixPosition(light.matrixWorld);
    camera.position.copy(_lightPositionWorld);
    _lookTarget.copy(camera.position);
    _lookTarget.add(this._cubeDirections[viewportIndex]);
    camera.up.copy(this._cubeUps[viewportIndex]);
    camera.lookAt(_lookTarget);
    camera.updateMatrixWorld();
    shadowMatrix.makeTranslation(-_lightPositionWorld.x, -_lightPositionWorld.y, -_lightPositionWorld.z);
    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(_projScreenMatrix);
  }
};
var PointLight = class extends Light {
  constructor(color, intensity, distance = 0, decay = 2) {
    super(color, intensity);
    this.isPointLight = true;
    this.type = "PointLight";
    this.distance = distance;
    this.decay = decay;
    this.shadow = new PointLightShadow();
  }
  get power() {
    return this.intensity * 4 * Math.PI;
  }
  set power(power) {
    this.intensity = power / (4 * Math.PI);
  }
  dispose() {
    this.shadow.dispose();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.distance = source.distance;
    this.decay = source.decay;
    this.shadow = source.shadow.clone();
    return this;
  }
};
var DirectionalLightShadow = class extends LightShadow {
  constructor() {
    super(new OrthographicCamera(-5, 5, 5, -5, 0.5, 500));
    this.isDirectionalLightShadow = true;
  }
};
var DirectionalLight = class extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.isDirectionalLight = true;
    this.type = "DirectionalLight";
    this.position.copy(Object3D.DEFAULT_UP);
    this.updateMatrix();
    this.target = new Object3D();
    this.shadow = new DirectionalLightShadow();
  }
  dispose() {
    this.shadow.dispose();
  }
  copy(source) {
    super.copy(source);
    this.target = source.target.clone();
    this.shadow = source.shadow.clone();
    return this;
  }
};
var AmbientLight = class extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.isAmbientLight = true;
    this.type = "AmbientLight";
  }
};
var LoaderUtils = class {
  static decodeText(array) {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(array);
    }
    let s = "";
    for (let i = 0, il = array.length; i < il; i++) {
      s += String.fromCharCode(array[i]);
    }
    try {
      return decodeURIComponent(escape(s));
    } catch (e) {
      return s;
    }
  }
  static extractUrlBase(url) {
    const index = url.lastIndexOf("/");
    if (index === -1) return "./";
    return url.slice(0, index + 1);
  }
  static resolveURL(url, path) {
    if (typeof url !== "string" || url === "") return "";
    if (/^https?:\/\//i.test(path) && /^\//.test(url)) {
      path = path.replace(/(^https?:\/\/[^\/]+).*/i, "$1");
    }
    if (/^(https?:)?\/\//i.test(url)) return url;
    if (/^data:.*,.*$/i.test(url)) return url;
    if (/^blob:.*$/i.test(url)) return url;
    return path + url;
  }
};
var _RESERVED_CHARS_RE = "\\[\\]\\.:\\/";
var _reservedRe = new RegExp("[" + _RESERVED_CHARS_RE + "]", "g");
var _wordChar = "[^" + _RESERVED_CHARS_RE + "]";
var _wordCharOrDot = "[^" + _RESERVED_CHARS_RE.replace("\\.", "") + "]";
var _directoryRe = /* @__PURE__ */ /((?:WC+[\/:])*)/.source.replace("WC", _wordChar);
var _nodeRe = /* @__PURE__ */ /(WCOD+)?/.source.replace("WCOD", _wordCharOrDot);
var _objectRe = /* @__PURE__ */ /(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC", _wordChar);
var _propertyRe = /* @__PURE__ */ /\.(WC+)(?:\[(.+)\])?/.source.replace("WC", _wordChar);
var _trackRe = new RegExp(
  "^" + _directoryRe + _nodeRe + _objectRe + _propertyRe + "$"
);
var _supportedObjectNames = ["material", "materials", "bones", "map"];
var Composite = class {
  constructor(targetGroup, path, optionalParsedPath) {
    const parsedPath = optionalParsedPath || PropertyBinding.parseTrackName(path);
    this._targetGroup = targetGroup;
    this._bindings = targetGroup.subscribe_(path, parsedPath);
  }
  getValue(array, offset) {
    this.bind();
    const firstValidIndex = this._targetGroup.nCachedObjects_, binding = this._bindings[firstValidIndex];
    if (binding !== void 0) binding.getValue(array, offset);
  }
  setValue(array, offset) {
    const bindings = this._bindings;
    for (let i = this._targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i].setValue(array, offset);
    }
  }
  bind() {
    const bindings = this._bindings;
    for (let i = this._targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i].bind();
    }
  }
  unbind() {
    const bindings = this._bindings;
    for (let i = this._targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i].unbind();
    }
  }
};
var PropertyBinding = class _PropertyBinding {
  constructor(rootNode, path, parsedPath) {
    this.path = path;
    this.parsedPath = parsedPath || _PropertyBinding.parseTrackName(path);
    this.node = _PropertyBinding.findNode(rootNode, this.parsedPath.nodeName);
    this.rootNode = rootNode;
    this.getValue = this._getValue_unbound;
    this.setValue = this._setValue_unbound;
  }
  static create(root, path, parsedPath) {
    if (!(root && root.isAnimationObjectGroup)) {
      return new _PropertyBinding(root, path, parsedPath);
    } else {
      return new _PropertyBinding.Composite(root, path, parsedPath);
    }
  }
  /**
   * Replaces spaces with underscores and removes unsupported characters from
   * node names, to ensure compatibility with parseTrackName().
   *
   * @param {string} name Node name to be sanitized.
   * @return {string}
   */
  static sanitizeNodeName(name) {
    return name.replace(/\s/g, "_").replace(_reservedRe, "");
  }
  static parseTrackName(trackName) {
    const matches = _trackRe.exec(trackName);
    if (matches === null) {
      throw new Error("PropertyBinding: Cannot parse trackName: " + trackName);
    }
    const results = {
      // directoryName: matches[ 1 ], // (tschw) currently unused
      nodeName: matches[2],
      objectName: matches[3],
      objectIndex: matches[4],
      propertyName: matches[5],
      // required
      propertyIndex: matches[6]
    };
    const lastDot = results.nodeName && results.nodeName.lastIndexOf(".");
    if (lastDot !== void 0 && lastDot !== -1) {
      const objectName = results.nodeName.substring(lastDot + 1);
      if (_supportedObjectNames.indexOf(objectName) !== -1) {
        results.nodeName = results.nodeName.substring(0, lastDot);
        results.objectName = objectName;
      }
    }
    if (results.propertyName === null || results.propertyName.length === 0) {
      throw new Error("PropertyBinding: can not parse propertyName from trackName: " + trackName);
    }
    return results;
  }
  static findNode(root, nodeName) {
    if (nodeName === void 0 || nodeName === "" || nodeName === "." || nodeName === -1 || nodeName === root.name || nodeName === root.uuid) {
      return root;
    }
    if (root.skeleton) {
      const bone = root.skeleton.getBoneByName(nodeName);
      if (bone !== void 0) {
        return bone;
      }
    }
    if (root.children) {
      const searchNodeSubtree = function(children) {
        for (let i = 0; i < children.length; i++) {
          const childNode = children[i];
          if (childNode.name === nodeName || childNode.uuid === nodeName) {
            return childNode;
          }
          const result = searchNodeSubtree(childNode.children);
          if (result) return result;
        }
        return null;
      };
      const subTreeNode = searchNodeSubtree(root.children);
      if (subTreeNode) {
        return subTreeNode;
      }
    }
    return null;
  }
  // these are used to "bind" a nonexistent property
  _getValue_unavailable() {
  }
  _setValue_unavailable() {
  }
  // Getters
  _getValue_direct(buffer, offset) {
    buffer[offset] = this.targetObject[this.propertyName];
  }
  _getValue_array(buffer, offset) {
    const source = this.resolvedProperty;
    for (let i = 0, n = source.length; i !== n; ++i) {
      buffer[offset++] = source[i];
    }
  }
  _getValue_arrayElement(buffer, offset) {
    buffer[offset] = this.resolvedProperty[this.propertyIndex];
  }
  _getValue_toArray(buffer, offset) {
    this.resolvedProperty.toArray(buffer, offset);
  }
  // Direct
  _setValue_direct(buffer, offset) {
    this.targetObject[this.propertyName] = buffer[offset];
  }
  _setValue_direct_setNeedsUpdate(buffer, offset) {
    this.targetObject[this.propertyName] = buffer[offset];
    this.targetObject.needsUpdate = true;
  }
  _setValue_direct_setMatrixWorldNeedsUpdate(buffer, offset) {
    this.targetObject[this.propertyName] = buffer[offset];
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  // EntireArray
  _setValue_array(buffer, offset) {
    const dest = this.resolvedProperty;
    for (let i = 0, n = dest.length; i !== n; ++i) {
      dest[i] = buffer[offset++];
    }
  }
  _setValue_array_setNeedsUpdate(buffer, offset) {
    const dest = this.resolvedProperty;
    for (let i = 0, n = dest.length; i !== n; ++i) {
      dest[i] = buffer[offset++];
    }
    this.targetObject.needsUpdate = true;
  }
  _setValue_array_setMatrixWorldNeedsUpdate(buffer, offset) {
    const dest = this.resolvedProperty;
    for (let i = 0, n = dest.length; i !== n; ++i) {
      dest[i] = buffer[offset++];
    }
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  // ArrayElement
  _setValue_arrayElement(buffer, offset) {
    this.resolvedProperty[this.propertyIndex] = buffer[offset];
  }
  _setValue_arrayElement_setNeedsUpdate(buffer, offset) {
    this.resolvedProperty[this.propertyIndex] = buffer[offset];
    this.targetObject.needsUpdate = true;
  }
  _setValue_arrayElement_setMatrixWorldNeedsUpdate(buffer, offset) {
    this.resolvedProperty[this.propertyIndex] = buffer[offset];
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  // HasToFromArray
  _setValue_fromArray(buffer, offset) {
    this.resolvedProperty.fromArray(buffer, offset);
  }
  _setValue_fromArray_setNeedsUpdate(buffer, offset) {
    this.resolvedProperty.fromArray(buffer, offset);
    this.targetObject.needsUpdate = true;
  }
  _setValue_fromArray_setMatrixWorldNeedsUpdate(buffer, offset) {
    this.resolvedProperty.fromArray(buffer, offset);
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  _getValue_unbound(targetArray, offset) {
    this.bind();
    this.getValue(targetArray, offset);
  }
  _setValue_unbound(sourceArray, offset) {
    this.bind();
    this.setValue(sourceArray, offset);
  }
  // create getter / setter pair for a property in the scene graph
  bind() {
    let targetObject = this.node;
    const parsedPath = this.parsedPath;
    const objectName = parsedPath.objectName;
    const propertyName = parsedPath.propertyName;
    let propertyIndex = parsedPath.propertyIndex;
    if (!targetObject) {
      targetObject = _PropertyBinding.findNode(this.rootNode, parsedPath.nodeName);
      this.node = targetObject;
    }
    this.getValue = this._getValue_unavailable;
    this.setValue = this._setValue_unavailable;
    if (!targetObject) {
      console.warn("THREE.PropertyBinding: No target node found for track: " + this.path + ".");
      return;
    }
    if (objectName) {
      let objectIndex = parsedPath.objectIndex;
      switch (objectName) {
        case "materials":
          if (!targetObject.material) {
            console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.", this);
            return;
          }
          if (!targetObject.material.materials) {
            console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.", this);
            return;
          }
          targetObject = targetObject.material.materials;
          break;
        case "bones":
          if (!targetObject.skeleton) {
            console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.", this);
            return;
          }
          targetObject = targetObject.skeleton.bones;
          for (let i = 0; i < targetObject.length; i++) {
            if (targetObject[i].name === objectIndex) {
              objectIndex = i;
              break;
            }
          }
          break;
        case "map":
          if ("map" in targetObject) {
            targetObject = targetObject.map;
            break;
          }
          if (!targetObject.material) {
            console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.", this);
            return;
          }
          if (!targetObject.material.map) {
            console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.", this);
            return;
          }
          targetObject = targetObject.material.map;
          break;
        default:
          if (targetObject[objectName] === void 0) {
            console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.", this);
            return;
          }
          targetObject = targetObject[objectName];
      }
      if (objectIndex !== void 0) {
        if (targetObject[objectIndex] === void 0) {
          console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.", this, targetObject);
          return;
        }
        targetObject = targetObject[objectIndex];
      }
    }
    const nodeProperty = targetObject[propertyName];
    if (nodeProperty === void 0) {
      const nodeName = parsedPath.nodeName;
      console.error("THREE.PropertyBinding: Trying to update property for track: " + nodeName + "." + propertyName + " but it wasn't found.", targetObject);
      return;
    }
    let versioning = this.Versioning.None;
    this.targetObject = targetObject;
    if (targetObject.needsUpdate !== void 0) {
      versioning = this.Versioning.NeedsUpdate;
    } else if (targetObject.matrixWorldNeedsUpdate !== void 0) {
      versioning = this.Versioning.MatrixWorldNeedsUpdate;
    }
    let bindingType = this.BindingType.Direct;
    if (propertyIndex !== void 0) {
      if (propertyName === "morphTargetInfluences") {
        if (!targetObject.geometry) {
          console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.", this);
          return;
        }
        if (!targetObject.geometry.morphAttributes) {
          console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.", this);
          return;
        }
        if (targetObject.morphTargetDictionary[propertyIndex] !== void 0) {
          propertyIndex = targetObject.morphTargetDictionary[propertyIndex];
        }
      }
      bindingType = this.BindingType.ArrayElement;
      this.resolvedProperty = nodeProperty;
      this.propertyIndex = propertyIndex;
    } else if (nodeProperty.fromArray !== void 0 && nodeProperty.toArray !== void 0) {
      bindingType = this.BindingType.HasFromToArray;
      this.resolvedProperty = nodeProperty;
    } else if (Array.isArray(nodeProperty)) {
      bindingType = this.BindingType.EntireArray;
      this.resolvedProperty = nodeProperty;
    } else {
      this.propertyName = propertyName;
    }
    this.getValue = this.GetterByBindingType[bindingType];
    this.setValue = this.SetterByBindingTypeAndVersioning[bindingType][versioning];
  }
  unbind() {
    this.node = null;
    this.getValue = this._getValue_unbound;
    this.setValue = this._setValue_unbound;
  }
};
PropertyBinding.Composite = Composite;
PropertyBinding.prototype.BindingType = {
  Direct: 0,
  EntireArray: 1,
  ArrayElement: 2,
  HasFromToArray: 3
};
PropertyBinding.prototype.Versioning = {
  None: 0,
  NeedsUpdate: 1,
  MatrixWorldNeedsUpdate: 2
};
PropertyBinding.prototype.GetterByBindingType = [
  PropertyBinding.prototype._getValue_direct,
  PropertyBinding.prototype._getValue_array,
  PropertyBinding.prototype._getValue_arrayElement,
  PropertyBinding.prototype._getValue_toArray
];
PropertyBinding.prototype.SetterByBindingTypeAndVersioning = [
  [
    // Direct
    PropertyBinding.prototype._setValue_direct,
    PropertyBinding.prototype._setValue_direct_setNeedsUpdate,
    PropertyBinding.prototype._setValue_direct_setMatrixWorldNeedsUpdate
  ],
  [
    // EntireArray
    PropertyBinding.prototype._setValue_array,
    PropertyBinding.prototype._setValue_array_setNeedsUpdate,
    PropertyBinding.prototype._setValue_array_setMatrixWorldNeedsUpdate
  ],
  [
    // ArrayElement
    PropertyBinding.prototype._setValue_arrayElement,
    PropertyBinding.prototype._setValue_arrayElement_setNeedsUpdate,
    PropertyBinding.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate
  ],
  [
    // HasToFromArray
    PropertyBinding.prototype._setValue_fromArray,
    PropertyBinding.prototype._setValue_fromArray_setNeedsUpdate,
    PropertyBinding.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate
  ]
];
var _controlInterpolantsResultBuffer = new Float32Array(1);
if (typeof __THREE_DEVTOOLS__ !== "undefined") {
  __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register", { detail: {
    revision: REVISION
  } }));
}
if (typeof window !== "undefined") {
  if (window.__THREE__) {
    console.warn("WARNING: Multiple instances of Three.js being imported.");
  } else {
    window.__THREE__ = REVISION;
  }
}

// ../../../../packages/harness-docket/node_modules/three/examples/jsm/curves/NURBSUtils.js
function findSpan(p, u, U) {
  const n = U.length - p - 1;
  if (u >= U[n]) {
    return n - 1;
  }
  if (u <= U[p]) {
    return p;
  }
  let low = p;
  let high = n;
  let mid = Math.floor((low + high) / 2);
  while (u < U[mid] || u >= U[mid + 1]) {
    if (u < U[mid]) {
      high = mid;
    } else {
      low = mid;
    }
    mid = Math.floor((low + high) / 2);
  }
  return mid;
}
function calcBasisFunctions(span, u, p, U) {
  const N = [];
  const left = [];
  const right = [];
  N[0] = 1;
  for (let j = 1; j <= p; ++j) {
    left[j] = u - U[span + 1 - j];
    right[j] = U[span + j] - u;
    let saved = 0;
    for (let r = 0; r < j; ++r) {
      const rv = right[r + 1];
      const lv = left[j - r];
      const temp = N[r] / (rv + lv);
      N[r] = saved + rv * temp;
      saved = lv * temp;
    }
    N[j] = saved;
  }
  return N;
}
function calcBSplinePoint(p, U, P, u) {
  const span = findSpan(p, u, U);
  const N = calcBasisFunctions(span, u, p, U);
  const C = new Vector4(0, 0, 0, 0);
  for (let j = 0; j <= p; ++j) {
    const point = P[span - p + j];
    const Nj = N[j];
    const wNj = point.w * Nj;
    C.x += point.x * wNj;
    C.y += point.y * wNj;
    C.z += point.z * wNj;
    C.w += point.w * Nj;
  }
  return C;
}
function calcBasisFunctionDerivatives(span, u, p, n, U) {
  const zeroArr = [];
  for (let i = 0; i <= p; ++i)
    zeroArr[i] = 0;
  const ders = [];
  for (let i = 0; i <= n; ++i)
    ders[i] = zeroArr.slice(0);
  const ndu = [];
  for (let i = 0; i <= p; ++i)
    ndu[i] = zeroArr.slice(0);
  ndu[0][0] = 1;
  const left = zeroArr.slice(0);
  const right = zeroArr.slice(0);
  for (let j = 1; j <= p; ++j) {
    left[j] = u - U[span + 1 - j];
    right[j] = U[span + j] - u;
    let saved = 0;
    for (let r2 = 0; r2 < j; ++r2) {
      const rv = right[r2 + 1];
      const lv = left[j - r2];
      ndu[j][r2] = rv + lv;
      const temp = ndu[r2][j - 1] / ndu[j][r2];
      ndu[r2][j] = saved + rv * temp;
      saved = lv * temp;
    }
    ndu[j][j] = saved;
  }
  for (let j = 0; j <= p; ++j) {
    ders[0][j] = ndu[j][p];
  }
  for (let r2 = 0; r2 <= p; ++r2) {
    let s1 = 0;
    let s2 = 1;
    const a = [];
    for (let i = 0; i <= p; ++i) {
      a[i] = zeroArr.slice(0);
    }
    a[0][0] = 1;
    for (let k = 1; k <= n; ++k) {
      let d = 0;
      const rk = r2 - k;
      const pk = p - k;
      if (r2 >= k) {
        a[s2][0] = a[s1][0] / ndu[pk + 1][rk];
        d = a[s2][0] * ndu[rk][pk];
      }
      const j1 = rk >= -1 ? 1 : -rk;
      const j2 = r2 - 1 <= pk ? k - 1 : p - r2;
      for (let j3 = j1; j3 <= j2; ++j3) {
        a[s2][j3] = (a[s1][j3] - a[s1][j3 - 1]) / ndu[pk + 1][rk + j3];
        d += a[s2][j3] * ndu[rk + j3][pk];
      }
      if (r2 <= pk) {
        a[s2][k] = -a[s1][k - 1] / ndu[pk + 1][r2];
        d += a[s2][k] * ndu[r2][pk];
      }
      ders[k][r2] = d;
      const j = s1;
      s1 = s2;
      s2 = j;
    }
  }
  let r = p;
  for (let k = 1; k <= n; ++k) {
    for (let j = 0; j <= p; ++j) {
      ders[k][j] *= r;
    }
    r *= p - k;
  }
  return ders;
}
function calcBSplineDerivatives(p, U, P, u, nd) {
  const du = nd < p ? nd : p;
  const CK = [];
  const span = findSpan(p, u, U);
  const nders = calcBasisFunctionDerivatives(span, u, p, du, U);
  const Pw = [];
  for (let i = 0; i < P.length; ++i) {
    const point = P[i].clone();
    const w = point.w;
    point.x *= w;
    point.y *= w;
    point.z *= w;
    Pw[i] = point;
  }
  for (let k = 0; k <= du; ++k) {
    const point = Pw[span - p].clone().multiplyScalar(nders[k][0]);
    for (let j = 1; j <= p; ++j) {
      point.add(Pw[span - p + j].clone().multiplyScalar(nders[k][j]));
    }
    CK[k] = point;
  }
  for (let k = du + 1; k <= nd + 1; ++k) {
    CK[k] = new Vector4(0, 0, 0);
  }
  return CK;
}
function calcKoverI(k, i) {
  let nom = 1;
  for (let j = 2; j <= k; ++j) {
    nom *= j;
  }
  let denom = 1;
  for (let j = 2; j <= i; ++j) {
    denom *= j;
  }
  for (let j = 2; j <= k - i; ++j) {
    denom *= j;
  }
  return nom / denom;
}
function calcRationalCurveDerivatives(Pders) {
  const nd = Pders.length;
  const Aders = [];
  const wders = [];
  for (let i = 0; i < nd; ++i) {
    const point = Pders[i];
    Aders[i] = new Vector3(point.x, point.y, point.z);
    wders[i] = point.w;
  }
  const CK = [];
  for (let k = 0; k < nd; ++k) {
    const v = Aders[k].clone();
    for (let i = 1; i <= k; ++i) {
      v.sub(CK[k - i].clone().multiplyScalar(calcKoverI(k, i) * wders[i]));
    }
    CK[k] = v.divideScalar(wders[0]);
  }
  return CK;
}
function calcNURBSDerivatives(p, U, P, u, nd) {
  const Pders = calcBSplineDerivatives(p, U, P, u, nd);
  return calcRationalCurveDerivatives(Pders);
}

// ../../../../packages/harness-docket/node_modules/three/examples/jsm/curves/NURBSCurve.js
var NURBSCurve = class extends Curve {
  constructor(degree, knots, controlPoints, startKnot, endKnot) {
    super();
    this.degree = degree;
    this.knots = knots;
    this.controlPoints = [];
    this.startKnot = startKnot || 0;
    this.endKnot = endKnot || this.knots.length - 1;
    for (let i = 0; i < controlPoints.length; ++i) {
      const point = controlPoints[i];
      this.controlPoints[i] = new Vector4(point.x, point.y, point.z, point.w);
    }
  }
  getPoint(t, optionalTarget = new Vector3()) {
    const point = optionalTarget;
    const u = this.knots[this.startKnot] + t * (this.knots[this.endKnot] - this.knots[this.startKnot]);
    const hpoint = calcBSplinePoint(this.degree, this.knots, this.controlPoints, u);
    if (hpoint.w !== 1) {
      hpoint.divideScalar(hpoint.w);
    }
    return point.set(hpoint.x, hpoint.y, hpoint.z);
  }
  getTangent(t, optionalTarget = new Vector3()) {
    const tangent = optionalTarget;
    const u = this.knots[0] + t * (this.knots[this.knots.length - 1] - this.knots[0]);
    const ders = calcNURBSDerivatives(this.degree, this.knots, this.controlPoints, u, 1);
    tangent.copy(ders[1]).normalize();
    return tangent;
  }
};

// ../../../../packages/harness-docket/node_modules/three/examples/jsm/loaders/FBXLoader.js
var fbxTree;
var connections;
var sceneGraph;
var FBXLoader = class extends Loader {
  constructor(manager) {
    super(manager);
  }
  load(url, onLoad, onProgress, onError) {
    const scope = this;
    const path = scope.path === "" ? LoaderUtils.extractUrlBase(url) : scope.path;
    const loader = new FileLoader(this.manager);
    loader.setPath(scope.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(scope.requestHeader);
    loader.setWithCredentials(scope.withCredentials);
    loader.load(url, function(buffer) {
      try {
        onLoad(scope.parse(buffer, path));
      } catch (e) {
        if (onError) {
          onError(e);
        } else {
          console.error(e);
        }
        scope.manager.itemError(url);
      }
    }, onProgress, onError);
  }
  parse(FBXBuffer, path) {
    if (isFbxFormatBinary(FBXBuffer)) {
      fbxTree = new BinaryParser().parse(FBXBuffer);
    } else {
      const FBXText = convertArrayBufferToString(FBXBuffer);
      if (!isFbxFormatASCII(FBXText)) {
        throw new Error("THREE.FBXLoader: Unknown format.");
      }
      if (getFbxVersion(FBXText) < 7e3) {
        throw new Error("THREE.FBXLoader: FBX version not supported, FileVersion: " + getFbxVersion(FBXText));
      }
      fbxTree = new TextParser().parse(FBXText);
    }
    const textureLoader = new TextureLoader(this.manager).setPath(this.resourcePath || path).setCrossOrigin(this.crossOrigin);
    return new FBXTreeParser(textureLoader, this.manager).parse(fbxTree);
  }
};
var FBXTreeParser = class {
  constructor(textureLoader, manager) {
    this.textureLoader = textureLoader;
    this.manager = manager;
  }
  parse() {
    connections = this.parseConnections();
    const images = this.parseImages();
    const textures = this.parseTextures(images);
    const materials = this.parseMaterials(textures);
    const deformers = this.parseDeformers();
    const geometryMap = new GeometryParser().parse(deformers);
    this.parseScene(deformers, geometryMap, materials);
    return sceneGraph;
  }
  // Parses FBXTree.Connections which holds parent-child connections between objects (e.g. material -> texture, model->geometry )
  // and details the connection type
  parseConnections() {
    const connectionMap = /* @__PURE__ */ new Map();
    if ("Connections" in fbxTree) {
      const rawConnections = fbxTree.Connections.connections;
      rawConnections.forEach(function(rawConnection) {
        const fromID = rawConnection[0];
        const toID = rawConnection[1];
        const relationship = rawConnection[2];
        if (!connectionMap.has(fromID)) {
          connectionMap.set(fromID, {
            parents: [],
            children: []
          });
        }
        const parentRelationship = { ID: toID, relationship };
        connectionMap.get(fromID).parents.push(parentRelationship);
        if (!connectionMap.has(toID)) {
          connectionMap.set(toID, {
            parents: [],
            children: []
          });
        }
        const childRelationship = { ID: fromID, relationship };
        connectionMap.get(toID).children.push(childRelationship);
      });
    }
    return connectionMap;
  }
  // Parse FBXTree.Objects.Video for embedded image data
  // These images are connected to textures in FBXTree.Objects.Textures
  // via FBXTree.Connections.
  parseImages() {
    const images = {};
    const blobs = {};
    if ("Video" in fbxTree.Objects) {
      const videoNodes = fbxTree.Objects.Video;
      for (const nodeID in videoNodes) {
        const videoNode = videoNodes[nodeID];
        const id = parseInt(nodeID);
        images[id] = videoNode.RelativeFilename || videoNode.Filename;
        if ("Content" in videoNode) {
          const arrayBufferContent = videoNode.Content instanceof ArrayBuffer && videoNode.Content.byteLength > 0;
          const base64Content = typeof videoNode.Content === "string" && videoNode.Content !== "";
          if (arrayBufferContent || base64Content) {
            const image = this.parseImage(videoNodes[nodeID]);
            blobs[videoNode.RelativeFilename || videoNode.Filename] = image;
          }
        }
      }
    }
    for (const id in images) {
      const filename = images[id];
      if (blobs[filename] !== void 0) images[id] = blobs[filename];
      else images[id] = images[id].split("\\").pop();
    }
    return images;
  }
  // Parse embedded image data in FBXTree.Video.Content
  parseImage(videoNode) {
    const content = videoNode.Content;
    const fileName = videoNode.RelativeFilename || videoNode.Filename;
    const extension = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
    let type;
    switch (extension) {
      case "bmp":
        type = "image/bmp";
        break;
      case "jpg":
      case "jpeg":
        type = "image/jpeg";
        break;
      case "png":
        type = "image/png";
        break;
      case "tif":
        type = "image/tiff";
        break;
      case "tga":
        if (this.manager.getHandler(".tga") === null) {
          console.warn("FBXLoader: TGA loader not found, skipping ", fileName);
        }
        type = "image/tga";
        break;
      default:
        console.warn('FBXLoader: Image type "' + extension + '" is not supported.');
        return;
    }
    if (typeof content === "string") {
      return "data:" + type + ";base64," + content;
    } else {
      const array = new Uint8Array(content);
      return window.URL.createObjectURL(new Blob([array], { type }));
    }
  }
  // Parse nodes in FBXTree.Objects.Texture
  // These contain details such as UV scaling, cropping, rotation etc and are connected
  // to images in FBXTree.Objects.Video
  parseTextures(images) {
    const textureMap = /* @__PURE__ */ new Map();
    if ("Texture" in fbxTree.Objects) {
      const textureNodes = fbxTree.Objects.Texture;
      for (const nodeID in textureNodes) {
        const texture = this.parseTexture(textureNodes[nodeID], images);
        textureMap.set(parseInt(nodeID), texture);
      }
    }
    return textureMap;
  }
  // Parse individual node in FBXTree.Objects.Texture
  parseTexture(textureNode, images) {
    const texture = this.loadTexture(textureNode, images);
    texture.ID = textureNode.id;
    texture.name = textureNode.attrName;
    const wrapModeU = textureNode.WrapModeU;
    const wrapModeV = textureNode.WrapModeV;
    const valueU = wrapModeU !== void 0 ? wrapModeU.value : 0;
    const valueV = wrapModeV !== void 0 ? wrapModeV.value : 0;
    texture.wrapS = valueU === 0 ? RepeatWrapping : ClampToEdgeWrapping;
    texture.wrapT = valueV === 0 ? RepeatWrapping : ClampToEdgeWrapping;
    if ("Scaling" in textureNode) {
      const values = textureNode.Scaling.value;
      texture.repeat.x = values[0];
      texture.repeat.y = values[1];
    }
    if ("Translation" in textureNode) {
      const values = textureNode.Translation.value;
      texture.offset.x = values[0];
      texture.offset.y = values[1];
    }
    return texture;
  }
  // load a texture specified as a blob or data URI, or via an external URL using TextureLoader
  loadTexture(textureNode, images) {
    let fileName;
    const currentPath = this.textureLoader.path;
    const children = connections.get(textureNode.id).children;
    if (children !== void 0 && children.length > 0 && images[children[0].ID] !== void 0) {
      fileName = images[children[0].ID];
      if (fileName.indexOf("blob:") === 0 || fileName.indexOf("data:") === 0) {
        this.textureLoader.setPath(void 0);
      }
    }
    let texture;
    const extension = textureNode.FileName.slice(-3).toLowerCase();
    if (extension === "tga") {
      const loader = this.manager.getHandler(".tga");
      if (loader === null) {
        console.warn("FBXLoader: TGA loader not found, creating placeholder texture for", textureNode.RelativeFilename);
        texture = new Texture();
      } else {
        loader.setPath(this.textureLoader.path);
        texture = loader.load(fileName);
      }
    } else if (extension === "dds") {
      const loader = this.manager.getHandler(".dds");
      if (loader === null) {
        console.warn("FBXLoader: DDS loader not found, creating placeholder texture for", textureNode.RelativeFilename);
        texture = new Texture();
      } else {
        loader.setPath(this.textureLoader.path);
        texture = loader.load(fileName);
      }
    } else if (extension === "psd") {
      console.warn("FBXLoader: PSD textures are not supported, creating placeholder texture for", textureNode.RelativeFilename);
      texture = new Texture();
    } else {
      texture = this.textureLoader.load(fileName);
    }
    this.textureLoader.setPath(currentPath);
    return texture;
  }
  // Parse nodes in FBXTree.Objects.Material
  parseMaterials(textureMap) {
    const materialMap = /* @__PURE__ */ new Map();
    if ("Material" in fbxTree.Objects) {
      const materialNodes = fbxTree.Objects.Material;
      for (const nodeID in materialNodes) {
        const material = this.parseMaterial(materialNodes[nodeID], textureMap);
        if (material !== null) materialMap.set(parseInt(nodeID), material);
      }
    }
    return materialMap;
  }
  // Parse single node in FBXTree.Objects.Material
  // Materials are connected to texture maps in FBXTree.Objects.Textures
  // FBX format currently only supports Lambert and Phong shading models
  parseMaterial(materialNode, textureMap) {
    const ID = materialNode.id;
    const name = materialNode.attrName;
    let type = materialNode.ShadingModel;
    if (typeof type === "object") {
      type = type.value;
    }
    if (!connections.has(ID)) return null;
    const parameters = this.parseParameters(materialNode, textureMap, ID);
    let material;
    switch (type.toLowerCase()) {
      case "phong":
        material = new MeshPhongMaterial();
        break;
      case "lambert":
        material = new MeshLambertMaterial();
        break;
      default:
        console.warn('THREE.FBXLoader: unknown material type "%s". Defaulting to MeshPhongMaterial.', type);
        material = new MeshPhongMaterial();
        break;
    }
    material.setValues(parameters);
    material.name = name;
    return material;
  }
  // Parse FBX material and return parameters suitable for a three.js material
  // Also parse the texture map and return any textures associated with the material
  parseParameters(materialNode, textureMap, ID) {
    const parameters = {};
    if (materialNode.BumpFactor) {
      parameters.bumpScale = materialNode.BumpFactor.value;
    }
    if (materialNode.Diffuse) {
      parameters.color = new Color().fromArray(materialNode.Diffuse.value).convertSRGBToLinear();
    } else if (materialNode.DiffuseColor && (materialNode.DiffuseColor.type === "Color" || materialNode.DiffuseColor.type === "ColorRGB")) {
      parameters.color = new Color().fromArray(materialNode.DiffuseColor.value).convertSRGBToLinear();
    }
    if (materialNode.DisplacementFactor) {
      parameters.displacementScale = materialNode.DisplacementFactor.value;
    }
    if (materialNode.Emissive) {
      parameters.emissive = new Color().fromArray(materialNode.Emissive.value).convertSRGBToLinear();
    } else if (materialNode.EmissiveColor && (materialNode.EmissiveColor.type === "Color" || materialNode.EmissiveColor.type === "ColorRGB")) {
      parameters.emissive = new Color().fromArray(materialNode.EmissiveColor.value).convertSRGBToLinear();
    }
    if (materialNode.EmissiveFactor) {
      parameters.emissiveIntensity = parseFloat(materialNode.EmissiveFactor.value);
    }
    if (materialNode.Opacity) {
      parameters.opacity = parseFloat(materialNode.Opacity.value);
    }
    if (parameters.opacity < 1) {
      parameters.transparent = true;
    }
    if (materialNode.ReflectionFactor) {
      parameters.reflectivity = materialNode.ReflectionFactor.value;
    }
    if (materialNode.Shininess) {
      parameters.shininess = materialNode.Shininess.value;
    }
    if (materialNode.Specular) {
      parameters.specular = new Color().fromArray(materialNode.Specular.value).convertSRGBToLinear();
    } else if (materialNode.SpecularColor && materialNode.SpecularColor.type === "Color") {
      parameters.specular = new Color().fromArray(materialNode.SpecularColor.value).convertSRGBToLinear();
    }
    const scope = this;
    connections.get(ID).children.forEach(function(child) {
      const type = child.relationship;
      switch (type) {
        case "Bump":
          parameters.bumpMap = scope.getTexture(textureMap, child.ID);
          break;
        case "Maya|TEX_ao_map":
          parameters.aoMap = scope.getTexture(textureMap, child.ID);
          break;
        case "DiffuseColor":
        case "Maya|TEX_color_map":
          parameters.map = scope.getTexture(textureMap, child.ID);
          if (parameters.map !== void 0) {
            parameters.map.colorSpace = SRGBColorSpace;
          }
          break;
        case "DisplacementColor":
          parameters.displacementMap = scope.getTexture(textureMap, child.ID);
          break;
        case "EmissiveColor":
          parameters.emissiveMap = scope.getTexture(textureMap, child.ID);
          if (parameters.emissiveMap !== void 0) {
            parameters.emissiveMap.colorSpace = SRGBColorSpace;
          }
          break;
        case "NormalMap":
        case "Maya|TEX_normal_map":
          parameters.normalMap = scope.getTexture(textureMap, child.ID);
          break;
        case "ReflectionColor":
          parameters.envMap = scope.getTexture(textureMap, child.ID);
          if (parameters.envMap !== void 0) {
            parameters.envMap.mapping = EquirectangularReflectionMapping;
            parameters.envMap.colorSpace = SRGBColorSpace;
          }
          break;
        case "SpecularColor":
          parameters.specularMap = scope.getTexture(textureMap, child.ID);
          if (parameters.specularMap !== void 0) {
            parameters.specularMap.colorSpace = SRGBColorSpace;
          }
          break;
        case "TransparentColor":
        case "TransparencyFactor":
          parameters.alphaMap = scope.getTexture(textureMap, child.ID);
          parameters.transparent = true;
          break;
        case "AmbientColor":
        case "ShininessExponent":
        // AKA glossiness map
        case "SpecularFactor":
        // AKA specularLevel
        case "VectorDisplacementColor":
        // NOTE: Seems to be a copy of DisplacementColor
        default:
          console.warn("THREE.FBXLoader: %s map is not supported in three.js, skipping texture.", type);
          break;
      }
    });
    return parameters;
  }
  // get a texture from the textureMap for use by a material.
  getTexture(textureMap, id) {
    if ("LayeredTexture" in fbxTree.Objects && id in fbxTree.Objects.LayeredTexture) {
      console.warn("THREE.FBXLoader: layered textures are not supported in three.js. Discarding all but first layer.");
      id = connections.get(id).children[0].ID;
    }
    return textureMap.get(id);
  }
  // Parse nodes in FBXTree.Objects.Deformer
  // Deformer node can contain skinning or Vertex Cache animation data, however only skinning is supported here
  // Generates map of Skeleton-like objects for use later when generating and binding skeletons.
  parseDeformers() {
    const skeletons = {};
    const morphTargets = {};
    if ("Deformer" in fbxTree.Objects) {
      const DeformerNodes = fbxTree.Objects.Deformer;
      for (const nodeID in DeformerNodes) {
        const deformerNode = DeformerNodes[nodeID];
        const relationships = connections.get(parseInt(nodeID));
        if (deformerNode.attrType === "Skin") {
          const skeleton = this.parseSkeleton(relationships, DeformerNodes);
          skeleton.ID = nodeID;
          if (relationships.parents.length > 1) console.warn("THREE.FBXLoader: skeleton attached to more than one geometry is not supported.");
          skeleton.geometryID = relationships.parents[0].ID;
          skeletons[nodeID] = skeleton;
        } else if (deformerNode.attrType === "BlendShape") {
          const morphTarget = {
            id: nodeID
          };
          morphTarget.rawTargets = this.parseMorphTargets(relationships, DeformerNodes);
          morphTarget.id = nodeID;
          if (relationships.parents.length > 1) console.warn("THREE.FBXLoader: morph target attached to more than one geometry is not supported.");
          morphTargets[nodeID] = morphTarget;
        }
      }
    }
    return {
      skeletons,
      morphTargets
    };
  }
  // Parse single nodes in FBXTree.Objects.Deformer
  // The top level skeleton node has type 'Skin' and sub nodes have type 'Cluster'
  // Each skin node represents a skeleton and each cluster node represents a bone
  parseSkeleton(relationships, deformerNodes) {
    const rawBones = [];
    relationships.children.forEach(function(child) {
      const boneNode = deformerNodes[child.ID];
      if (boneNode.attrType !== "Cluster") return;
      const rawBone = {
        ID: child.ID,
        indices: [],
        weights: [],
        transformLink: new Matrix4().fromArray(boneNode.TransformLink.a)
        // transform: new Matrix4().fromArray( boneNode.Transform.a ),
        // linkMode: boneNode.Mode,
      };
      if ("Indexes" in boneNode) {
        rawBone.indices = boneNode.Indexes.a;
        rawBone.weights = boneNode.Weights.a;
      }
      rawBones.push(rawBone);
    });
    return {
      rawBones,
      bones: []
    };
  }
  // The top level morph deformer node has type "BlendShape" and sub nodes have type "BlendShapeChannel"
  parseMorphTargets(relationships, deformerNodes) {
    const rawMorphTargets = [];
    for (let i = 0; i < relationships.children.length; i++) {
      const child = relationships.children[i];
      const morphTargetNode = deformerNodes[child.ID];
      const rawMorphTarget = {
        name: morphTargetNode.attrName,
        initialWeight: morphTargetNode.DeformPercent,
        id: morphTargetNode.id,
        fullWeights: morphTargetNode.FullWeights.a
      };
      if (morphTargetNode.attrType !== "BlendShapeChannel") return;
      rawMorphTarget.geoID = connections.get(parseInt(child.ID)).children.filter(function(child2) {
        return child2.relationship === void 0;
      })[0].ID;
      rawMorphTargets.push(rawMorphTarget);
    }
    return rawMorphTargets;
  }
  // create the main Group() to be returned by the loader
  parseScene(deformers, geometryMap, materialMap) {
    sceneGraph = new Group();
    const modelMap = this.parseModels(deformers.skeletons, geometryMap, materialMap);
    const modelNodes = fbxTree.Objects.Model;
    const scope = this;
    modelMap.forEach(function(model) {
      const modelNode = modelNodes[model.ID];
      scope.setLookAtProperties(model, modelNode);
      const parentConnections = connections.get(model.ID).parents;
      parentConnections.forEach(function(connection) {
        const parent = modelMap.get(connection.ID);
        if (parent !== void 0) parent.add(model);
      });
      if (model.parent === null) {
        sceneGraph.add(model);
      }
    });
    this.bindSkeleton(deformers.skeletons, geometryMap, modelMap);
    this.addGlobalSceneSettings();
    sceneGraph.traverse(function(node) {
      if (node.userData.transformData) {
        if (node.parent) {
          node.userData.transformData.parentMatrix = node.parent.matrix;
          node.userData.transformData.parentMatrixWorld = node.parent.matrixWorld;
        }
        const transform = generateTransform(node.userData.transformData);
        node.applyMatrix4(transform);
        node.updateWorldMatrix();
      }
    });
    const animations = new AnimationParser().parse();
    if (sceneGraph.children.length === 1 && sceneGraph.children[0].isGroup) {
      sceneGraph.children[0].animations = animations;
      sceneGraph = sceneGraph.children[0];
    }
    sceneGraph.animations = animations;
  }
  // parse nodes in FBXTree.Objects.Model
  parseModels(skeletons, geometryMap, materialMap) {
    const modelMap = /* @__PURE__ */ new Map();
    const modelNodes = fbxTree.Objects.Model;
    for (const nodeID in modelNodes) {
      const id = parseInt(nodeID);
      const node = modelNodes[nodeID];
      const relationships = connections.get(id);
      let model = this.buildSkeleton(relationships, skeletons, id, node.attrName);
      if (!model) {
        switch (node.attrType) {
          case "Camera":
            model = this.createCamera(relationships);
            break;
          case "Light":
            model = this.createLight(relationships);
            break;
          case "Mesh":
            model = this.createMesh(relationships, geometryMap, materialMap);
            break;
          case "NurbsCurve":
            model = this.createCurve(relationships, geometryMap);
            break;
          case "LimbNode":
          case "Root":
            model = new Bone();
            break;
          case "Null":
          default:
            model = new Group();
            break;
        }
        model.name = node.attrName ? PropertyBinding.sanitizeNodeName(node.attrName) : "";
        model.userData.originalName = node.attrName;
        model.ID = id;
      }
      this.getTransformData(model, node);
      modelMap.set(id, model);
    }
    return modelMap;
  }
  buildSkeleton(relationships, skeletons, id, name) {
    let bone = null;
    relationships.parents.forEach(function(parent) {
      for (const ID in skeletons) {
        const skeleton = skeletons[ID];
        skeleton.rawBones.forEach(function(rawBone, i) {
          if (rawBone.ID === parent.ID) {
            const subBone = bone;
            bone = new Bone();
            bone.matrixWorld.copy(rawBone.transformLink);
            bone.name = name ? PropertyBinding.sanitizeNodeName(name) : "";
            bone.userData.originalName = name;
            bone.ID = id;
            skeleton.bones[i] = bone;
            if (subBone !== null) {
              bone.add(subBone);
            }
          }
        });
      }
    });
    return bone;
  }
  // create a PerspectiveCamera or OrthographicCamera
  createCamera(relationships) {
    let model;
    let cameraAttribute;
    relationships.children.forEach(function(child) {
      const attr = fbxTree.Objects.NodeAttribute[child.ID];
      if (attr !== void 0) {
        cameraAttribute = attr;
      }
    });
    if (cameraAttribute === void 0) {
      model = new Object3D();
    } else {
      let type = 0;
      if (cameraAttribute.CameraProjectionType !== void 0 && cameraAttribute.CameraProjectionType.value === 1) {
        type = 1;
      }
      let nearClippingPlane = 1;
      if (cameraAttribute.NearPlane !== void 0) {
        nearClippingPlane = cameraAttribute.NearPlane.value / 1e3;
      }
      let farClippingPlane = 1e3;
      if (cameraAttribute.FarPlane !== void 0) {
        farClippingPlane = cameraAttribute.FarPlane.value / 1e3;
      }
      let width = window.innerWidth;
      let height = window.innerHeight;
      if (cameraAttribute.AspectWidth !== void 0 && cameraAttribute.AspectHeight !== void 0) {
        width = cameraAttribute.AspectWidth.value;
        height = cameraAttribute.AspectHeight.value;
      }
      const aspect = width / height;
      let fov = 45;
      if (cameraAttribute.FieldOfView !== void 0) {
        fov = cameraAttribute.FieldOfView.value;
      }
      const focalLength = cameraAttribute.FocalLength ? cameraAttribute.FocalLength.value : null;
      switch (type) {
        case 0:
          model = new PerspectiveCamera(fov, aspect, nearClippingPlane, farClippingPlane);
          if (focalLength !== null) model.setFocalLength(focalLength);
          break;
        case 1:
          model = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, nearClippingPlane, farClippingPlane);
          break;
        default:
          console.warn("THREE.FBXLoader: Unknown camera type " + type + ".");
          model = new Object3D();
          break;
      }
    }
    return model;
  }
  // Create a DirectionalLight, PointLight or SpotLight
  createLight(relationships) {
    let model;
    let lightAttribute;
    relationships.children.forEach(function(child) {
      const attr = fbxTree.Objects.NodeAttribute[child.ID];
      if (attr !== void 0) {
        lightAttribute = attr;
      }
    });
    if (lightAttribute === void 0) {
      model = new Object3D();
    } else {
      let type;
      if (lightAttribute.LightType === void 0) {
        type = 0;
      } else {
        type = lightAttribute.LightType.value;
      }
      let color = 16777215;
      if (lightAttribute.Color !== void 0) {
        color = new Color().fromArray(lightAttribute.Color.value).convertSRGBToLinear();
      }
      let intensity = lightAttribute.Intensity === void 0 ? 1 : lightAttribute.Intensity.value / 100;
      if (lightAttribute.CastLightOnObject !== void 0 && lightAttribute.CastLightOnObject.value === 0) {
        intensity = 0;
      }
      let distance = 0;
      if (lightAttribute.FarAttenuationEnd !== void 0) {
        if (lightAttribute.EnableFarAttenuation !== void 0 && lightAttribute.EnableFarAttenuation.value === 0) {
          distance = 0;
        } else {
          distance = lightAttribute.FarAttenuationEnd.value;
        }
      }
      const decay = 1;
      switch (type) {
        case 0:
          model = new PointLight(color, intensity, distance, decay);
          break;
        case 1:
          model = new DirectionalLight(color, intensity);
          break;
        case 2:
          let angle = Math.PI / 3;
          if (lightAttribute.InnerAngle !== void 0) {
            angle = MathUtils.degToRad(lightAttribute.InnerAngle.value);
          }
          let penumbra = 0;
          if (lightAttribute.OuterAngle !== void 0) {
            penumbra = MathUtils.degToRad(lightAttribute.OuterAngle.value);
            penumbra = Math.max(penumbra, 1);
          }
          model = new SpotLight(color, intensity, distance, angle, penumbra, decay);
          break;
        default:
          console.warn("THREE.FBXLoader: Unknown light type " + lightAttribute.LightType.value + ", defaulting to a PointLight.");
          model = new PointLight(color, intensity);
          break;
      }
      if (lightAttribute.CastShadows !== void 0 && lightAttribute.CastShadows.value === 1) {
        model.castShadow = true;
      }
    }
    return model;
  }
  createMesh(relationships, geometryMap, materialMap) {
    let model;
    let geometry = null;
    let material = null;
    const materials = [];
    relationships.children.forEach(function(child) {
      if (geometryMap.has(child.ID)) {
        geometry = geometryMap.get(child.ID);
      }
      if (materialMap.has(child.ID)) {
        materials.push(materialMap.get(child.ID));
      }
    });
    if (materials.length > 1) {
      material = materials;
    } else if (materials.length > 0) {
      material = materials[0];
    } else {
      material = new MeshPhongMaterial({
        name: Loader.DEFAULT_MATERIAL_NAME,
        color: 13421772
      });
      materials.push(material);
    }
    if ("color" in geometry.attributes) {
      materials.forEach(function(material2) {
        material2.vertexColors = true;
      });
    }
    if (geometry.FBX_Deformer) {
      model = new SkinnedMesh(geometry, material);
      model.normalizeSkinWeights();
    } else {
      model = new Mesh(geometry, material);
    }
    return model;
  }
  createCurve(relationships, geometryMap) {
    const geometry = relationships.children.reduce(function(geo, child) {
      if (geometryMap.has(child.ID)) geo = geometryMap.get(child.ID);
      return geo;
    }, null);
    const material = new LineBasicMaterial({
      name: Loader.DEFAULT_MATERIAL_NAME,
      color: 3342591,
      linewidth: 1
    });
    return new Line(geometry, material);
  }
  // parse the model node for transform data
  getTransformData(model, modelNode) {
    const transformData = {};
    if ("InheritType" in modelNode) transformData.inheritType = parseInt(modelNode.InheritType.value);
    if ("RotationOrder" in modelNode) transformData.eulerOrder = getEulerOrder(modelNode.RotationOrder.value);
    else transformData.eulerOrder = "ZYX";
    if ("Lcl_Translation" in modelNode) transformData.translation = modelNode.Lcl_Translation.value;
    if ("PreRotation" in modelNode) transformData.preRotation = modelNode.PreRotation.value;
    if ("Lcl_Rotation" in modelNode) transformData.rotation = modelNode.Lcl_Rotation.value;
    if ("PostRotation" in modelNode) transformData.postRotation = modelNode.PostRotation.value;
    if ("Lcl_Scaling" in modelNode) transformData.scale = modelNode.Lcl_Scaling.value;
    if ("ScalingOffset" in modelNode) transformData.scalingOffset = modelNode.ScalingOffset.value;
    if ("ScalingPivot" in modelNode) transformData.scalingPivot = modelNode.ScalingPivot.value;
    if ("RotationOffset" in modelNode) transformData.rotationOffset = modelNode.RotationOffset.value;
    if ("RotationPivot" in modelNode) transformData.rotationPivot = modelNode.RotationPivot.value;
    model.userData.transformData = transformData;
  }
  setLookAtProperties(model, modelNode) {
    if ("LookAtProperty" in modelNode) {
      const children = connections.get(model.ID).children;
      children.forEach(function(child) {
        if (child.relationship === "LookAtProperty") {
          const lookAtTarget = fbxTree.Objects.Model[child.ID];
          if ("Lcl_Translation" in lookAtTarget) {
            const pos = lookAtTarget.Lcl_Translation.value;
            if (model.target !== void 0) {
              model.target.position.fromArray(pos);
              sceneGraph.add(model.target);
            } else {
              model.lookAt(new Vector3().fromArray(pos));
            }
          }
        }
      });
    }
  }
  bindSkeleton(skeletons, geometryMap, modelMap) {
    const bindMatrices = this.parsePoseNodes();
    for (const ID in skeletons) {
      const skeleton = skeletons[ID];
      const parents = connections.get(parseInt(skeleton.ID)).parents;
      parents.forEach(function(parent) {
        if (geometryMap.has(parent.ID)) {
          const geoID = parent.ID;
          const geoRelationships = connections.get(geoID);
          geoRelationships.parents.forEach(function(geoConnParent) {
            if (modelMap.has(geoConnParent.ID)) {
              const model = modelMap.get(geoConnParent.ID);
              model.bind(new Skeleton(skeleton.bones), bindMatrices[geoConnParent.ID]);
            }
          });
        }
      });
    }
  }
  parsePoseNodes() {
    const bindMatrices = {};
    if ("Pose" in fbxTree.Objects) {
      const BindPoseNode = fbxTree.Objects.Pose;
      for (const nodeID in BindPoseNode) {
        if (BindPoseNode[nodeID].attrType === "BindPose" && BindPoseNode[nodeID].NbPoseNodes > 0) {
          const poseNodes = BindPoseNode[nodeID].PoseNode;
          if (Array.isArray(poseNodes)) {
            poseNodes.forEach(function(poseNode) {
              bindMatrices[poseNode.Node] = new Matrix4().fromArray(poseNode.Matrix.a);
            });
          } else {
            bindMatrices[poseNodes.Node] = new Matrix4().fromArray(poseNodes.Matrix.a);
          }
        }
      }
    }
    return bindMatrices;
  }
  addGlobalSceneSettings() {
    if ("GlobalSettings" in fbxTree) {
      if ("AmbientColor" in fbxTree.GlobalSettings) {
        const ambientColor = fbxTree.GlobalSettings.AmbientColor.value;
        const r = ambientColor[0];
        const g = ambientColor[1];
        const b = ambientColor[2];
        if (r !== 0 || g !== 0 || b !== 0) {
          const color = new Color(r, g, b).convertSRGBToLinear();
          sceneGraph.add(new AmbientLight(color, 1));
        }
      }
      if ("UnitScaleFactor" in fbxTree.GlobalSettings) {
        sceneGraph.userData.unitScaleFactor = fbxTree.GlobalSettings.UnitScaleFactor.value;
      }
    }
  }
};
var GeometryParser = class {
  constructor() {
    this.negativeMaterialIndices = false;
  }
  // Parse nodes in FBXTree.Objects.Geometry
  parse(deformers) {
    const geometryMap = /* @__PURE__ */ new Map();
    if ("Geometry" in fbxTree.Objects) {
      const geoNodes = fbxTree.Objects.Geometry;
      for (const nodeID in geoNodes) {
        const relationships = connections.get(parseInt(nodeID));
        const geo = this.parseGeometry(relationships, geoNodes[nodeID], deformers);
        geometryMap.set(parseInt(nodeID), geo);
      }
    }
    if (this.negativeMaterialIndices === true) {
      console.warn("THREE.FBXLoader: The FBX file contains invalid (negative) material indices. The asset might not render as expected.");
    }
    return geometryMap;
  }
  // Parse single node in FBXTree.Objects.Geometry
  parseGeometry(relationships, geoNode, deformers) {
    switch (geoNode.attrType) {
      case "Mesh":
        return this.parseMeshGeometry(relationships, geoNode, deformers);
        break;
      case "NurbsCurve":
        return this.parseNurbsGeometry(geoNode);
        break;
    }
  }
  // Parse single node mesh geometry in FBXTree.Objects.Geometry
  parseMeshGeometry(relationships, geoNode, deformers) {
    const skeletons = deformers.skeletons;
    const morphTargets = [];
    const modelNodes = relationships.parents.map(function(parent) {
      return fbxTree.Objects.Model[parent.ID];
    });
    if (modelNodes.length === 0) return;
    const skeleton = relationships.children.reduce(function(skeleton2, child) {
      if (skeletons[child.ID] !== void 0) skeleton2 = skeletons[child.ID];
      return skeleton2;
    }, null);
    relationships.children.forEach(function(child) {
      if (deformers.morphTargets[child.ID] !== void 0) {
        morphTargets.push(deformers.morphTargets[child.ID]);
      }
    });
    const modelNode = modelNodes[0];
    const transformData = {};
    if ("RotationOrder" in modelNode) transformData.eulerOrder = getEulerOrder(modelNode.RotationOrder.value);
    if ("InheritType" in modelNode) transformData.inheritType = parseInt(modelNode.InheritType.value);
    if ("GeometricTranslation" in modelNode) transformData.translation = modelNode.GeometricTranslation.value;
    if ("GeometricRotation" in modelNode) transformData.rotation = modelNode.GeometricRotation.value;
    if ("GeometricScaling" in modelNode) transformData.scale = modelNode.GeometricScaling.value;
    const transform = generateTransform(transformData);
    return this.genGeometry(geoNode, skeleton, morphTargets, transform);
  }
  // Generate a BufferGeometry from a node in FBXTree.Objects.Geometry
  genGeometry(geoNode, skeleton, morphTargets, preTransform) {
    const geo = new BufferGeometry();
    if (geoNode.attrName) geo.name = geoNode.attrName;
    const geoInfo = this.parseGeoNode(geoNode, skeleton);
    const buffers = this.genBuffers(geoInfo);
    const positionAttribute = new Float32BufferAttribute(buffers.vertex, 3);
    positionAttribute.applyMatrix4(preTransform);
    geo.setAttribute("position", positionAttribute);
    if (buffers.colors.length > 0) {
      geo.setAttribute("color", new Float32BufferAttribute(buffers.colors, 3));
    }
    if (skeleton) {
      geo.setAttribute("skinIndex", new Uint16BufferAttribute(buffers.weightsIndices, 4));
      geo.setAttribute("skinWeight", new Float32BufferAttribute(buffers.vertexWeights, 4));
      geo.FBX_Deformer = skeleton;
    }
    if (buffers.normal.length > 0) {
      const normalMatrix = new Matrix3().getNormalMatrix(preTransform);
      const normalAttribute = new Float32BufferAttribute(buffers.normal, 3);
      normalAttribute.applyNormalMatrix(normalMatrix);
      geo.setAttribute("normal", normalAttribute);
    }
    buffers.uvs.forEach(function(uvBuffer, i) {
      const name = i === 0 ? "uv" : `uv${i}`;
      geo.setAttribute(name, new Float32BufferAttribute(buffers.uvs[i], 2));
    });
    if (geoInfo.material && geoInfo.material.mappingType !== "AllSame") {
      let prevMaterialIndex = buffers.materialIndex[0];
      let startIndex = 0;
      buffers.materialIndex.forEach(function(currentIndex, i) {
        if (currentIndex !== prevMaterialIndex) {
          geo.addGroup(startIndex, i - startIndex, prevMaterialIndex);
          prevMaterialIndex = currentIndex;
          startIndex = i;
        }
      });
      if (geo.groups.length > 0) {
        const lastGroup = geo.groups[geo.groups.length - 1];
        const lastIndex = lastGroup.start + lastGroup.count;
        if (lastIndex !== buffers.materialIndex.length) {
          geo.addGroup(lastIndex, buffers.materialIndex.length - lastIndex, prevMaterialIndex);
        }
      }
      if (geo.groups.length === 0) {
        geo.addGroup(0, buffers.materialIndex.length, buffers.materialIndex[0]);
      }
    }
    this.addMorphTargets(geo, geoNode, morphTargets, preTransform);
    return geo;
  }
  parseGeoNode(geoNode, skeleton) {
    const geoInfo = {};
    geoInfo.vertexPositions = geoNode.Vertices !== void 0 ? geoNode.Vertices.a : [];
    geoInfo.vertexIndices = geoNode.PolygonVertexIndex !== void 0 ? geoNode.PolygonVertexIndex.a : [];
    if (geoNode.LayerElementColor) {
      geoInfo.color = this.parseVertexColors(geoNode.LayerElementColor[0]);
    }
    if (geoNode.LayerElementMaterial) {
      geoInfo.material = this.parseMaterialIndices(geoNode.LayerElementMaterial[0]);
    }
    if (geoNode.LayerElementNormal) {
      geoInfo.normal = this.parseNormals(geoNode.LayerElementNormal[0]);
    }
    if (geoNode.LayerElementUV) {
      geoInfo.uv = [];
      let i = 0;
      while (geoNode.LayerElementUV[i]) {
        if (geoNode.LayerElementUV[i].UV) {
          geoInfo.uv.push(this.parseUVs(geoNode.LayerElementUV[i]));
        }
        i++;
      }
    }
    geoInfo.weightTable = {};
    if (skeleton !== null) {
      geoInfo.skeleton = skeleton;
      skeleton.rawBones.forEach(function(rawBone, i) {
        rawBone.indices.forEach(function(index, j) {
          if (geoInfo.weightTable[index] === void 0) geoInfo.weightTable[index] = [];
          geoInfo.weightTable[index].push({
            id: i,
            weight: rawBone.weights[j]
          });
        });
      });
    }
    return geoInfo;
  }
  genBuffers(geoInfo) {
    const buffers = {
      vertex: [],
      normal: [],
      colors: [],
      uvs: [],
      materialIndex: [],
      vertexWeights: [],
      weightsIndices: []
    };
    let polygonIndex = 0;
    let faceLength = 0;
    let displayedWeightsWarning = false;
    let facePositionIndexes = [];
    let faceNormals = [];
    let faceColors = [];
    let faceUVs = [];
    let faceWeights = [];
    let faceWeightIndices = [];
    const scope = this;
    geoInfo.vertexIndices.forEach(function(vertexIndex, polygonVertexIndex) {
      let materialIndex;
      let endOfFace = false;
      if (vertexIndex < 0) {
        vertexIndex = vertexIndex ^ -1;
        endOfFace = true;
      }
      let weightIndices = [];
      let weights = [];
      facePositionIndexes.push(vertexIndex * 3, vertexIndex * 3 + 1, vertexIndex * 3 + 2);
      if (geoInfo.color) {
        const data = getData(polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.color);
        faceColors.push(data[0], data[1], data[2]);
      }
      if (geoInfo.skeleton) {
        if (geoInfo.weightTable[vertexIndex] !== void 0) {
          geoInfo.weightTable[vertexIndex].forEach(function(wt) {
            weights.push(wt.weight);
            weightIndices.push(wt.id);
          });
        }
        if (weights.length > 4) {
          if (!displayedWeightsWarning) {
            console.warn("THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.");
            displayedWeightsWarning = true;
          }
          const wIndex = [0, 0, 0, 0];
          const Weight = [0, 0, 0, 0];
          weights.forEach(function(weight, weightIndex) {
            let currentWeight = weight;
            let currentIndex = weightIndices[weightIndex];
            Weight.forEach(function(comparedWeight, comparedWeightIndex, comparedWeightArray) {
              if (currentWeight > comparedWeight) {
                comparedWeightArray[comparedWeightIndex] = currentWeight;
                currentWeight = comparedWeight;
                const tmp = wIndex[comparedWeightIndex];
                wIndex[comparedWeightIndex] = currentIndex;
                currentIndex = tmp;
              }
            });
          });
          weightIndices = wIndex;
          weights = Weight;
        }
        while (weights.length < 4) {
          weights.push(0);
          weightIndices.push(0);
        }
        for (let i = 0; i < 4; ++i) {
          faceWeights.push(weights[i]);
          faceWeightIndices.push(weightIndices[i]);
        }
      }
      if (geoInfo.normal) {
        const data = getData(polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.normal);
        faceNormals.push(data[0], data[1], data[2]);
      }
      if (geoInfo.material && geoInfo.material.mappingType !== "AllSame") {
        materialIndex = getData(polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.material)[0];
        if (materialIndex < 0) {
          scope.negativeMaterialIndices = true;
          materialIndex = 0;
        }
      }
      if (geoInfo.uv) {
        geoInfo.uv.forEach(function(uv, i) {
          const data = getData(polygonVertexIndex, polygonIndex, vertexIndex, uv);
          if (faceUVs[i] === void 0) {
            faceUVs[i] = [];
          }
          faceUVs[i].push(data[0]);
          faceUVs[i].push(data[1]);
        });
      }
      faceLength++;
      if (endOfFace) {
        scope.genFace(buffers, geoInfo, facePositionIndexes, materialIndex, faceNormals, faceColors, faceUVs, faceWeights, faceWeightIndices, faceLength);
        polygonIndex++;
        faceLength = 0;
        facePositionIndexes = [];
        faceNormals = [];
        faceColors = [];
        faceUVs = [];
        faceWeights = [];
        faceWeightIndices = [];
      }
    });
    return buffers;
  }
  // See https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
  getNormalNewell(vertices) {
    const normal = new Vector3(0, 0, 0);
    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }
    normal.normalize();
    return normal;
  }
  getNormalTangentAndBitangent(vertices) {
    const normalVector = this.getNormalNewell(vertices);
    const up = Math.abs(normalVector.z) > 0.5 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
    const tangent = up.cross(normalVector).normalize();
    const bitangent = normalVector.clone().cross(tangent).normalize();
    return {
      normal: normalVector,
      tangent,
      bitangent
    };
  }
  flattenVertex(vertex, normalTangent, normalBitangent) {
    return new Vector2(
      vertex.dot(normalTangent),
      vertex.dot(normalBitangent)
    );
  }
  // Generate data for a single face in a geometry. If the face is a quad then split it into 2 tris
  genFace(buffers, geoInfo, facePositionIndexes, materialIndex, faceNormals, faceColors, faceUVs, faceWeights, faceWeightIndices, faceLength) {
    let triangles;
    if (faceLength > 3) {
      const vertices = [];
      for (let i = 0; i < facePositionIndexes.length; i += 3) {
        vertices.push(new Vector3(
          geoInfo.vertexPositions[facePositionIndexes[i]],
          geoInfo.vertexPositions[facePositionIndexes[i + 1]],
          geoInfo.vertexPositions[facePositionIndexes[i + 2]]
        ));
      }
      const { tangent, bitangent } = this.getNormalTangentAndBitangent(vertices);
      const triangulationInput = [];
      for (const vertex of vertices) {
        triangulationInput.push(this.flattenVertex(vertex, tangent, bitangent));
      }
      triangles = ShapeUtils.triangulateShape(triangulationInput, []);
    } else {
      triangles = [[0, 1, 2]];
    }
    for (const [i0, i1, i2] of triangles) {
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i0 * 3]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i0 * 3 + 1]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i0 * 3 + 2]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i1 * 3]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i1 * 3 + 1]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i1 * 3 + 2]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i2 * 3]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i2 * 3 + 1]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i2 * 3 + 2]]);
      if (geoInfo.skeleton) {
        buffers.vertexWeights.push(faceWeights[i0 * 4]);
        buffers.vertexWeights.push(faceWeights[i0 * 4 + 1]);
        buffers.vertexWeights.push(faceWeights[i0 * 4 + 2]);
        buffers.vertexWeights.push(faceWeights[i0 * 4 + 3]);
        buffers.vertexWeights.push(faceWeights[i1 * 4]);
        buffers.vertexWeights.push(faceWeights[i1 * 4 + 1]);
        buffers.vertexWeights.push(faceWeights[i1 * 4 + 2]);
        buffers.vertexWeights.push(faceWeights[i1 * 4 + 3]);
        buffers.vertexWeights.push(faceWeights[i2 * 4]);
        buffers.vertexWeights.push(faceWeights[i2 * 4 + 1]);
        buffers.vertexWeights.push(faceWeights[i2 * 4 + 2]);
        buffers.vertexWeights.push(faceWeights[i2 * 4 + 3]);
        buffers.weightsIndices.push(faceWeightIndices[i0 * 4]);
        buffers.weightsIndices.push(faceWeightIndices[i0 * 4 + 1]);
        buffers.weightsIndices.push(faceWeightIndices[i0 * 4 + 2]);
        buffers.weightsIndices.push(faceWeightIndices[i0 * 4 + 3]);
        buffers.weightsIndices.push(faceWeightIndices[i1 * 4]);
        buffers.weightsIndices.push(faceWeightIndices[i1 * 4 + 1]);
        buffers.weightsIndices.push(faceWeightIndices[i1 * 4 + 2]);
        buffers.weightsIndices.push(faceWeightIndices[i1 * 4 + 3]);
        buffers.weightsIndices.push(faceWeightIndices[i2 * 4]);
        buffers.weightsIndices.push(faceWeightIndices[i2 * 4 + 1]);
        buffers.weightsIndices.push(faceWeightIndices[i2 * 4 + 2]);
        buffers.weightsIndices.push(faceWeightIndices[i2 * 4 + 3]);
      }
      if (geoInfo.color) {
        buffers.colors.push(faceColors[i0 * 3]);
        buffers.colors.push(faceColors[i0 * 3 + 1]);
        buffers.colors.push(faceColors[i0 * 3 + 2]);
        buffers.colors.push(faceColors[i1 * 3]);
        buffers.colors.push(faceColors[i1 * 3 + 1]);
        buffers.colors.push(faceColors[i1 * 3 + 2]);
        buffers.colors.push(faceColors[i2 * 3]);
        buffers.colors.push(faceColors[i2 * 3 + 1]);
        buffers.colors.push(faceColors[i2 * 3 + 2]);
      }
      if (geoInfo.material && geoInfo.material.mappingType !== "AllSame") {
        buffers.materialIndex.push(materialIndex);
        buffers.materialIndex.push(materialIndex);
        buffers.materialIndex.push(materialIndex);
      }
      if (geoInfo.normal) {
        buffers.normal.push(faceNormals[i0 * 3]);
        buffers.normal.push(faceNormals[i0 * 3 + 1]);
        buffers.normal.push(faceNormals[i0 * 3 + 2]);
        buffers.normal.push(faceNormals[i1 * 3]);
        buffers.normal.push(faceNormals[i1 * 3 + 1]);
        buffers.normal.push(faceNormals[i1 * 3 + 2]);
        buffers.normal.push(faceNormals[i2 * 3]);
        buffers.normal.push(faceNormals[i2 * 3 + 1]);
        buffers.normal.push(faceNormals[i2 * 3 + 2]);
      }
      if (geoInfo.uv) {
        geoInfo.uv.forEach(function(uv, j) {
          if (buffers.uvs[j] === void 0) buffers.uvs[j] = [];
          buffers.uvs[j].push(faceUVs[j][i0 * 2]);
          buffers.uvs[j].push(faceUVs[j][i0 * 2 + 1]);
          buffers.uvs[j].push(faceUVs[j][i1 * 2]);
          buffers.uvs[j].push(faceUVs[j][i1 * 2 + 1]);
          buffers.uvs[j].push(faceUVs[j][i2 * 2]);
          buffers.uvs[j].push(faceUVs[j][i2 * 2 + 1]);
        });
      }
    }
  }
  addMorphTargets(parentGeo, parentGeoNode, morphTargets, preTransform) {
    if (morphTargets.length === 0) return;
    parentGeo.morphTargetsRelative = true;
    parentGeo.morphAttributes.position = [];
    const scope = this;
    morphTargets.forEach(function(morphTarget) {
      morphTarget.rawTargets.forEach(function(rawTarget) {
        const morphGeoNode = fbxTree.Objects.Geometry[rawTarget.geoID];
        if (morphGeoNode !== void 0) {
          scope.genMorphGeometry(parentGeo, parentGeoNode, morphGeoNode, preTransform, rawTarget.name);
        }
      });
    });
  }
  // a morph geometry node is similar to a standard  node, and the node is also contained
  // in FBXTree.Objects.Geometry, however it can only have attributes for position, normal
  // and a special attribute Index defining which vertices of the original geometry are affected
  // Normal and position attributes only have data for the vertices that are affected by the morph
  genMorphGeometry(parentGeo, parentGeoNode, morphGeoNode, preTransform, name) {
    const vertexIndices = parentGeoNode.PolygonVertexIndex !== void 0 ? parentGeoNode.PolygonVertexIndex.a : [];
    const morphPositionsSparse = morphGeoNode.Vertices !== void 0 ? morphGeoNode.Vertices.a : [];
    const indices = morphGeoNode.Indexes !== void 0 ? morphGeoNode.Indexes.a : [];
    const length = parentGeo.attributes.position.count * 3;
    const morphPositions = new Float32Array(length);
    for (let i = 0; i < indices.length; i++) {
      const morphIndex = indices[i] * 3;
      morphPositions[morphIndex] = morphPositionsSparse[i * 3];
      morphPositions[morphIndex + 1] = morphPositionsSparse[i * 3 + 1];
      morphPositions[morphIndex + 2] = morphPositionsSparse[i * 3 + 2];
    }
    const morphGeoInfo = {
      vertexIndices,
      vertexPositions: morphPositions
    };
    const morphBuffers = this.genBuffers(morphGeoInfo);
    const positionAttribute = new Float32BufferAttribute(morphBuffers.vertex, 3);
    positionAttribute.name = name || morphGeoNode.attrName;
    positionAttribute.applyMatrix4(preTransform);
    parentGeo.morphAttributes.position.push(positionAttribute);
  }
  // Parse normal from FBXTree.Objects.Geometry.LayerElementNormal if it exists
  parseNormals(NormalNode) {
    const mappingType = NormalNode.MappingInformationType;
    const referenceType = NormalNode.ReferenceInformationType;
    const buffer = NormalNode.Normals.a;
    let indexBuffer = [];
    if (referenceType === "IndexToDirect") {
      if ("NormalIndex" in NormalNode) {
        indexBuffer = NormalNode.NormalIndex.a;
      } else if ("NormalsIndex" in NormalNode) {
        indexBuffer = NormalNode.NormalsIndex.a;
      }
    }
    return {
      dataSize: 3,
      buffer,
      indices: indexBuffer,
      mappingType,
      referenceType
    };
  }
  // Parse UVs from FBXTree.Objects.Geometry.LayerElementUV if it exists
  parseUVs(UVNode) {
    const mappingType = UVNode.MappingInformationType;
    const referenceType = UVNode.ReferenceInformationType;
    const buffer = UVNode.UV.a;
    let indexBuffer = [];
    if (referenceType === "IndexToDirect") {
      indexBuffer = UVNode.UVIndex.a;
    }
    return {
      dataSize: 2,
      buffer,
      indices: indexBuffer,
      mappingType,
      referenceType
    };
  }
  // Parse Vertex Colors from FBXTree.Objects.Geometry.LayerElementColor if it exists
  parseVertexColors(ColorNode) {
    const mappingType = ColorNode.MappingInformationType;
    const referenceType = ColorNode.ReferenceInformationType;
    const buffer = ColorNode.Colors.a;
    let indexBuffer = [];
    if (referenceType === "IndexToDirect") {
      indexBuffer = ColorNode.ColorIndex.a;
    }
    for (let i = 0, c = new Color(); i < buffer.length; i += 4) {
      c.fromArray(buffer, i).convertSRGBToLinear().toArray(buffer, i);
    }
    return {
      dataSize: 4,
      buffer,
      indices: indexBuffer,
      mappingType,
      referenceType
    };
  }
  // Parse mapping and material data in FBXTree.Objects.Geometry.LayerElementMaterial if it exists
  parseMaterialIndices(MaterialNode) {
    const mappingType = MaterialNode.MappingInformationType;
    const referenceType = MaterialNode.ReferenceInformationType;
    if (mappingType === "NoMappingInformation") {
      return {
        dataSize: 1,
        buffer: [0],
        indices: [0],
        mappingType: "AllSame",
        referenceType
      };
    }
    const materialIndexBuffer = MaterialNode.Materials.a;
    const materialIndices = [];
    for (let i = 0; i < materialIndexBuffer.length; ++i) {
      materialIndices.push(i);
    }
    return {
      dataSize: 1,
      buffer: materialIndexBuffer,
      indices: materialIndices,
      mappingType,
      referenceType
    };
  }
  // Generate a NurbGeometry from a node in FBXTree.Objects.Geometry
  parseNurbsGeometry(geoNode) {
    const order = parseInt(geoNode.Order);
    if (isNaN(order)) {
      console.error("THREE.FBXLoader: Invalid Order %s given for geometry ID: %s", geoNode.Order, geoNode.id);
      return new BufferGeometry();
    }
    const degree = order - 1;
    const knots = geoNode.KnotVector.a;
    const controlPoints = [];
    const pointsValues = geoNode.Points.a;
    for (let i = 0, l = pointsValues.length; i < l; i += 4) {
      controlPoints.push(new Vector4().fromArray(pointsValues, i));
    }
    let startKnot, endKnot;
    if (geoNode.Form === "Closed") {
      controlPoints.push(controlPoints[0]);
    } else if (geoNode.Form === "Periodic") {
      startKnot = degree;
      endKnot = knots.length - 1 - startKnot;
      for (let i = 0; i < degree; ++i) {
        controlPoints.push(controlPoints[i]);
      }
    }
    const curve = new NURBSCurve(degree, knots, controlPoints, startKnot, endKnot);
    const points = curve.getPoints(controlPoints.length * 12);
    return new BufferGeometry().setFromPoints(points);
  }
};
var AnimationParser = class {
  // take raw animation clips and turn them into three.js animation clips
  parse() {
    const animationClips = [];
    const rawClips = this.parseClips();
    if (rawClips !== void 0) {
      for (const key in rawClips) {
        const rawClip = rawClips[key];
        const clip = this.addClip(rawClip);
        animationClips.push(clip);
      }
    }
    return animationClips;
  }
  parseClips() {
    if (fbxTree.Objects.AnimationCurve === void 0) return void 0;
    const curveNodesMap = this.parseAnimationCurveNodes();
    this.parseAnimationCurves(curveNodesMap);
    const layersMap = this.parseAnimationLayers(curveNodesMap);
    const rawClips = this.parseAnimStacks(layersMap);
    return rawClips;
  }
  // parse nodes in FBXTree.Objects.AnimationCurveNode
  // each AnimationCurveNode holds data for an animation transform for a model (e.g. left arm rotation )
  // and is referenced by an AnimationLayer
  parseAnimationCurveNodes() {
    const rawCurveNodes = fbxTree.Objects.AnimationCurveNode;
    const curveNodesMap = /* @__PURE__ */ new Map();
    for (const nodeID in rawCurveNodes) {
      const rawCurveNode = rawCurveNodes[nodeID];
      if (rawCurveNode.attrName.match(/S|R|T|DeformPercent/) !== null) {
        const curveNode = {
          id: rawCurveNode.id,
          attr: rawCurveNode.attrName,
          curves: {}
        };
        curveNodesMap.set(curveNode.id, curveNode);
      }
    }
    return curveNodesMap;
  }
  // parse nodes in FBXTree.Objects.AnimationCurve and connect them up to
  // previously parsed AnimationCurveNodes. Each AnimationCurve holds data for a single animated
  // axis ( e.g. times and values of x rotation)
  parseAnimationCurves(curveNodesMap) {
    const rawCurves = fbxTree.Objects.AnimationCurve;
    for (const nodeID in rawCurves) {
      const animationCurve = {
        id: rawCurves[nodeID].id,
        times: rawCurves[nodeID].KeyTime.a.map(convertFBXTimeToSeconds),
        values: rawCurves[nodeID].KeyValueFloat.a
      };
      const relationships = connections.get(animationCurve.id);
      if (relationships !== void 0) {
        const animationCurveID = relationships.parents[0].ID;
        const animationCurveRelationship = relationships.parents[0].relationship;
        if (animationCurveRelationship.match(/X/)) {
          curveNodesMap.get(animationCurveID).curves["x"] = animationCurve;
        } else if (animationCurveRelationship.match(/Y/)) {
          curveNodesMap.get(animationCurveID).curves["y"] = animationCurve;
        } else if (animationCurveRelationship.match(/Z/)) {
          curveNodesMap.get(animationCurveID).curves["z"] = animationCurve;
        } else if (animationCurveRelationship.match(/DeformPercent/) && curveNodesMap.has(animationCurveID)) {
          curveNodesMap.get(animationCurveID).curves["morph"] = animationCurve;
        }
      }
    }
  }
  // parse nodes in FBXTree.Objects.AnimationLayer. Each layers holds references
  // to various AnimationCurveNodes and is referenced by an AnimationStack node
  // note: theoretically a stack can have multiple layers, however in practice there always seems to be one per stack
  parseAnimationLayers(curveNodesMap) {
    const rawLayers = fbxTree.Objects.AnimationLayer;
    const layersMap = /* @__PURE__ */ new Map();
    for (const nodeID in rawLayers) {
      const layerCurveNodes = [];
      const connection = connections.get(parseInt(nodeID));
      if (connection !== void 0) {
        const children = connection.children;
        children.forEach(function(child, i) {
          if (curveNodesMap.has(child.ID)) {
            const curveNode = curveNodesMap.get(child.ID);
            if (curveNode.curves.x !== void 0 || curveNode.curves.y !== void 0 || curveNode.curves.z !== void 0) {
              if (layerCurveNodes[i] === void 0) {
                const modelID = connections.get(child.ID).parents.filter(function(parent) {
                  return parent.relationship !== void 0;
                })[0].ID;
                if (modelID !== void 0) {
                  const rawModel = fbxTree.Objects.Model[modelID.toString()];
                  if (rawModel === void 0) {
                    console.warn("THREE.FBXLoader: Encountered a unused curve.", child);
                    return;
                  }
                  const node = {
                    modelName: rawModel.attrName ? PropertyBinding.sanitizeNodeName(rawModel.attrName) : "",
                    ID: rawModel.id,
                    initialPosition: [0, 0, 0],
                    initialRotation: [0, 0, 0],
                    initialScale: [1, 1, 1]
                  };
                  sceneGraph.traverse(function(child2) {
                    if (child2.ID === rawModel.id) {
                      node.transform = child2.matrix;
                      if (child2.userData.transformData) node.eulerOrder = child2.userData.transformData.eulerOrder;
                    }
                  });
                  if (!node.transform) node.transform = new Matrix4();
                  if ("PreRotation" in rawModel) node.preRotation = rawModel.PreRotation.value;
                  if ("PostRotation" in rawModel) node.postRotation = rawModel.PostRotation.value;
                  layerCurveNodes[i] = node;
                }
              }
              if (layerCurveNodes[i]) layerCurveNodes[i][curveNode.attr] = curveNode;
            } else if (curveNode.curves.morph !== void 0) {
              if (layerCurveNodes[i] === void 0) {
                const deformerID = connections.get(child.ID).parents.filter(function(parent) {
                  return parent.relationship !== void 0;
                })[0].ID;
                const morpherID = connections.get(deformerID).parents[0].ID;
                const geoID = connections.get(morpherID).parents[0].ID;
                const modelID = connections.get(geoID).parents[0].ID;
                const rawModel = fbxTree.Objects.Model[modelID];
                const node = {
                  modelName: rawModel.attrName ? PropertyBinding.sanitizeNodeName(rawModel.attrName) : "",
                  morphName: fbxTree.Objects.Deformer[deformerID].attrName
                };
                layerCurveNodes[i] = node;
              }
              layerCurveNodes[i][curveNode.attr] = curveNode;
            }
          }
        });
        layersMap.set(parseInt(nodeID), layerCurveNodes);
      }
    }
    return layersMap;
  }
  // parse nodes in FBXTree.Objects.AnimationStack. These are the top level node in the animation
  // hierarchy. Each Stack node will be used to create a AnimationClip
  parseAnimStacks(layersMap) {
    const rawStacks = fbxTree.Objects.AnimationStack;
    const rawClips = {};
    for (const nodeID in rawStacks) {
      const children = connections.get(parseInt(nodeID)).children;
      if (children.length > 1) {
        console.warn("THREE.FBXLoader: Encountered an animation stack with multiple layers, this is currently not supported. Ignoring subsequent layers.");
      }
      const layer = layersMap.get(children[0].ID);
      rawClips[nodeID] = {
        name: rawStacks[nodeID].attrName,
        layer
      };
    }
    return rawClips;
  }
  addClip(rawClip) {
    let tracks = [];
    const scope = this;
    rawClip.layer.forEach(function(rawTracks) {
      tracks = tracks.concat(scope.generateTracks(rawTracks));
    });
    return new AnimationClip(rawClip.name, -1, tracks);
  }
  generateTracks(rawTracks) {
    const tracks = [];
    let initialPosition = new Vector3();
    let initialScale = new Vector3();
    if (rawTracks.transform) rawTracks.transform.decompose(initialPosition, new Quaternion(), initialScale);
    initialPosition = initialPosition.toArray();
    initialScale = initialScale.toArray();
    if (rawTracks.T !== void 0 && Object.keys(rawTracks.T.curves).length > 0) {
      const positionTrack = this.generateVectorTrack(rawTracks.modelName, rawTracks.T.curves, initialPosition, "position");
      if (positionTrack !== void 0) tracks.push(positionTrack);
    }
    if (rawTracks.R !== void 0 && Object.keys(rawTracks.R.curves).length > 0) {
      const rotationTrack = this.generateRotationTrack(rawTracks.modelName, rawTracks.R.curves, rawTracks.preRotation, rawTracks.postRotation, rawTracks.eulerOrder);
      if (rotationTrack !== void 0) tracks.push(rotationTrack);
    }
    if (rawTracks.S !== void 0 && Object.keys(rawTracks.S.curves).length > 0) {
      const scaleTrack = this.generateVectorTrack(rawTracks.modelName, rawTracks.S.curves, initialScale, "scale");
      if (scaleTrack !== void 0) tracks.push(scaleTrack);
    }
    if (rawTracks.DeformPercent !== void 0) {
      const morphTrack = this.generateMorphTrack(rawTracks);
      if (morphTrack !== void 0) tracks.push(morphTrack);
    }
    return tracks;
  }
  generateVectorTrack(modelName, curves, initialValue, type) {
    const times = this.getTimesForAllAxes(curves);
    const values = this.getKeyframeTrackValues(times, curves, initialValue);
    return new VectorKeyframeTrack(modelName + "." + type, times, values);
  }
  generateRotationTrack(modelName, curves, preRotation, postRotation, eulerOrder) {
    let times;
    let values;
    if (curves.x !== void 0 && curves.y !== void 0 && curves.z !== void 0) {
      const result = this.interpolateRotations(curves.x, curves.y, curves.z, eulerOrder);
      times = result[0];
      values = result[1];
    }
    if (preRotation !== void 0) {
      preRotation = preRotation.map(MathUtils.degToRad);
      preRotation.push(eulerOrder);
      preRotation = new Euler().fromArray(preRotation);
      preRotation = new Quaternion().setFromEuler(preRotation);
    }
    if (postRotation !== void 0) {
      postRotation = postRotation.map(MathUtils.degToRad);
      postRotation.push(eulerOrder);
      postRotation = new Euler().fromArray(postRotation);
      postRotation = new Quaternion().setFromEuler(postRotation).invert();
    }
    const quaternion = new Quaternion();
    const euler = new Euler();
    const quaternionValues = [];
    if (!values || !times) return new QuaternionKeyframeTrack(modelName + ".quaternion", [0], [0]);
    for (let i = 0; i < values.length; i += 3) {
      euler.set(values[i], values[i + 1], values[i + 2], eulerOrder);
      quaternion.setFromEuler(euler);
      if (preRotation !== void 0) quaternion.premultiply(preRotation);
      if (postRotation !== void 0) quaternion.multiply(postRotation);
      if (i > 2) {
        const prevQuat = new Quaternion().fromArray(
          quaternionValues,
          (i - 3) / 3 * 4
        );
        if (prevQuat.dot(quaternion) < 0) {
          quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
        }
      }
      quaternion.toArray(quaternionValues, i / 3 * 4);
    }
    return new QuaternionKeyframeTrack(modelName + ".quaternion", times, quaternionValues);
  }
  generateMorphTrack(rawTracks) {
    const curves = rawTracks.DeformPercent.curves.morph;
    const values = curves.values.map(function(val) {
      return val / 100;
    });
    const morphNum = sceneGraph.getObjectByName(rawTracks.modelName).morphTargetDictionary[rawTracks.morphName];
    return new NumberKeyframeTrack(rawTracks.modelName + ".morphTargetInfluences[" + morphNum + "]", curves.times, values);
  }
  // For all animated objects, times are defined separately for each axis
  // Here we'll combine the times into one sorted array without duplicates
  getTimesForAllAxes(curves) {
    let times = [];
    if (curves.x !== void 0) times = times.concat(curves.x.times);
    if (curves.y !== void 0) times = times.concat(curves.y.times);
    if (curves.z !== void 0) times = times.concat(curves.z.times);
    times = times.sort(function(a, b) {
      return a - b;
    });
    if (times.length > 1) {
      let targetIndex = 1;
      let lastValue = times[0];
      for (let i = 1; i < times.length; i++) {
        const currentValue = times[i];
        if (currentValue !== lastValue) {
          times[targetIndex] = currentValue;
          lastValue = currentValue;
          targetIndex++;
        }
      }
      times = times.slice(0, targetIndex);
    }
    return times;
  }
  getKeyframeTrackValues(times, curves, initialValue) {
    const prevValue = initialValue;
    const values = [];
    let xIndex = -1;
    let yIndex = -1;
    let zIndex = -1;
    times.forEach(function(time) {
      if (curves.x) xIndex = curves.x.times.indexOf(time);
      if (curves.y) yIndex = curves.y.times.indexOf(time);
      if (curves.z) zIndex = curves.z.times.indexOf(time);
      if (xIndex !== -1) {
        const xValue = curves.x.values[xIndex];
        values.push(xValue);
        prevValue[0] = xValue;
      } else {
        values.push(prevValue[0]);
      }
      if (yIndex !== -1) {
        const yValue = curves.y.values[yIndex];
        values.push(yValue);
        prevValue[1] = yValue;
      } else {
        values.push(prevValue[1]);
      }
      if (zIndex !== -1) {
        const zValue = curves.z.values[zIndex];
        values.push(zValue);
        prevValue[2] = zValue;
      } else {
        values.push(prevValue[2]);
      }
    });
    return values;
  }
  // Rotations are defined as Euler angles which can have values  of any size
  // These will be converted to quaternions which don't support values greater than
  // PI, so we'll interpolate large rotations
  interpolateRotations(curvex, curvey, curvez, eulerOrder) {
    const times = [];
    const values = [];
    times.push(curvex.times[0]);
    values.push(MathUtils.degToRad(curvex.values[0]));
    values.push(MathUtils.degToRad(curvey.values[0]));
    values.push(MathUtils.degToRad(curvez.values[0]));
    for (let i = 1; i < curvex.values.length; i++) {
      const initialValue = [
        curvex.values[i - 1],
        curvey.values[i - 1],
        curvez.values[i - 1]
      ];
      if (isNaN(initialValue[0]) || isNaN(initialValue[1]) || isNaN(initialValue[2])) {
        continue;
      }
      const initialValueRad = initialValue.map(MathUtils.degToRad);
      const currentValue = [
        curvex.values[i],
        curvey.values[i],
        curvez.values[i]
      ];
      if (isNaN(currentValue[0]) || isNaN(currentValue[1]) || isNaN(currentValue[2])) {
        continue;
      }
      const currentValueRad = currentValue.map(MathUtils.degToRad);
      const valuesSpan = [
        currentValue[0] - initialValue[0],
        currentValue[1] - initialValue[1],
        currentValue[2] - initialValue[2]
      ];
      const absoluteSpan = [
        Math.abs(valuesSpan[0]),
        Math.abs(valuesSpan[1]),
        Math.abs(valuesSpan[2])
      ];
      if (absoluteSpan[0] >= 180 || absoluteSpan[1] >= 180 || absoluteSpan[2] >= 180) {
        const maxAbsSpan = Math.max(...absoluteSpan);
        const numSubIntervals = maxAbsSpan / 180;
        const E1 = new Euler(...initialValueRad, eulerOrder);
        const E2 = new Euler(...currentValueRad, eulerOrder);
        const Q1 = new Quaternion().setFromEuler(E1);
        const Q2 = new Quaternion().setFromEuler(E2);
        if (Q1.dot(Q2)) {
          Q2.set(-Q2.x, -Q2.y, -Q2.z, -Q2.w);
        }
        const initialTime = curvex.times[i - 1];
        const timeSpan = curvex.times[i] - initialTime;
        const Q = new Quaternion();
        const E = new Euler();
        for (let t = 0; t < 1; t += 1 / numSubIntervals) {
          Q.copy(Q1.clone().slerp(Q2.clone(), t));
          times.push(initialTime + t * timeSpan);
          E.setFromQuaternion(Q, eulerOrder);
          values.push(E.x);
          values.push(E.y);
          values.push(E.z);
        }
      } else {
        times.push(curvex.times[i]);
        values.push(MathUtils.degToRad(curvex.values[i]));
        values.push(MathUtils.degToRad(curvey.values[i]));
        values.push(MathUtils.degToRad(curvez.values[i]));
      }
    }
    return [times, values];
  }
};
var TextParser = class {
  getPrevNode() {
    return this.nodeStack[this.currentIndent - 2];
  }
  getCurrentNode() {
    return this.nodeStack[this.currentIndent - 1];
  }
  getCurrentProp() {
    return this.currentProp;
  }
  pushStack(node) {
    this.nodeStack.push(node);
    this.currentIndent += 1;
  }
  popStack() {
    this.nodeStack.pop();
    this.currentIndent -= 1;
  }
  setCurrentProp(val, name) {
    this.currentProp = val;
    this.currentPropName = name;
  }
  parse(text) {
    this.currentIndent = 0;
    this.allNodes = new FBXTree();
    this.nodeStack = [];
    this.currentProp = [];
    this.currentPropName = "";
    const scope = this;
    const split = text.split(/[\r\n]+/);
    split.forEach(function(line, i) {
      const matchComment = line.match(/^[\s\t]*;/);
      const matchEmpty = line.match(/^[\s\t]*$/);
      if (matchComment || matchEmpty) return;
      const matchBeginning = line.match("^\\t{" + scope.currentIndent + "}(\\w+):(.*){", "");
      const matchProperty = line.match("^\\t{" + scope.currentIndent + "}(\\w+):[\\s\\t\\r\\n](.*)");
      const matchEnd = line.match("^\\t{" + (scope.currentIndent - 1) + "}}");
      if (matchBeginning) {
        scope.parseNodeBegin(line, matchBeginning);
      } else if (matchProperty) {
        scope.parseNodeProperty(line, matchProperty, split[++i]);
      } else if (matchEnd) {
        scope.popStack();
      } else if (line.match(/^[^\s\t}]/)) {
        scope.parseNodePropertyContinued(line);
      }
    });
    return this.allNodes;
  }
  parseNodeBegin(line, property) {
    const nodeName = property[1].trim().replace(/^"/, "").replace(/"$/, "");
    const nodeAttrs = property[2].split(",").map(function(attr) {
      return attr.trim().replace(/^"/, "").replace(/"$/, "");
    });
    const node = { name: nodeName };
    const attrs = this.parseNodeAttr(nodeAttrs);
    const currentNode = this.getCurrentNode();
    if (this.currentIndent === 0) {
      this.allNodes.add(nodeName, node);
    } else {
      if (nodeName in currentNode) {
        if (nodeName === "PoseNode") {
          currentNode.PoseNode.push(node);
        } else if (currentNode[nodeName].id !== void 0) {
          currentNode[nodeName] = {};
          currentNode[nodeName][currentNode[nodeName].id] = currentNode[nodeName];
        }
        if (attrs.id !== "") currentNode[nodeName][attrs.id] = node;
      } else if (typeof attrs.id === "number") {
        currentNode[nodeName] = {};
        currentNode[nodeName][attrs.id] = node;
      } else if (nodeName !== "Properties70") {
        if (nodeName === "PoseNode") currentNode[nodeName] = [node];
        else currentNode[nodeName] = node;
      }
    }
    if (typeof attrs.id === "number") node.id = attrs.id;
    if (attrs.name !== "") node.attrName = attrs.name;
    if (attrs.type !== "") node.attrType = attrs.type;
    this.pushStack(node);
  }
  parseNodeAttr(attrs) {
    let id = attrs[0];
    if (attrs[0] !== "") {
      id = parseInt(attrs[0]);
      if (isNaN(id)) {
        id = attrs[0];
      }
    }
    let name = "", type = "";
    if (attrs.length > 1) {
      name = attrs[1].replace(/^(\w+)::/, "");
      type = attrs[2];
    }
    return { id, name, type };
  }
  parseNodeProperty(line, property, contentLine) {
    let propName = property[1].replace(/^"/, "").replace(/"$/, "").trim();
    let propValue = property[2].replace(/^"/, "").replace(/"$/, "").trim();
    if (propName === "Content" && propValue === ",") {
      propValue = contentLine.replace(/"/g, "").replace(/,$/, "").trim();
    }
    const currentNode = this.getCurrentNode();
    const parentName = currentNode.name;
    if (parentName === "Properties70") {
      this.parseNodeSpecialProperty(line, propName, propValue);
      return;
    }
    if (propName === "C") {
      const connProps = propValue.split(",").slice(1);
      const from = parseInt(connProps[0]);
      const to = parseInt(connProps[1]);
      let rest = propValue.split(",").slice(3);
      rest = rest.map(function(elem) {
        return elem.trim().replace(/^"/, "");
      });
      propName = "connections";
      propValue = [from, to];
      append(propValue, rest);
      if (currentNode[propName] === void 0) {
        currentNode[propName] = [];
      }
    }
    if (propName === "Node") currentNode.id = propValue;
    if (propName in currentNode && Array.isArray(currentNode[propName])) {
      currentNode[propName].push(propValue);
    } else {
      if (propName !== "a") currentNode[propName] = propValue;
      else currentNode.a = propValue;
    }
    this.setCurrentProp(currentNode, propName);
    if (propName === "a" && propValue.slice(-1) !== ",") {
      currentNode.a = parseNumberArray(propValue);
    }
  }
  parseNodePropertyContinued(line) {
    const currentNode = this.getCurrentNode();
    currentNode.a += line;
    if (line.slice(-1) !== ",") {
      currentNode.a = parseNumberArray(currentNode.a);
    }
  }
  // parse "Property70"
  parseNodeSpecialProperty(line, propName, propValue) {
    const props = propValue.split('",').map(function(prop) {
      return prop.trim().replace(/^\"/, "").replace(/\s/, "_");
    });
    const innerPropName = props[0];
    const innerPropType1 = props[1];
    const innerPropType2 = props[2];
    const innerPropFlag = props[3];
    let innerPropValue = props[4];
    switch (innerPropType1) {
      case "int":
      case "enum":
      case "bool":
      case "ULongLong":
      case "double":
      case "Number":
      case "FieldOfView":
        innerPropValue = parseFloat(innerPropValue);
        break;
      case "Color":
      case "ColorRGB":
      case "Vector3D":
      case "Lcl_Translation":
      case "Lcl_Rotation":
      case "Lcl_Scaling":
        innerPropValue = parseNumberArray(innerPropValue);
        break;
    }
    this.getPrevNode()[innerPropName] = {
      "type": innerPropType1,
      "type2": innerPropType2,
      "flag": innerPropFlag,
      "value": innerPropValue
    };
    this.setCurrentProp(this.getPrevNode(), innerPropName);
  }
};
var BinaryParser = class {
  parse(buffer) {
    const reader = new BinaryReader(buffer);
    reader.skip(23);
    const version = reader.getUint32();
    if (version < 6400) {
      throw new Error("THREE.FBXLoader: FBX version not supported, FileVersion: " + version);
    }
    const allNodes = new FBXTree();
    while (!this.endOfContent(reader)) {
      const node = this.parseNode(reader, version);
      if (node !== null) allNodes.add(node.name, node);
    }
    return allNodes;
  }
  // Check if reader has reached the end of content.
  endOfContent(reader) {
    if (reader.size() % 16 === 0) {
      return (reader.getOffset() + 160 + 16 & ~15) >= reader.size();
    } else {
      return reader.getOffset() + 160 + 16 >= reader.size();
    }
  }
  // recursively parse nodes until the end of the file is reached
  parseNode(reader, version) {
    const node = {};
    const endOffset = version >= 7500 ? reader.getUint64() : reader.getUint32();
    const numProperties = version >= 7500 ? reader.getUint64() : reader.getUint32();
    version >= 7500 ? reader.getUint64() : reader.getUint32();
    const nameLen = reader.getUint8();
    const name = reader.getString(nameLen);
    if (endOffset === 0) return null;
    const propertyList = [];
    for (let i = 0; i < numProperties; i++) {
      propertyList.push(this.parseProperty(reader));
    }
    const id = propertyList.length > 0 ? propertyList[0] : "";
    const attrName = propertyList.length > 1 ? propertyList[1] : "";
    const attrType = propertyList.length > 2 ? propertyList[2] : "";
    node.singleProperty = numProperties === 1 && reader.getOffset() === endOffset ? true : false;
    while (endOffset > reader.getOffset()) {
      const subNode = this.parseNode(reader, version);
      if (subNode !== null) this.parseSubNode(name, node, subNode);
    }
    node.propertyList = propertyList;
    if (typeof id === "number") node.id = id;
    if (attrName !== "") node.attrName = attrName;
    if (attrType !== "") node.attrType = attrType;
    if (name !== "") node.name = name;
    return node;
  }
  parseSubNode(name, node, subNode) {
    if (subNode.singleProperty === true) {
      const value = subNode.propertyList[0];
      if (Array.isArray(value)) {
        node[subNode.name] = subNode;
        subNode.a = value;
      } else {
        node[subNode.name] = value;
      }
    } else if (name === "Connections" && subNode.name === "C") {
      const array = [];
      subNode.propertyList.forEach(function(property, i) {
        if (i !== 0) array.push(property);
      });
      if (node.connections === void 0) {
        node.connections = [];
      }
      node.connections.push(array);
    } else if (subNode.name === "Properties70") {
      const keys = Object.keys(subNode);
      keys.forEach(function(key) {
        node[key] = subNode[key];
      });
    } else if (name === "Properties70" && subNode.name === "P") {
      let innerPropName = subNode.propertyList[0];
      let innerPropType1 = subNode.propertyList[1];
      const innerPropType2 = subNode.propertyList[2];
      const innerPropFlag = subNode.propertyList[3];
      let innerPropValue;
      if (innerPropName.indexOf("Lcl ") === 0) innerPropName = innerPropName.replace("Lcl ", "Lcl_");
      if (innerPropType1.indexOf("Lcl ") === 0) innerPropType1 = innerPropType1.replace("Lcl ", "Lcl_");
      if (innerPropType1 === "Color" || innerPropType1 === "ColorRGB" || innerPropType1 === "Vector" || innerPropType1 === "Vector3D" || innerPropType1.indexOf("Lcl_") === 0) {
        innerPropValue = [
          subNode.propertyList[4],
          subNode.propertyList[5],
          subNode.propertyList[6]
        ];
      } else {
        innerPropValue = subNode.propertyList[4];
      }
      node[innerPropName] = {
        "type": innerPropType1,
        "type2": innerPropType2,
        "flag": innerPropFlag,
        "value": innerPropValue
      };
    } else if (node[subNode.name] === void 0) {
      if (typeof subNode.id === "number") {
        node[subNode.name] = {};
        node[subNode.name][subNode.id] = subNode;
      } else {
        node[subNode.name] = subNode;
      }
    } else {
      if (subNode.name === "PoseNode") {
        if (!Array.isArray(node[subNode.name])) {
          node[subNode.name] = [node[subNode.name]];
        }
        node[subNode.name].push(subNode);
      } else if (node[subNode.name][subNode.id] === void 0) {
        node[subNode.name][subNode.id] = subNode;
      }
    }
  }
  parseProperty(reader) {
    const type = reader.getString(1);
    let length;
    switch (type) {
      case "C":
        return reader.getBoolean();
      case "D":
        return reader.getFloat64();
      case "F":
        return reader.getFloat32();
      case "I":
        return reader.getInt32();
      case "L":
        return reader.getInt64();
      case "R":
        length = reader.getUint32();
        return reader.getArrayBuffer(length);
      case "S":
        length = reader.getUint32();
        return reader.getString(length);
      case "Y":
        return reader.getInt16();
      case "b":
      case "c":
      case "d":
      case "f":
      case "i":
      case "l":
        const arrayLength = reader.getUint32();
        const encoding = reader.getUint32();
        const compressedLength = reader.getUint32();
        if (encoding === 0) {
          switch (type) {
            case "b":
            case "c":
              return reader.getBooleanArray(arrayLength);
            case "d":
              return reader.getFloat64Array(arrayLength);
            case "f":
              return reader.getFloat32Array(arrayLength);
            case "i":
              return reader.getInt32Array(arrayLength);
            case "l":
              return reader.getInt64Array(arrayLength);
          }
        }
        const data = unzlibSync(new Uint8Array(reader.getArrayBuffer(compressedLength)));
        const reader2 = new BinaryReader(data.buffer);
        switch (type) {
          case "b":
          case "c":
            return reader2.getBooleanArray(arrayLength);
          case "d":
            return reader2.getFloat64Array(arrayLength);
          case "f":
            return reader2.getFloat32Array(arrayLength);
          case "i":
            return reader2.getInt32Array(arrayLength);
          case "l":
            return reader2.getInt64Array(arrayLength);
        }
        break;
      // cannot happen but is required by the DeepScan
      default:
        throw new Error("THREE.FBXLoader: Unknown property type " + type);
    }
  }
};
var BinaryReader = class {
  constructor(buffer, littleEndian) {
    this.dv = new DataView(buffer);
    this.offset = 0;
    this.littleEndian = littleEndian !== void 0 ? littleEndian : true;
    this._textDecoder = new TextDecoder();
  }
  getOffset() {
    return this.offset;
  }
  size() {
    return this.dv.buffer.byteLength;
  }
  skip(length) {
    this.offset += length;
  }
  // seems like true/false representation depends on exporter.
  // true: 1 or 'Y'(=0x59), false: 0 or 'T'(=0x54)
  // then sees LSB.
  getBoolean() {
    return (this.getUint8() & 1) === 1;
  }
  getBooleanArray(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getBoolean());
    }
    return a;
  }
  getUint8() {
    const value = this.dv.getUint8(this.offset);
    this.offset += 1;
    return value;
  }
  getInt16() {
    const value = this.dv.getInt16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }
  getInt32() {
    const value = this.dv.getInt32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  getInt32Array(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getInt32());
    }
    return a;
  }
  getUint32() {
    const value = this.dv.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  // JavaScript doesn't support 64-bit integer so calculate this here
  // 1 << 32 will return 1 so using multiply operation instead here.
  // There's a possibility that this method returns wrong value if the value
  // is out of the range between Number.MAX_SAFE_INTEGER and Number.MIN_SAFE_INTEGER.
  // TODO: safely handle 64-bit integer
  getInt64() {
    let low, high;
    if (this.littleEndian) {
      low = this.getUint32();
      high = this.getUint32();
    } else {
      high = this.getUint32();
      low = this.getUint32();
    }
    if (high & 2147483648) {
      high = ~high & 4294967295;
      low = ~low & 4294967295;
      if (low === 4294967295) high = high + 1 & 4294967295;
      low = low + 1 & 4294967295;
      return -(high * 4294967296 + low);
    }
    return high * 4294967296 + low;
  }
  getInt64Array(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getInt64());
    }
    return a;
  }
  // Note: see getInt64() comment
  getUint64() {
    let low, high;
    if (this.littleEndian) {
      low = this.getUint32();
      high = this.getUint32();
    } else {
      high = this.getUint32();
      low = this.getUint32();
    }
    return high * 4294967296 + low;
  }
  getFloat32() {
    const value = this.dv.getFloat32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  getFloat32Array(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getFloat32());
    }
    return a;
  }
  getFloat64() {
    const value = this.dv.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }
  getFloat64Array(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getFloat64());
    }
    return a;
  }
  getArrayBuffer(size) {
    const value = this.dv.buffer.slice(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }
  getString(size) {
    const start = this.offset;
    let a = new Uint8Array(this.dv.buffer, start, size);
    this.skip(size);
    const nullByte = a.indexOf(0);
    if (nullByte >= 0) a = new Uint8Array(this.dv.buffer, start, nullByte);
    return this._textDecoder.decode(a);
  }
};
var FBXTree = class {
  add(key, val) {
    this[key] = val;
  }
};
function isFbxFormatBinary(buffer) {
  const CORRECT = "Kaydara FBX Binary  \0";
  return buffer.byteLength >= CORRECT.length && CORRECT === convertArrayBufferToString(buffer, 0, CORRECT.length);
}
function isFbxFormatASCII(text) {
  const CORRECT = ["K", "a", "y", "d", "a", "r", "a", "\\", "F", "B", "X", "\\", "B", "i", "n", "a", "r", "y", "\\", "\\"];
  let cursor = 0;
  function read(offset) {
    const result = text[offset - 1];
    text = text.slice(cursor + offset);
    cursor++;
    return result;
  }
  for (let i = 0; i < CORRECT.length; ++i) {
    const num = read(1);
    if (num === CORRECT[i]) {
      return false;
    }
  }
  return true;
}
function getFbxVersion(text) {
  const versionRegExp = /FBXVersion: (\d+)/;
  const match = text.match(versionRegExp);
  if (match) {
    const version = parseInt(match[1]);
    return version;
  }
  throw new Error("THREE.FBXLoader: Cannot find the version number for the file given.");
}
function convertFBXTimeToSeconds(time) {
  return time / 46186158e3;
}
var dataArray = [];
function getData(polygonVertexIndex, polygonIndex, vertexIndex, infoObject) {
  let index;
  switch (infoObject.mappingType) {
    case "ByPolygonVertex":
      index = polygonVertexIndex;
      break;
    case "ByPolygon":
      index = polygonIndex;
      break;
    case "ByVertice":
      index = vertexIndex;
      break;
    case "AllSame":
      index = infoObject.indices[0];
      break;
    default:
      console.warn("THREE.FBXLoader: unknown attribute mapping type " + infoObject.mappingType);
  }
  if (infoObject.referenceType === "IndexToDirect") index = infoObject.indices[index];
  const from = index * infoObject.dataSize;
  const to = from + infoObject.dataSize;
  return slice(dataArray, infoObject.buffer, from, to);
}
var tempEuler = new Euler();
var tempVec = new Vector3();
function generateTransform(transformData) {
  const lTranslationM = new Matrix4();
  const lPreRotationM = new Matrix4();
  const lRotationM = new Matrix4();
  const lPostRotationM = new Matrix4();
  const lScalingM = new Matrix4();
  const lScalingPivotM = new Matrix4();
  const lScalingOffsetM = new Matrix4();
  const lRotationOffsetM = new Matrix4();
  const lRotationPivotM = new Matrix4();
  const lParentGX = new Matrix4();
  const lParentLX = new Matrix4();
  const lGlobalT = new Matrix4();
  const inheritType = transformData.inheritType ? transformData.inheritType : 0;
  if (transformData.translation) lTranslationM.setPosition(tempVec.fromArray(transformData.translation));
  if (transformData.preRotation) {
    const array = transformData.preRotation.map(MathUtils.degToRad);
    array.push(transformData.eulerOrder || Euler.DEFAULT_ORDER);
    lPreRotationM.makeRotationFromEuler(tempEuler.fromArray(array));
  }
  if (transformData.rotation) {
    const array = transformData.rotation.map(MathUtils.degToRad);
    array.push(transformData.eulerOrder || Euler.DEFAULT_ORDER);
    lRotationM.makeRotationFromEuler(tempEuler.fromArray(array));
  }
  if (transformData.postRotation) {
    const array = transformData.postRotation.map(MathUtils.degToRad);
    array.push(transformData.eulerOrder || Euler.DEFAULT_ORDER);
    lPostRotationM.makeRotationFromEuler(tempEuler.fromArray(array));
    lPostRotationM.invert();
  }
  if (transformData.scale) lScalingM.scale(tempVec.fromArray(transformData.scale));
  if (transformData.scalingOffset) lScalingOffsetM.setPosition(tempVec.fromArray(transformData.scalingOffset));
  if (transformData.scalingPivot) lScalingPivotM.setPosition(tempVec.fromArray(transformData.scalingPivot));
  if (transformData.rotationOffset) lRotationOffsetM.setPosition(tempVec.fromArray(transformData.rotationOffset));
  if (transformData.rotationPivot) lRotationPivotM.setPosition(tempVec.fromArray(transformData.rotationPivot));
  if (transformData.parentMatrixWorld) {
    lParentLX.copy(transformData.parentMatrix);
    lParentGX.copy(transformData.parentMatrixWorld);
  }
  const lLRM = lPreRotationM.clone().multiply(lRotationM).multiply(lPostRotationM);
  const lParentGRM = new Matrix4();
  lParentGRM.extractRotation(lParentGX);
  const lParentTM = new Matrix4();
  lParentTM.copyPosition(lParentGX);
  const lParentGRSM = lParentTM.clone().invert().multiply(lParentGX);
  const lParentGSM = lParentGRM.clone().invert().multiply(lParentGRSM);
  const lLSM = lScalingM;
  const lGlobalRS = new Matrix4();
  if (inheritType === 0) {
    lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM).multiply(lLSM);
  } else if (inheritType === 1) {
    lGlobalRS.copy(lParentGRM).multiply(lParentGSM).multiply(lLRM).multiply(lLSM);
  } else {
    const lParentLSM = new Matrix4().scale(new Vector3().setFromMatrixScale(lParentLX));
    const lParentLSM_inv = lParentLSM.clone().invert();
    const lParentGSM_noLocal = lParentGSM.clone().multiply(lParentLSM_inv);
    lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM_noLocal).multiply(lLSM);
  }
  const lRotationPivotM_inv = lRotationPivotM.clone().invert();
  const lScalingPivotM_inv = lScalingPivotM.clone().invert();
  let lTransform = lTranslationM.clone().multiply(lRotationOffsetM).multiply(lRotationPivotM).multiply(lPreRotationM).multiply(lRotationM).multiply(lPostRotationM).multiply(lRotationPivotM_inv).multiply(lScalingOffsetM).multiply(lScalingPivotM).multiply(lScalingM).multiply(lScalingPivotM_inv);
  const lLocalTWithAllPivotAndOffsetInfo = new Matrix4().copyPosition(lTransform);
  const lGlobalTranslation = lParentGX.clone().multiply(lLocalTWithAllPivotAndOffsetInfo);
  lGlobalT.copyPosition(lGlobalTranslation);
  lTransform = lGlobalT.clone().multiply(lGlobalRS);
  lTransform.premultiply(lParentGX.invert());
  return lTransform;
}
function getEulerOrder(order) {
  order = order || 0;
  const enums = [
    "ZYX",
    // -> XYZ extrinsic
    "YZX",
    // -> XZY extrinsic
    "XZY",
    // -> YZX extrinsic
    "ZXY",
    // -> YXZ extrinsic
    "YXZ",
    // -> ZXY extrinsic
    "XYZ"
    // -> ZYX extrinsic
    //'SphericXYZ', // not possible to support
  ];
  if (order === 6) {
    console.warn("THREE.FBXLoader: unsupported Euler Order: Spherical XYZ. Animations and rotations may be incorrect.");
    return enums[0];
  }
  return enums[order];
}
function parseNumberArray(value) {
  const array = value.split(",").map(function(val) {
    return parseFloat(val);
  });
  return array;
}
function convertArrayBufferToString(buffer, from, to) {
  if (from === void 0) from = 0;
  if (to === void 0) to = buffer.byteLength;
  return new TextDecoder().decode(new Uint8Array(buffer, from, to));
}
function append(a, b) {
  for (let i = 0, j = a.length, l = b.length; i < l; i++, j++) {
    a[j] = b[i];
  }
}
function slice(a, b, from, to) {
  for (let i = from, j = 0; i < to; i++, j++) {
    a[j] = b[i];
  }
  return a;
}

// src/client/motion-core.js
var names = { Hips: "hips", Spine: "spine", Spine1: "chest", Spine2: "upperChest", Neck: "neck", Head: "head", LeftShoulder: "leftShoulder", RightShoulder: "rightShoulder", LeftArm: "leftUpperArm", RightArm: "rightUpperArm", LeftForeArm: "leftLowerArm", RightForeArm: "rightLowerArm", LeftHand: "leftHand", RightHand: "rightHand", LeftUpLeg: "leftUpperLeg", RightUpLeg: "rightUpperLeg", LeftLeg: "leftLowerLeg", RightLeg: "rightLowerLeg", LeftFoot: "leftFoot", RightFoot: "rightFoot", LeftToeBase: "leftToes", RightToeBase: "rightToes" };
for (const side of ["Left", "Right"]) for (const finger of ["Thumb", "Index", "Middle", "Ring", "Pinky"]) for (let n = 1; n <= 3; n++) names[side + "Hand" + finger + n] = side.toLowerCase() + (finger === "Pinky" ? "Little" : finger) + (finger === "Thumb" ? ["Metacarpal", "Proximal", "Distal"][n - 1] : ["Proximal", "Intermediate", "Distal"][n - 1]);
var aliases = new Map(Object.entries(names).flatMap(([name, human]) => [[name.toLowerCase(), human], [human.toLowerCase(), human]]));
var humanName = (name) => aliases.get(String(name).split(/[|:]/).pop().replace(/^mixamorig\d*[_:]?/i, "").toLowerCase());
function humanBones(root) {
  const bones = /* @__PURE__ */ new Map();
  root.traverse((node) => {
    if (!node.isBone) return;
    const human = humanName(node.name);
    if (!human) return;
    const previous = bones.get(human);
    if (previous) {
      let parent = node.parent;
      while (parent && parent !== previous) parent = parent.parent;
      if (parent && node.ID !== void 0 && node.ID === previous.ID) return;
      throw new Error("\u52A8\u4F5C\u542B\u591A\u4E2A\u4EBA\u7269\u9AA8\u67B6\uFF0C\u8BF7\u53EA\u5BFC\u51FA\u4E00\u4E2A\u4EBA\u7269");
    }
    bones.set(human, node);
  });
  return bones;
}
var legHeight = (bones) => {
  const hip = bones.get("hips")?.getWorldPosition(new Vector3());
  const feet = ["leftFoot", "rightFoot"].map((n) => bones.get(n)?.getWorldPosition(new Vector3())).filter(Boolean);
  return hip && feet.length ? Math.abs(hip.y - feet.reduce((sum, p) => sum + p.y, 0) / feet.length) : 0;
};
var required = ["hips", "leftUpperArm", "rightUpperArm", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg"];
function parseMotion(buffer) {
  const bytes = new Uint8Array(buffer);
  for (const entry of validateFbxEnvelope(buffer)) {
    let size = 0;
    const inflate = new Unzlib((chunk, final) => {
      size += chunk.length;
      if (size > entry.bytes || final && size !== entry.bytes) throw new Error("FBX \u538B\u7F29\u6570\u7EC4\u957F\u5EA6\u4E0D\u7B26\uFF0C\u5DF2\u505C\u6B62\u89E3\u6790");
    });
    for (let offset = 0; offset < entry.length; offset += 1024) inflate.push(bytes.subarray(entry.offset + offset, entry.offset + Math.min(entry.length, offset + 1024)), offset + 1024 >= entry.length);
  }
  const manager = new LoadingManager();
  manager.addHandler(/.*/, { load: () => new Texture() });
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxS8AAAAASUVORK5CYII=";
  });
  let root;
  try {
    root = new FBXLoader(manager).parse(buffer, "");
    root.updateMatrixWorld(true);
    const bones = humanBones(root);
    const missing = required.filter((name) => !bones.has(name));
    if (missing.length) throw new Error("\u65E0\u6CD5\u8BC6\u522B\u4EBA\u5F62\u9AA8\u67B6\u3002\u8BF7\u4F7F\u7528 Mixamo \u6216\u6807\u51C6\u4EBA\u5F62 FBX\uFF1B\u7F3A\u5C11\uFF1A" + missing.join("\u3001"));
    if (bones.size > 128 || root.animations.length > 128) throw new Error("\u52A8\u4F5C\u9AA8\u67B6\u6216\u7247\u6BB5\u8FC7\u591A");
    const clips = root.animations.filter((c) => Number.isFinite(c.duration) && c.duration > 0 && c.duration <= 600 && c.tracks.some((t) => t.name.endsWith(".quaternion") && humanName(t.name.slice(0, -11))));
    if (!clips.length) throw new Error("FBX \u4E2D\u6CA1\u6709\u53EF\u7528\u7684\u4EBA\u5F62\u9AA8\u9ABC\u52A8\u753B\uFF08\u652F\u6301 10 \u5206\u949F\u4EE5\u5185\u7684\u7247\u6BB5\uFF09");
    const tracks = clips.flatMap((clip) => clip.tracks);
    if (tracks.length > 8192 || tracks.reduce((n, track) => n + track.times.byteLength + track.values.byteLength, 0) > 64 * 1024 ** 2) throw new Error("\u52A8\u4F5C\u5173\u952E\u5E27\u8FC7\u591A\uFF0C\u8BF7\u7CBE\u7B80\u540E\u91CD\u8BD5");
    for (const clip of clips) for (const track of clip.tracks) if (!track.validate() || track.name.endsWith(".quaternion") && track.getValueSize() !== 4 || track.values.some((v) => !Number.isFinite(v)) || track.times.some((v) => !Number.isFinite(v) || v < 0)) throw new Error("\u52A8\u4F5C\u5305\u542B\u65E0\u6548\u5173\u952E\u5E27");
    const rests = /* @__PURE__ */ new Map();
    for (const [human, bone] of bones) rests.set(human, { inverse: bone.getWorldQuaternion(new Quaternion()).invert(), parent: bone.parent?.getWorldQuaternion(new Quaternion()) || new Quaternion() });
    const hip = bones.get("hips");
    return { clips, rests, hip: { position: hip.getWorldPosition(new Vector3()), parentMatrix: hip.parent?.matrixWorld.clone() || new Matrix4(), height: legHeight(bones) } };
  } catch (error) {
    throw new Error(error.message?.startsWith("THREE.") ? "FBX \u65E0\u6CD5\u89E3\u6790\uFF0C\u8BF7\u91CD\u65B0\u5BFC\u51FA FBX Binary \u52A8\u4F5C" : error.message || "\u65E0\u6CD5\u8BFB\u53D6 FBX \u52A8\u4F5C");
  } finally {
    root?.traverse((node) => {
      node.geometry?.dispose();
      for (const m of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
        for (const t of Object.values(m)) if (t?.isTexture) {
          if (t.image?.src?.startsWith("blob:")) URL.revokeObjectURL(t.image.src);
          t.dispose();
        }
        m.dispose();
      }
    });
  }
}

// src/resource-worker.js
try {
  const bytes = await readFileBounded(workerData.path, 50 * 1024 ** 2);
  let value;
  if (workerData.kind === "avatar") value = validateAvatar(bytes, workerData.filename);
  else {
    const data = parseMotion(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    value = { clips: data.clips.map((clip, index) => ({ index, name: clip.name, duration: clip.duration })) };
  }
  parentPort.postMessage({ value });
} catch (error) {
  parentPort.postMessage({ error: error.message, status: error.status || 422 });
}
/*! Bundled license information:

three/examples/jsm/libs/fflate.module.js:
  (*!
  fflate - fast JavaScript compression/decompression
  <https://101arrowz.github.io/fflate>
  Licensed under MIT. https://github.com/101arrowz/fflate/blob/master/LICENSE
  version 0.8.2
  *)

three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2024 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
