import * as THREE from 'three'

export function packMotion(data) {
  return {
    clips: data.clips.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.filter(t => t.name.endsWith('.quaternion') || t.name.endsWith('.position')).map(t => ({ name: t.name, type: t.ValueTypeName, times: t.times, values: t.values, interpolation: t.getInterpolation() })) })),
    rests: [...data.rests].map(([name, rest]) => [name, { inverse: rest.inverse.toArray(), parent: rest.parent.toArray() }]),
    hip: { position: data.hip.position.toArray(), parentMatrix: data.hip.parentMatrix.toArray(), height: data.hip.height },
  }
}
export function unpackMotion(data) {
  return {
    clips: data.clips.map(clip => new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(t => new (t.type === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack)(t.name, t.times, t.values, t.interpolation)))),
    rests: new Map(data.rests.map(([name, rest]) => [name, { inverse: new THREE.Quaternion().fromArray(rest.inverse), parent: new THREE.Quaternion().fromArray(rest.parent) }])),
    hip: { position: new THREE.Vector3().fromArray(data.hip.position), parentMatrix: new THREE.Matrix4().fromArray(data.hip.parentMatrix), height: data.hip.height },
  }
}
