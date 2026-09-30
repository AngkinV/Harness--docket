import { HttpError } from './http.js'
import { createHash } from 'node:crypto'

export const MAX_MODEL_BYTES = 50 * 1024 * 1024
export class AvatarError extends HttpError {}
const requireModel = (ok, message) => { if (!ok) throw new AvatarError(422, message) }
const finite = values => Array.isArray(values) && values.every(Number.isFinite)
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
const components = { 5120: [1, 'readInt8'], 5121: [1, 'readUInt8'], 5122: [2, 'readInt16LE'], 5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'] }
const requiredBones = ['hips', 'spine', 'head', ...['left', 'right'].flatMap(side => ['UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot'].map(part => side + part))]
const boneParents = { spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck', leftEye: 'head', rightEye: 'head', jaw: 'head' }
for (const side of ['left', 'right']) {
  Object.assign(boneParents, { [side + 'Shoulder']: 'upperChest', [side + 'UpperArm']: side + 'Shoulder', [side + 'LowerArm']: side + 'UpperArm', [side + 'Hand']: side + 'LowerArm', [side + 'UpperLeg']: 'hips', [side + 'LowerLeg']: side + 'UpperLeg', [side + 'Foot']: side + 'LowerLeg', [side + 'Toes']: side + 'Foot' })
  for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
    boneParents[side + finger + 'Proximal'] = finger === 'Thumb' ? side + 'ThumbMetacarpal' : side + 'Hand'
    boneParents[side + finger + 'Intermediate'] = side + finger + 'Proximal'
    boneParents[side + finger + 'Distal'] = side + finger + 'Intermediate'
  }
  boneParents[side + 'ThumbMetacarpal'] = side + 'Hand'
}
function determinant(m) {
  const [a, b, c, d, e, f, g, h, i, j, k, l, n, o, p, q] = m
  return a * (f * (k * q - l * p) - g * (j * q - l * o) + h * (j * p - k * o)) - b * (e * (k * q - l * p) - g * (i * q - l * n) + h * (i * p - k * n)) + c * (e * (j * q - l * o) - f * (i * q - l * n) + h * (i * o - j * n)) - d * (e * (j * p - k * o) - f * (i * p - k * n) + g * (i * o - j * n))
}

// A deliberately bounded, self-contained subset of glTF. Unsupported compressed
// or sparse data is rejected instead of skipping the skin validation.
export function validateAvatar(bytes, filename = 'model.glb') {
  requireModel(Buffer.isBuffer(bytes) && bytes.length >= 20 && bytes.length <= MAX_MODEL_BYTES, '模型为空、已损坏或超过 50 MB')
  requireModel(bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, '需要完整的 GLB 2.0 或 VRM 文件')
  let json, binary = Buffer.alloc(0), seenBinary = false
  for (let offset = 12; offset < bytes.length;) {
    requireModel(offset + 8 <= bytes.length, '模型数据块不完整')
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4)
    requireModel(length % 4 === 0 && offset + 8 + length <= bytes.length, '模型数据块长度无效')
    const chunk = bytes.subarray(offset + 8, offset + 8 + length)
    if (offset === 12) {
      requireModel(type === 0x4e4f534a && length <= 8 * 1024 * 1024, '模型 JSON 数据无效或过大')
      try { json = JSON.parse(chunk.toString('utf8')) } catch { throw new AvatarError(422, '模型 JSON 已损坏') }
    } else {
      requireModel(type === 0x004e4942 && !seenBinary, '不支持此模型数据块')
      binary = chunk; seenBinary = true
    }
    offset += 8 + length
  }
  requireModel(json?.asset?.version === '2.0', '仅支持 glTF 2.0')
  const { nodes = [], skins = [], meshes = [], accessors = [], bufferViews = [], buffers = [], images = [], animations = [] } = json
  for (const array of [nodes, skins, meshes, accessors, bufferViews, buffers, images, animations]) requireModel(Array.isArray(array), '模型数组结构无效')
  requireModel(nodes.length <= 2048 && skins.length <= 128 && meshes.length <= 256 && accessors.length <= 8192 && images.length <= 128 && animations.length <= 128, '模型过于复杂，请精简骨骼、网格或纹理')
  requireModel(buffers.length <= 1 && buffers.every(b => !b.uri && Number.isInteger(b.byteLength) && b.byteLength >= 0 && b.byteLength <= binary.length && binary.length - b.byteLength <= 3), '请将所有模型数据嵌入单个文件')
  const allowedExtensions = new Set(['VRM', 'VRMC_vrm', 'VRMC_springBone', 'VRMC_node_constraint', 'VRMC_materials_mtoon', 'VRMC_materials_hdr_emissiveMultiplier', 'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_materials_emissive_strength', 'KHR_materials_specular', 'KHR_materials_ior', 'KHR_materials_clearcoat', 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_sheen', 'KHR_materials_iridescence', 'KHR_materials_anisotropy'])
  for (const ext of json.extensionsUsed ?? []) requireModel(allowedExtensions.has(ext), '暂不支持模型扩展：' + ext + '；请导出未压缩、内嵌纹理的模型')
  const ref = (array, index, label) => { requireModel(Number.isInteger(index) && index >= 0 && index < array.length, label + '引用越界'); return array[index] }
  for (const view of bufferViews) {
    requireModel(view.buffer === 0 && buffers.length === 1 && Number.isInteger(view.byteLength) && view.byteLength >= 0 && Number.isInteger(view.byteOffset ?? 0) && (view.byteOffset ?? 0) >= 0 && (view.byteOffset ?? 0) + view.byteLength <= buffers[0].byteLength, '模型缓冲区越界')
  }
  const readers = accessors.map(a => {
    const component = components[a.componentType], width = widths[a.type]
    requireModel(component && width && Number.isInteger(a.count) && a.count >= 0 && a.count <= 2000000, '顶点数据格式或数量无效')
    requireModel(!a.sparse, '暂不支持稀疏顶点数据，请导出完整顶点数据')
    const view = ref(bufferViews, a.bufferView, '顶点缓冲区'), stride = view.byteStride ?? component[0] * width, offset = a.byteOffset ?? 0
    requireModel(Number.isInteger(stride) && stride >= component[0] * width && stride <= 252 && stride % component[0] === 0 && Number.isInteger(offset) && offset >= 0 && offset % component[0] === 0, '顶点数据步长或偏移无效')
    requireModel(!a.type.startsWith('MAT') || a.componentType === 5126, '矩阵必须使用浮点格式')
    requireModel(offset + (a.count ? (a.count - 1) * stride + component[0] * width : 0) <= view.byteLength, '顶点数据长度越界')
    const start = (view.byteOffset ?? 0) + offset
    return (index, column = 0) => {
      let value = binary[component[1]](start + index * stride + column * component[0])
      if (a.normalized && a.componentType !== 5126) value = a.componentType === 5121 ? value / 255 : a.componentType === 5123 ? value / 65535 : a.componentType === 5120 ? Math.max(-1, value / 127) : Math.max(-1, value / 32767)
      return value
    }
  })
  const parent = new Map()
  nodes.forEach((node, i) => {
    for (const [key, length] of [['translation', 3], ['rotation', 4], ['scale', 3], ['matrix', 16]]) if (node[key]) requireModel(finite(node[key]) && node[key].length === length, '骨骼变换包含无效数值')
    requireModel(!node.matrix || !(node.translation || node.rotation || node.scale), '节点不能同时定义矩阵和分量变换')
    if (node.rotation) requireModel(Math.abs(node.rotation.reduce((sum, v) => sum + v * v, 0) - 1) < .03, '骨骼旋转四元数未归一')
    for (const child of node.children ?? []) {
      ref(nodes, child, '子骨骼'); requireModel(child !== i && !parent.has(child), '骨架层级循环或一个骨骼有多个父节点'); parent.set(child, i)
    }
    if (node.mesh !== undefined) ref(meshes, node.mesh, '网格')
    if (node.skin !== undefined) ref(skins, node.skin, '蒙皮')
  })
  nodes.forEach((_, i) => { const chain = new Set(); for (let n = i; n !== undefined; n = parent.get(n)) { requireModel(!chain.has(n), '骨架层级出现循环'); chain.add(n) } })
  for (const scene of json.scenes ?? []) for (const index of scene.nodes ?? []) { ref(nodes, index, '场景'); requireModel(!parent.has(index), '场景根节点不能有父节点') }
  if (json.scene !== undefined) ref(json.scenes ?? [], json.scene, '默认场景')
  for (const skin of skins) {
    requireModel(Array.isArray(skin.joints) && skin.joints.length > 0 && skin.joints.length <= 1024 && new Set(skin.joints).size === skin.joints.length, '蒙皮骨骼列表无效')
    for (const joint of skin.joints) ref(nodes, joint, '蒙皮骨骼')
    if (skin.skeleton !== undefined) ref(nodes, skin.skeleton, '骨架根节点')
    if (skin.inverseBindMatrices !== undefined) {
      const a = ref(accessors, skin.inverseBindMatrices, '绑定矩阵')
      requireModel(a.type === 'MAT4' && a.componentType === 5126 && a.count === skin.joints.length, '绑定矩阵数量与骨骼数量不一致')
      for (let i = 0; i < a.count; i++) {
        const matrix = Array.from({ length: 16 }, (_, c) => readers[skin.inverseBindMatrices](i, c))
        requireModel(matrix.every(Number.isFinite) && Math.abs(determinant(matrix)) > 1e-12, '绑定矩阵包含无效数值或不可逆')
      }
    }
  }
  let triangles = 0, vertices = 0
  meshes.forEach(mesh => {
    requireModel(Array.isArray(mesh.primitives) && mesh.primitives.length <= 256, '网格结构无效')
    for (const p of mesh.primitives) {
      const position = ref(accessors, p.attributes?.POSITION, '顶点位置'); requireModel(position.type === 'VEC3' && position.componentType === 5126, '顶点位置格式无效')
      vertices += position.count; triangles += (p.indices !== undefined ? ref(accessors, p.indices, '三角形').count : position.count) / 3
      requireModel(vertices <= 1000000 && triangles <= 500000, '模型面数过多，请降低至 50 万面以内')
      for (let i = 0; i < position.count; i++) for (let c = 0; c < 3; c++) requireModel(Number.isFinite(readers[p.attributes.POSITION](i, c)), '顶点位置包含无效数值')
      for (const id of Object.values(p.attributes)) requireModel(ref(accessors, id, '顶点属性').count === position.count, '顶点属性数量不一致')
      if (p.indices !== undefined) {
        const a = accessors[p.indices]; requireModel(a.type === 'SCALAR' && [5121, 5123, 5125].includes(a.componentType), '三角形索引格式无效')
        for (let i = 0; i < a.count; i++) requireModel(readers[p.indices](i) < position.count, '三角形顶点索引越界')
      }
      for (const target of p.targets ?? []) for (const id of Object.values(target)) requireModel(ref(accessors, id, '表情顶点').count === position.count, '表情顶点数量不一致')
    }
  })
  for (const node of nodes.filter(n => n.skin !== undefined)) {
    requireModel(node.mesh !== undefined, '蒙皮缺少关联网格')
    for (const p of meshes[node.mesh].primitives) {
      const sets = Object.keys(p.attributes).filter(k => /^JOINTS_\d+$/.test(k))
      requireModel(sets.includes('JOINTS_0') && sets.length <= 2, '蒙皮缺少关节索引或影响骨骼过多')
      for (const key of Object.keys(p.attributes).filter(k => /^WEIGHTS_/.test(k))) requireModel(sets.includes(key.replace('WEIGHTS_', 'JOINTS_')), '蒙皮权重缺少对应骨骼')
      const count = accessors[p.attributes.POSITION].count
      const pairs = sets.map(key => {
        const j = p.attributes[key], w = p.attributes[key.replace('JOINTS_', 'WEIGHTS_')]
        const ja = ref(accessors, j, '蒙皮关节'), wa = ref(accessors, w, '蒙皮权重')
        requireModel(ja.type === 'VEC4' && [5121, 5123].includes(ja.componentType) && !ja.normalized && wa.type === 'VEC4' && (wa.componentType === 5126 || [5121, 5123].includes(wa.componentType) && wa.normalized), '蒙皮关节或权重格式无效')
        return [readers[j], readers[w]]
      })
      for (let i = 0; i < count; i++) {
        let total = 0
        for (const [joint, weight] of pairs) for (let c = 0; c < 4; c++) {
          requireModel(joint(i, c) < skins[node.skin].joints.length, '顶点关节索引越界')
          const value = weight(i, c); requireModel(Number.isFinite(value) && value >= 0 && value <= 1.001, '蒙皮权重无效'); total += value
        }
        requireModel(Math.abs(total - 1) <= .03, '蒙皮权重未归一，请修复后重新导出')
      }
    }
  }
  const vrm1 = json.extensions?.VRMC_vrm, vrm0 = json.extensions?.VRM
  requireModel(!(vrm1 && vrm0), '不能同时包含两个版本的 VRM 人形定义')
  requireModel(!filename.toLowerCase().endsWith('.vrm') || vrm1 || vrm0, '文件没有 VRM 人形信息')
  let bones = {}, format = 'GLB', meta = {}
  if (vrm1 || vrm0) {
    const vrm = vrm1 ?? vrm0
    requireModel(vrm1 ? vrm.specVersion === '1.0' : ['0.0', '0'].includes(vrm.specVersion), '暂不支持此 VRM 版本')
    format = vrm1 ? 'VRM 1.0' : 'VRM 0.x'; meta = vrm.meta ?? {}
    const map = vrm.humanoid?.humanBones
    requireModel(map && (vrm1 ? !Array.isArray(map) : Array.isArray(map)), 'VRM 人形映射无效')
    const entries = vrm1 ? Object.entries(map).map(([name, item]) => [name, item.node]) : map.map(item => [item.bone, item.node])
    requireModel(new Set(entries.map(([name]) => name)).size === entries.length && new Set(entries.map(([, node]) => node)).size === entries.length, 'VRM 人形骨骼存在重复映射')
    bones = Object.fromEntries(entries)
    for (const bone of requiredBones) requireModel(bones[bone] !== undefined, '缺少必需人形骨骼：' + bone)
    for (const [bone, index] of entries) {
      ref(nodes, index, '人形骨骼 ' + bone)
      let ancestor = boneParents[bone]
      while (ancestor && bones[ancestor] === undefined) ancestor = boneParents[ancestor]
      if (ancestor) {
        let n = parent.get(index)
        while (n !== undefined && n !== bones[ancestor]) n = parent.get(n)
        requireModel(n === bones[ancestor], '人形骨骼祖先关系错误：' + bone + ' → ' + ancestor)
      }
    }
    requireModel(skins.length > 0, 'VRM 缺少蒙皮骨架')
  }
  for (const animation of animations) {
    for (const sampler of animation.samplers ?? []) {
      const input = ref(accessors, sampler.input, '动画时间'), output = ref(accessors, sampler.output, '动画数据')
      requireModel(input.type === 'SCALAR' && input.componentType === 5126 && output.componentType === 5126, '动画数据格式无效')
      for (let i = 0; i < input.count; i++) requireModel(Number.isFinite(readers[sampler.input](i)) && (i === 0 ? readers[sampler.input](i) >= 0 : readers[sampler.input](i) > readers[sampler.input](i - 1)), '动画时间序列无效')
      for (let i = 0; i < output.count; i++) for (let c = 0; c < widths[output.type]; c++) requireModel(Number.isFinite(readers[sampler.output](i, c)), '动画包含无效数值')
    }
    for (const channel of animation.channels ?? []) {
      ref(animation.samplers ?? [], channel.sampler, '动画采样器'); ref(nodes, channel.target?.node, '动画骨骼')
      requireModel(['translation', 'rotation', 'scale', 'weights'].includes(channel.target.path), '动画目标属性无效')
    }
  }
  let pixels = 0
  for (const image of images) {
    requireModel(!image.uri && ['image/png', 'image/jpeg'].includes(image.mimeType), '纹理须以 PNG 或 JPEG 嵌入模型文件')
    const view = ref(bufferViews, image.bufferView, '纹理'), data = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    let width = 0, height = 0
    if (image.mimeType === 'image/png') {
      requireModel(data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG 纹理损坏')
      width = data.readUInt32BE(16); height = data.readUInt32BE(20)
    } else {
      requireModel(data[0] === 255 && data[1] === 216, 'JPEG 纹理损坏')
      for (let o = 2; o + 4 < data.length;) {
        requireModel(data[o] === 255, 'JPEG 纹理标记无效')
        const marker = data[o + 1]; if (marker === 218 || marker === 217) break
        if (marker === 255) { o++; continue }
        const length = data.readUInt16BE(o + 2); requireModel(length >= 2 && o + 2 + length <= data.length, 'JPEG 纹理不完整')
        if ([192, 193, 194].includes(marker)) { requireModel(length >= 8, 'JPEG 尺寸无效'); height = data.readUInt16BE(o + 5); width = data.readUInt16BE(o + 7); break }
        o += length + 2
      }
    }
    requireModel(width > 0 && height > 0 && width <= 4096 && height <= 4096, '纹理尺寸无效或超过 4096 像素')
    pixels += width * height; requireModel(pixels <= 96000000, '纹理总量过大，请压缩贴图')
  }
  const infoText = value => typeof value === 'string' ? value.slice(0, 200) : ''
  return { format, rigged: skins.length > 0, human: Boolean(vrm1 || vrm0), boneCount: Object.keys(bones).length, joints: skins.reduce((n, s) => n + s.joints.length, 0), triangles: Math.ceil(triangles), animations: animations.length, texturePixels: pixels, bytes: bytes.length, version: createHash('sha256').update(bytes).digest('hex'), title: infoText(meta.name ?? meta.title), author: infoText(meta.authors?.join(', ') ?? meta.author), license: infoText(meta.licenseName ?? meta.licenseUrl) }
}
