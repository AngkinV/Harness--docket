// Serialized into the host's opening <body>, ahead of its loading UI and bundles.
// Keep this function self-contained: no module imports or React are needed.
export function startupPlayback(namespace) {
  if (window.__HDK_STARTUP__) return
  const state = window.__HDK_STARTUP__ = { namespace, attempted: false, active: false, phase: 'idle', close: () => {} }
  const read = key => { try { return localStorage.getItem(key + ':' + namespace) } catch { return null } }
  if (read('harness-docket:autoplay:v1') === 'false') return
  state.attempted = true; state.active = true; state.phase = 'loading'
  const root = document.createElement('div'), video = document.createElement('video'), skip = document.createElement('button')
  root.className = 'dba-root hdk-startup'
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#000;display:flex;overflow:hidden'
  video.className = 'dba-video'
  video.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none;object-fit:' + (read('dsh-boot-animation:fit') === 'contain' ? 'contain' : 'cover')
  video.muted = true; video.defaultMuted = true; video.playsInline = true; video.preload = 'auto'
  video.disablePictureInPicture = true; video.disableRemotePlayback = true
  skip.className = 'dba-skip'; skip.textContent = '跳过'; skip.setAttribute('aria-label', '跳过启动动画')
  skip.style.cssText = 'position:absolute;top:20px;right:22px;border:1px solid #ffffff80;background:#0008;color:white;border-radius:8px;padding:8px 18px;min-height:40px;cursor:pointer'
  root.append(video, skip); document.body.append(root)
  let timer, finished = false
  const emit = phase => {
    state.phase = phase
    window.dispatchEvent(new CustomEvent('harness-docket:startup', { detail: { phase, active: state.active } }))
    window.dispatchEvent(new CustomEvent('harness-docket:playback', { detail: state.active }))
  }
  const guard = () => { clearTimeout(timer); if (!document.hidden) timer = setTimeout(() => close('failed'), 25000) }
  const visibility = () => {
    if (document.hidden) { video.pause(); clearTimeout(timer) }
    else { guard(); video.play().catch(() => close('failed')) }
  }
  const pagehide = () => close('left')
  const storage = event => { if ((event.key === null || event.key === 'harness-docket:autoplay:v1:' + namespace) && read('harness-docket:autoplay:v1') === 'false') close('disabled') }
  const close = phase => {
    if (finished) return
    finished = true; state.active = false; clearTimeout(timer)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('pagehide', pagehide); window.removeEventListener('storage', storage)
    video.onplaying = video.onwaiting = video.ontimeupdate = video.onended = video.onerror = null
    skip.onclick = null; video.pause(); video.removeAttribute('src'); video.load(); root.remove()
    state.close = () => {}; emit(phase)
  }
  state.close = close
  video.onplaying = () => { emit('playing'); guard() }
  video.onwaiting = () => emit('buffering')
  video.ontimeupdate = guard
  video.onended = () => close('completed'); video.onerror = () => close('failed')
  skip.onclick = () => close('skipped')
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', pagehide); window.addEventListener('storage', storage)
  // A live, authenticated URL resolves the selected clip on every navigation.
  video.src = '/harness-docket/boot.mp4'
  emit('loading'); guard()
  if (!document.hidden) video.play().catch(() => close('failed'))
}
