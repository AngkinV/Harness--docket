import * as THREE from 'three'
export function gazeAngles(dx, dy, size, strength = 1) {
  const dead = value => Math.sign(value) * Math.max(0, Math.abs(value) - .04)
  const x = dead(dx / Math.max(30, size)), y = dead(dy / Math.max(30, size))
  const limit = (v, n) => THREE.MathUtils.clamp(v, -n, n)
  return { eyeX: limit(x * .16 * strength, .21), eyeY: limit(y * .11 * strength, .14), headX: limit(dead(x * .25) * .16 * strength, .14), headY: limit(dead(y * .25) * .11 * strength, .087) }
}
export function gazeCapability(model) {
  if (model.eyeParts?.length) return 'eyes'
  const h = model.vrm?.humanoid
  if (!h?.getNormalizedBoneNode('head')) return 'none'
  const eyes = h.getRawBoneNode('leftEye') && h.getRawBoneNode('rightEye')
  const expressions = ['lookLeft', 'lookRight', 'lookUp', 'lookDown'].some(x => model.expressions?.includes(x))
  return model.vrm.lookAt && (eyes || expressions) ? 'eyes' : 'head'
}
export function createGazeController(host, camera, wake = () => {}) {
  let pointer = null, mode = 'gentle', allowed = true, wasActive = false
  const point = new THREE.Vector3(), projected = new THREE.Vector3(), targetPoint = new THREE.Vector3(), offset = new THREE.Quaternion(), euler = new THREE.Euler()
  const values = { eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
  const move = e => { if (e.pointerType !== 'touch') pointer = { x: e.clientX, y: e.clientY, at: performance.now() }; wake() }
  const leave = e => { if (!e.relatedTarget) pointer = null }, blur = () => { pointer = null }
  window.addEventListener('pointermove', move, { passive: true }); document.addEventListener('pointerout', leave); window.addEventListener('blur', blur)
  function reset(model) { for (const k in values) values[k] = 0; model?.vrm?.lookAt?.reset(); for (const eye of model?.eyeParts || []) eye.rotation.set(0, 0, 0) }
  return {
    hasPointer() { return !!(allowed && mode !== 'off' && pointer && performance.now() - pointer.at < 4000) },
    set(value = 'gentle', enable = true) { mode = value; allowed = enable }, reset,
    update(model, delta, active) {
      const capability = gazeCapability(model), h = model.vrm?.humanoid.getNormalizedBoneNode('head') || model.gestureBones?.head
      if (!h || capability === 'none') return
      const tracking = active && allowed && mode !== 'off' && pointer && performance.now() - pointer.at < 4000 && Math.cos(model.container.rotation.y) > .65
      if (!tracking && Math.abs(values.eyeX) + Math.abs(values.eyeY) + Math.abs(values.headX) + Math.abs(values.headY) < .0001) {
        if (wasActive) reset(model)
        wasActive = false
        if (host.__hdaGaze?.active !== false || host.__hdaGaze?.mode !== mode) host.__hdaGaze = { capability, mode, active: false, ...values }
        return
      }
      const p = h.getWorldPosition(point), ndc = projected.copy(p).project(camera), rect = host.getBoundingClientRect()
      const enabled = tracking
      const target = enabled ? gazeAngles(pointer.x - rect.left - (ndc.x + 1) * rect.width / 2, pointer.y - rect.top - (1 - ndc.y) * rect.height / 2, rect.height / 2.1, mode === 'noticeable' ? 1.35 : .8) : { eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
      for (const k in values) values[k] += (target[k] - values[k]) * (1 - Math.exp(-delta * 9))
      if (!active) { if (wasActive) reset(model); wasActive = false; host.__hdaGaze = { capability, mode, active: false, ...values }; return }
      wasActive = true
      h.quaternion.multiply(offset.setFromEuler(euler.set(values.headY, values.headX, 0)))
      h.updateWorldMatrix(true, false)
      if (capability === 'eyes' && model.vrm) {
        const look = model.vrm.lookAt
        look.autoUpdate = false
        // VRM0 files commonly map 90° input to only 8–12° eye motion.
        // Calibrate bounded screen gaze on the live bone applier, preserving
        // each model's inner/outer asymmetry and the original asset bytes.
        if (!model.gazeCalibrated && look.applier?.humanoid) {
          for (const name of ['rangeMapHorizontalInner', 'rangeMapHorizontalOuter', 'rangeMapVerticalDown', 'rangeMapVerticalUp']) {
            const map = look.applier[name], limit = name.includes('Horizontal') ? 12 : 8
            if (map) { map.inputMaxValue = limit; map.outputScale = Math.min(map.outputScale, limit) }
          }
          model.gazeCalibrated = true
        }
        // Aim from the actual head toward a point in front of it; the VRM
        // adapter resolves VRM0/VRM1 eye-axis conventions and declared ranges.
        const target = targetPoint.set(Math.tan(values.eyeX) * model.size.y * 3, -Math.tan(values.eyeY) * model.size.y * 3, model.size.y * 3).add(p)
        look.lookAt(target)
        look.yaw = THREE.MathUtils.clamp(look.yaw, -12, 12); look.pitch = THREE.MathUtils.clamp(look.pitch, -8, 8)
        if (!enabled && Math.abs(values.eyeX) + Math.abs(values.eyeY) < .001) look.reset()
      } else for (const eye of model.eyeParts || []) { eye.rotation.y = values.eyeX; eye.rotation.x = values.eyeY }
      host.__hdaGaze = { capability, mode, active: !!enabled, ...values, head: { x: (ndc.x + 1) * rect.width / 2, y: (1 - ndc.y) * rect.height / 2 } }
    },
    dispose() { window.removeEventListener('pointermove', move); document.removeEventListener('pointerout', leave); window.removeEventListener('blur', blur) },
  }
}
