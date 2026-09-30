import * as THREE from 'three'
import { ease, SETTLE, CYCLE, RELEASE, DURATION, pocketPhase } from './pocket-menu-layout.js'

const vec = () => new THREE.Vector3()
const capture = bones => bones.map(node => ({ node, q: node.quaternion.clone(), p: node.position.clone() }))
const apply = pose => pose.forEach(b => { b.node.quaternion.copy(b.q); b.node.position.copy(b.p) })
const blend = (a, b, t) => a.forEach((v, i) => { v.node.quaternion.copy(v.q).slerp(b[i].q, t); v.node.position.copy(v.p).lerp(b[i].p, t) })

// Rotate joints only: neither bone offsets nor scales are changed by IK.
export function solveArm(upper, lower, hand, target, pole) {
  upper.updateWorldMatrix(true, true)
  const a = upper.getWorldPosition(vec()), b = lower.getWorldPosition(vec()), c = hand.getWorldPosition(vec())
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c)
  if (l1 < 1e-5 || l2 < 1e-5) return false
  const direction = target.clone().sub(a), d = THREE.MathUtils.clamp(direction.length(), Math.abs(l1 - l2) + 1e-5, (l1 + l2) * .995)
  direction.normalize()
  const bend = pole.clone().sub(a).addScaledVector(direction, -pole.clone().sub(a).dot(direction)).normalize()
  if (bend.lengthSq() < .5) bend.set(0, 0, 1).cross(direction).normalize()
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const elbow = a.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)))
  const rotateTo = (joint, from, to) => {
    const parent = joint.parent.getWorldQuaternion(new THREE.Quaternion())
    const rotation = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize())
    const world = joint.getWorldQuaternion(new THREE.Quaternion()).premultiply(rotation)
    joint.quaternion.copy(parent.invert().multiply(world)); joint.updateWorldMatrix(false, true)
  }
  rotateTo(upper, b.sub(a), elbow.clone().sub(a))
  const wrist = hand.getWorldPosition(vec()), joint = lower.getWorldPosition(vec()), reached = a.clone().addScaledVector(direction, d)
  rotateTo(lower, wrist.sub(joint), reached.sub(joint))
  return true
}

export function createPocketGesture(model) {
  const vrm = model.vrm, get = name => vrm?.humanoid.getNormalizedBoneNode(name) || model.gestureBones?.[name]
  const bones = vrm ? model.poseBones : Object.values(model.gestureBones || {})
  if (!['hips', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'].every(get)) return null
  let saved, entry, closing, elapsed = 0, closeTime = 0, active = false, open = false, arm, rest, pocket, present, pole
  let release = [null, null, null]
  const sync = delta => { model.container.updateMatrixWorld(true); vrm?.update(delta); model.container.updateMatrixWorld(true) }
  const localPosition = node => model.container.worldToLocal(node.getWorldPosition(vec()))
  function setOpen(value, side = 1) {
    if (value === open) return
    open = value
    if (value) {
      if (!active) saved = capture(bones)
      entry = capture(bones); sync(0)
      const name = ['left', 'right'].find(n => Math.sign(localPosition(get(n + 'UpperArm')).x) === side) || 'right'
      arm = { upper: get(name + 'UpperArm'), lower: get(name + 'LowerArm'), hand: get(name + 'Hand'), raw: vrm?.humanoid.getRawBoneNode(name + 'Hand') || get(name + 'Hand') }
      rest = localPosition(arm.hand)
      const hips = localPosition(get('hips')), h = model.size.y
      pocket = new THREE.Vector3(side * h * .10, hips.y - h * .025, hips.z + h * .12)
      present = new THREE.Vector3(side * h * .22, hips.y + h * .065, hips.z + h * .17)
      pole = new THREE.Vector3(side * h * .35, hips.y - h * .12, hips.z + h * .14)
      elapsed = 0; release = [null, null, null]; active = true
    } else if (active) { closing = capture(bones); closeTime = 0 }
  }
  function frame(delta, project) {
    if (!active) return null
    if (!open) {
      closeTime += delta; const t = ease(closeTime / .32)
      blend(closing, saved, t); sync(delta)
      if (t === 1) { active = false; model.lastPose = bones.map(b => b.quaternion.clone()); model.lastPositions = bones.map(b => b.position.clone()) }
      return { active, closing: true, time: elapsed, opacity: 1 - t }
    }
    const previous = elapsed
    elapsed = Math.min(DURATION, elapsed + delta)
    const phase = pocketPhase(elapsed), t = Math.max(0, elapsed - SETTLE)
    apply(entry); sync(0)
    const target = t < .24 ? rest.clone().lerp(pocket, ease(t / .24)) : t < .30 ? pocket.clone() : pocket.clone().lerp(present, ease((t - .30) / (RELEASE - .30)))
    solveArm(arm.upper, arm.lower, arm.hand, model.container.localToWorld(target), model.container.localToWorld(pole.clone()))
    // Blend in the IK bend as well as the wrist path; the elbow must not snap
    // toward its pole on the first frame. Keep the captured body and facing.
    const solved = capture(bones)
    blend(entry, solved, ease(elapsed / .22))
    const returnAt = SETTLE + RELEASE + 2 * CYCLE
    const returning = ease((elapsed - returnAt) / (DURATION - returnAt))
    if (returning) blend(capture(bones), saved, returning)
    sync(delta)
    const palm = project(arm.raw.getWorldPosition(vec()))
    for (let i = 0; i < 3; i++) {
      const at = SETTLE + RELEASE + i * CYCLE
      if (elapsed <= at || previous < at || !release[i]) release[i] = palm
    }
    return { active, time: elapsed, palm, release: [...release], phase, capable: true }
  }
  return { setOpen, frame, get active() { return active }, get open() { return open } }
}
