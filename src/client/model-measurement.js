import * as THREE from 'three'
import { maskFromPixels } from './attached-menu-layout.js'

// A small, model-only render target. WebGL2 PBO + fence avoids synchronous GPU
// readback; at most one sample is outstanding, at a maximum of five per second.
export function createModelMeasurement(renderer, scene, camera, host, publish) {
  const gl = renderer.getContext(), target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true })
  const capture = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false })
  const vector = new THREE.Vector3(), samples = []
  let pending = null, generation = 0, last = -Infinity, dead = false, cached = null, staticDone = false
  const supported = typeof gl.fenceSync === 'function'
  const metrics = { samples: 0, maxHz: 5, asyncReadback: supported, cpuMs: samples, failures: 0 }
  const disposeRead = () => { if (pending) { gl.deleteSync(pending.sync); gl.deleteBuffer(pending.buffer); clearTimeout(pending.timer); pending = null } }
  const reset = () => { generation++; disposeRead(); cached = null; staticDone = false; last = -Infinity; publish(null) }
  const poll = () => {
    if (!pending || dead) return
    const p = pending, state = gl.clientWaitSync(p.sync, 0, 0)
    if (state === gl.TIMEOUT_EXPIRED && performance.now() - p.started < 2000) { p.timer = setTimeout(poll, 8); return }
    if (state === gl.WAIT_FAILED || state === gl.TIMEOUT_EXPIRED) { metrics.failures++; disposeRead(); return }
    const start = performance.now(), rgba = new Uint8Array(p.width * p.height * 4)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p.buffer); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rgba); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    disposeRead()
    if (p.generation !== generation || dead || document.hidden) return
    const mask = maskFromPixels(rgba, p.width, p.height, p.cssWidth, p.cssHeight)
    if (!mask) { metrics.failures++; publish({ ...p.info, mask: null, metrics, confidence: 'empty' }); return }
    p.model.menuReferenceRatio ??= (mask.body.bottom - mask.body.top) / p.cssHeight
    const value = { ...p.info, mask, referenceHeight: p.model.menuReferenceRatio * p.cssHeight, confidence: p.info.anchor ? 'humanoid' : mask.confidence, metrics }
    cached = value; metrics.samples++; samples.push(p.cpu + performance.now() - start); if (samples.length > 240) samples.shift()
    publish(value)
  }
  function sample(model, now, force = false) {
    if (force && pending) disposeRead()
    if (dead || !model || document.hidden || pending || !supported || !force && (now - last < 200 || staticDone)) return
    last = now; const start = performance.now()
    const cssWidth = host.clientWidth, cssHeight = host.clientHeight
    if (!cssWidth || !cssHeight) return
    const height = 192, width = Math.max(32, Math.min(256, Math.round(height * cssWidth / cssHeight)))
    target.setSize(width, height)
    const helper = model.helper?.visible, previous = renderer.getRenderTarget()
    if (model.helper) model.helper.visible = false
    try {
      if (!helper && !previous) {
        // Resolve the already drawn, model-only framebuffer, then downsample.
        // This reuses the exact visible materials without rendering every mesh twice.
        const nativeWidth = renderer.domElement.width, nativeHeight = renderer.domElement.height
        capture.setSize(nativeWidth, nativeHeight); renderer.setRenderTarget(capture)
        const full = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
        gl.blitFramebuffer(0, 0, nativeWidth, nativeHeight, 0, 0, nativeWidth, nativeHeight, gl.COLOR_BUFFER_BIT, gl.NEAREST)
        renderer.setRenderTarget(target)
        const small = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, full)
        gl.blitFramebuffer(0, 0, nativeWidth, nativeHeight, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.LINEAR)
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, small)
      } else { renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera) }
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer); gl.bufferData(gl.PIXEL_PACK_BUFFER, width * height * 4, gl.STREAM_READ)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0)
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      let anchor = null
      if (model.menuHips) { model.menuHips.getWorldPosition(vector); vector.project(camera); anchor = { x: (vector.x + 1) / 2 * cssWidth, y: (1 - vector.y) / 2 * cssHeight } }
      pending = { buffer, sync, generation, width, height, cssWidth, cssHeight, started: now, cpu: performance.now() - start, model, info: { id: model.menuId, version: model.menuVersion, anchor, referenceHeight: (model.menuReferenceRatio || .48) * cssHeight, cssWidth, cssHeight } }
      pending.timer = setTimeout(poll, 8)
      staticDone = !model.vrm && !model.animate && !model.mixer && !model.externalMixer
    } catch { metrics.failures++; disposeRead() }
    finally { renderer.setRenderTarget(previous); if (model.helper) model.helper.visible = helper }
  }
  const visibility = () => { if (document.hidden) disposeRead(); else staticDone = false }
  document.addEventListener('visibilitychange', visibility)
  Object.defineProperty(host, '__hdaMeasurement', { configurable: true, get: () => cached })
  return { sample, reset, freeze(model) { disposeRead(); sample(model, performance.now(), true) }, dispose() { dead = true; document.removeEventListener('visibilitychange', visibility); reset(); target.dispose(); capture.dispose(); delete host.__hdaMeasurement } }
}
