// canPlayType reports codec support, not alpha support. Every source must also
// pass the decoded-pixel check before it is allowed to replace the visible clip.
export function alphaSources(item, key, video, userAgent = '', preferred = '') {
  const clip = item.clips[key]
  const sources = [{ format: 'webm', ...clip }]
  if (clip.hevc && video.canPlayType('video/quicktime; codecs="hvc1"')) sources.push({ format: 'hevc', ...clip.hevc })
  const apple = /AppleWebKit/i.test(userAgent) && (/iPhone|iPad|iPod/i.test(userAgent) || !/Chrome|Chromium|Edg|OPR|Android/i.test(userAgent))
  const first = preferred || (apple ? 'hevc' : 'webm')
  return sources.sort((a, b) => Number(b.format === first) - Number(a.format === first)).map(source => ({
    format: source.format,
    url: '/harness-docket/pet-clip?id=' + encodeURIComponent(item.id) + '&clip=' + key + '&format=' + source.format + '&v=' + source.sha256,
  }))
}
const cancelled = () => new DOMException('Cancelled', 'AbortError')
const loadError = () => new Error('角色动画加载失败，请重试。')
// Race both loading and play() against a deadline/abort. All listeners and timers
// belong to one attempt so a failed format cannot poison the following one.
function guarded(signal, timeout, operation) {
  return new Promise((resolve, reject) => {
    let settled = false, cleanup = () => {}
    const finish = (error, value) => {
      if (settled) return
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); cleanup()
      if (error) reject(error); else resolve(value)
    }
    const abort = () => finish(cancelled())
    const timer = setTimeout(() => finish(loadError()), timeout)
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    try { cleanup = operation(value => finish(null, value), finish) || (() => {}) } catch (error) { finish(error) }
    if (settled) cleanup()
  })
}
export async function loadAlphaSource(video, sources, { signal, verify, timeout = 15000 }) {
  let failure = loadError()
  for (const source of sources) {
    if (signal.aborted) throw cancelled()
    try {
      await guarded(signal, timeout, (resolve, reject) => {
        const fail = () => reject(loadError())
        video.addEventListener('loadeddata', resolve, { once: true })
        video.addEventListener('error', fail, { once: true })
        video.src = source.url; video.load()
        return () => { video.removeEventListener('loadeddata', resolve); video.removeEventListener('error', fail) }
      })
      await guarded(signal, timeout, (resolve, reject) => { video.play().then(resolve, reject) })
      // A supported compositor may need a few frames after loadeddata. Use a
      // bounded timer instead of RAF, which may never run for a hidden candidate.
      for (let attempt = 0; attempt < 20; attempt++) {
        await guarded(signal, timeout, resolve => { const timer = setTimeout(resolve, 50); return () => clearTimeout(timer) })
        try { verify(video); return source.format } catch (error) { if (attempt === 19) throw error }
      }
    } catch (error) {
      // On abort, the owning effect handles pausing synchronously. A stale async
      // continuation must never pause a newer request that reused this player.
      if (signal.aborted) throw cancelled()
      video.pause(); failure = error
    }
  }
  throw failure
}
