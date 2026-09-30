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
  if (!get('leftHand') || !get('rightHand') || !get('hips')) return null
  let saved, neutral, closing, elapsed = 0, closeTime = 0, startAngle = 0, closeAngle = 0, active = false, open = false, side = 1, arm, release = [null, null, null]
  const sync = delta => { model.container.updateMatrixWorld(true); vrm?.update(delta); model.container.updateMatrixWorld(true) }
  const localPosition = node => model.container.worldToLocal(node.getWorldPosition(vec()))
  function setOpen(value, nextSide) {
    if (value === open) return
    open = value
    if (value) {
      if (!active) { saved = capture(bones); startAngle = model.container.rotation.y }
      const entry = capture(bones), entryAngle = model.container.rotation.y
      if (vrm) {
        vrm.humanoid.resetNormalizedPose()
        get('leftUpperArm').rotation.set(0, 0, 1.18); get('rightUpperArm').rotation.set(0, 0, -1.18)
      } else model.gestureRest.forEach(b => { b.node.quaternion.copy(b.q); b.node.position.copy(b.p) })
      neutral = capture(bones); model.container.rotation.y = 0; sync(0)
      side = nextSide || 1
      const names = ['left', 'right']; const name = names.find(n => Math.sign(localPosition(get(n + 'UpperArm')).x) === side) || 'right'
      arm = { upper: get(name + 'UpperArm'), lower: get(name + 'LowerArm'), hand: get(name + 'Hand'), raw: vrm?.humanoid.getRawBoneNode(name + 'Hand') || get(name + 'Hand'), finger: vrm?.humanoid.getRawBoneNode(name + 'MiddleProximal') }
      apply(entry); model.container.rotation.y = entryAngle; sync(0)
      closing = entry; closeAngle = entryAngle; elapsed = 0; release = [null, null, null]; active = true
    } else if (active) { closing = capture(bones); closeAngle = model.container.rotation.y; closeTime = 0 }
  }
  function frame(delta, project) {
    if (!active) return null
    if (!open) {
      closeTime += delta; const t = ease(closeTime / .32)
      blend(closing, saved, t); model.container.rotation.y = closeAngle + Math.atan2(Math.sin(startAngle - closeAngle), Math.cos(startAngle - closeAngle)) * t; sync(delta)
      if (t === 1) { active = false; model.lastPose = bones.map(b => b.quaternion.clone()); model.lastPositions = bones.map(b => b.position.clone()) }
      return { active, closing: true, time: elapsed, opacity: 1 - t }
    }
    elapsed = Math.min(DURATION, elapsed + delta)
    const phase = pocketPhase(elapsed)
    apply(neutral); model.container.rotation.y = closeAngle * (1 - ease(elapsed / SETTLE)); sync(0)
    if (!phase.settled) blend(closing, neutral, ease(elapsed / SETTLE))
    else if (!phase.done) {
      model.container.rotation.y = 0; sync(0)
      const rest = localPosition(arm.hand), hips = localPosition(get('hips')), h = model.size.y
      const pocket = new THREE.Vector3(side * h * .105, hips.y - h * .035, hips.z + h * .12)
      const present = new THREE.Vector3(side * h * .235, hips.y + h * .055, hips.z + h * .17)
      const t = phase.local
      const target = t < .24 ? rest.clone().lerp(pocket, ease(t / .24)) : t < .31 ? pocket : t <= RELEASE ? pocket.clone().lerp(present, ease((t - .31) / (RELEASE - .31))) : present.clone().lerp(rest, ease((t - RELEASE) / (CYCLE - RELEASE)))
      const pole = new THREE.Vector3(side * h * .34, hips.y - h * .1, hips.z + h * .08)
      solveArm(arm.upper, arm.lower, arm.hand, model.container.localToWorld(target), model.container.localToWorld(pole))
    }
    sync(delta)
    const palmWorld = arm.raw.getWorldPosition(vec())
    if (arm.finger) palmWorld.lerp(arm.finger.getWorldPosition(vec()), .65)
    const palm = project(palmWorld)
    // Capture on the last held frame (before the hand starts returning), using
    // the exact same projected point the UI used, including dropped frames.
    if (phase.settled && !phase.done && phase.local <= RELEASE) release[phase.index] = palm
    return { active, time: elapsed, palm, release: [...release], phase, capable: true }
  }
  return { setOpen, frame, get active() { return active }, get open() { return open } }
}
