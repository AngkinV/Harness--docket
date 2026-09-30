import { Unzlib } from 'three/examples/jsm/libs/fflate.module.js'
import { validateFbxEnvelope } from '../fbx-validation.js'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

export const assetURL = id => '/harness-docket/companion/asset?id=' + encodeURIComponent(id)
const names = { Hips: 'hips', Spine: 'spine', Spine1: 'chest', Spine2: 'upperChest', Neck: 'neck', Head: 'head', LeftShoulder: 'leftShoulder', RightShoulder: 'rightShoulder', LeftArm: 'leftUpperArm', RightArm: 'rightUpperArm', LeftForeArm: 'leftLowerArm', RightForeArm: 'rightLowerArm', LeftHand: 'leftHand', RightHand: 'rightHand', LeftUpLeg: 'leftUpperLeg', RightUpLeg: 'rightUpperLeg', LeftLeg: 'leftLowerLeg', RightLeg: 'rightLowerLeg', LeftFoot: 'leftFoot', RightFoot: 'rightFoot', LeftToeBase: 'leftToes', RightToeBase: 'rightToes' }
for (const side of ['Left', 'Right']) for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let n = 1; n <= 3; n++) names[side + 'Hand' + finger + n] = side.toLowerCase() + (finger === 'Pinky' ? 'Little' : finger) + (finger === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'][n - 1] : ['Proximal', 'Intermediate', 'Distal'][n - 1])
const aliases = new Map(Object.entries(names).flatMap(([name, human]) => [[name.toLowerCase(), human], [human.toLowerCase(), human]]))
export const humanName = name => aliases.get(String(name).split(/[|:]/).pop().replace(/^mixamorig\d*[_:]?/i, '').toLowerCase())
export function humanBones(root) {
  const bones = new Map()
  root.traverse(node => {
    if (!node.isBone) return
    const human = humanName(node.name)
    if (!human) return
    const previous = bones.get(human)
    // FBXLoader.buildSkeleton creates same-ID child bones for a joint shared by
    // multiple skinned meshes. These are aliases, not a second character.
    if (previous) {
      let parent = node.parent
      while (parent && parent !== previous) parent = parent.parent
      if (parent && node.ID !== undefined && node.ID === previous.ID) return
      throw new Error('动作含多个人物骨架，请只导出一个人物')
    }
    bones.set(human, node)
  })
  return bones
}
const legHeight = bones => {
  const hip = bones.get('hips')?.getWorldPosition(new THREE.Vector3())
  const feet = ['leftFoot', 'rightFoot'].map(n => bones.get(n)?.getWorldPosition(new THREE.Vector3())).filter(Boolean)
  return hip && feet.length ? Math.abs(hip.y - feet.reduce((sum, p) => sum + p.y, 0) / feet.length) : 0
}
const required = ['hips', 'leftUpperArm', 'rightUpperArm', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg']
export function parseMotion(buffer) {
  const bytes = new Uint8Array(buffer)
  for (const entry of validateFbxEnvelope(buffer)) {
    let size = 0
    const inflate = new Unzlib((chunk, final) => {
      size += chunk.length
      if (size > entry.bytes || final && size !== entry.bytes) throw new Error('FBX 压缩数组长度不符，已停止解析')
    })
    for (let offset = 0; offset < entry.length; offset += 1024) inflate.push(bytes.subarray(entry.offset + offset, entry.offset + Math.min(entry.length, offset + 1024)), offset + 1024 >= entry.length)
  }
  const manager = new THREE.LoadingManager()
  manager.addHandler(/.*/, { load: () => new THREE.Texture() })
  // Motion import needs no materials. Ignore texture references (including skin
  // exports) without fetching external files or rejecting otherwise valid bones.
  manager.setURLModifier(url => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxS8AAAAASUVORK5CYII='
  })
  let root
  try {
    root = new FBXLoader(manager).parse(buffer, '')
    root.updateMatrixWorld(true)
    const bones = humanBones(root)
    const missing = required.filter(name => !bones.has(name))
    if (missing.length) throw new Error('无法识别人形骨架。请使用 Mixamo 或标准人形 FBX；缺少：' + missing.join('、'))
    if (bones.size > 128 || root.animations.length > 128) throw new Error('动作骨架或片段过多')
    const clips = root.animations.filter(c => Number.isFinite(c.duration) && c.duration > 0 && c.duration <= 600 && c.tracks.some(t => t.name.endsWith('.quaternion') && humanName(t.name.slice(0, -11))))
    if (!clips.length) throw new Error('FBX 中没有可用的人形骨骼动画（支持 10 分钟以内的片段）')
    const tracks = clips.flatMap(clip => clip.tracks)
    if (tracks.length > 8192 || tracks.reduce((n, track) => n + track.times.byteLength + track.values.byteLength, 0) > 64 * 1024 ** 2) throw new Error('动作关键帧过多，请精简后重试')
    for (const clip of clips) for (const track of clip.tracks) if (!track.validate() || track.name.endsWith('.quaternion') && track.getValueSize() !== 4 || track.values.some(v => !Number.isFinite(v)) || track.times.some(v => !Number.isFinite(v) || v < 0)) throw new Error('动作包含无效关键帧')
    const rests = new Map()
    for (const [human, bone] of bones) rests.set(human, { inverse: bone.getWorldQuaternion(new THREE.Quaternion()).invert(), parent: bone.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion() })
    const hip = bones.get('hips')
    return { clips, rests, hip: { position: hip.getWorldPosition(new THREE.Vector3()), parentMatrix: hip.parent?.matrixWorld.clone() || new THREE.Matrix4(), height: legHeight(bones) } }
  } catch (error) { throw new Error(error.message?.startsWith('THREE.') ? 'FBX 无法解析，请重新导出 FBX Binary 动作' : error.message || '无法读取 FBX 动作') }
  finally {
    root?.traverse(node => { node.geometry?.dispose(); for (const m of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) { for (const t of Object.values(m)) if (t?.isTexture) { if (t.image?.src?.startsWith('blob:')) URL.revokeObjectURL(t.image.src); t.dispose() } m.dispose() } })
  }
}
export function retargetMotion(data, index, model) {
  const source = data.clips[index]
  if (!source) throw new Error('动作片段不存在，请重新选择')
  let targets = new Map()
  if (model.vrm) {
    model.vrm.humanoid.resetNormalizedPose(); model.vrm.update(0)
    for (const human of data.rests.keys()) { const bone = model.vrm.humanoid.getNormalizedBoneNode(human); if (bone) targets.set(human, bone) }
  } else targets = humanBones(model.root)
  if (required.some(name => !targets.has(name))) throw new Error('当前角色不支持此 FBX：请使用 VRM 或 Mixamo 人形骨架 GLB')
  model.root.updateMatrixWorld(true)
  const tracks = [], q = new THREE.Quaternion()
  for (const track of source.tracks) {
    if (!track.name.endsWith('.quaternion')) continue
    const human = humanName(track.name.slice(0, -11)), bone = targets.get(human), rest = data.rests.get(human)
    if (!bone || !rest) continue
    const targetRest = bone.getWorldQuaternion(new THREE.Quaternion()), parentInverse = bone.parent?.getWorldQuaternion(new THREE.Quaternion()).invert() || new THREE.Quaternion()
    const values = new Float32Array(track.values.length)
    for (let i = 0; i < values.length; i += 4) {
      q.fromArray(track.values, i).premultiply(rest.parent).multiply(rest.inverse).multiply(targetRest).premultiply(parentInverse).normalize().toArray(values, i)
    }
    // UUID binding avoids ambiguous bone names; scale never deforms the target.
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.uuid + '.quaternion', track.times, values))
  }
  const hipTrack = source.tracks.find(t => t.name.endsWith('.position') && humanName(t.name.slice(0, -9)) === 'hips')
  const height = legHeight(targets)
  if (hipTrack && hipTrack.getValueSize() === 3 && data.hip?.height > 1e-6 && height > 1e-6) {
    const hip = targets.get('hips'), point = new THREE.Vector3()
    const parentInverse = hip.parent?.matrixWorld.clone().invert() || new THREE.Matrix4()
    const worldBase = hip.getWorldPosition(new THREE.Vector3()), values = new Float32Array(hipTrack.values.length)
    for (let i = 0; i < values.length; i += 3) {
      point.fromArray(hipTrack.values, i).applyMatrix4(data.hip.parentMatrix)
      const rise = (point.y - data.hip.position.y) * height / data.hip.height
      // Remove horizontal travel while retaining jumps/crouches in model units.
      point.copy(worldBase); point.y += rise; point.applyMatrix4(parentInverse).toArray(values, i)
    }
    tracks.push(new THREE.VectorKeyframeTrack(hip.uuid + '.position', hipTrack.times, values))
  }
  if (!tracks.length) throw new Error('动作没有可映射到当前角色的骨骼轨道')
  return new THREE.AnimationClip(source.name, source.duration, tracks)
}

