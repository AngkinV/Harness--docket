// Two short-lived decoders, at most sixteen waiting visible cards; no cache.
let active = 0
const waiting = []
export function captureThumbnail(src, signal) {
  return new Promise((resolve, reject) => {
    let started = false, finished = false, video, timer
    const abortError = () => new DOMException('Cancelled', 'AbortError')
    const finish = (error, value) => {
      if (finished) return
      finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
      const index = waiting.indexOf(start); if (index >= 0) waiting.splice(index, 1)
      if (video) { video.onloadedmetadata = video.onseeked = video.onerror = null; video.pause(); video.removeAttribute('src'); video.load(); video.remove() }
      if (started) { active--; waiting.shift()?.() }
      if (error) reject(error); else resolve(value)
    }
    const abort = () => finish(abortError())
    const start = () => {
      if (finished) return
      started = true; active++
      timer = setTimeout(() => finish(new Error('封面读取超时')), 8000)
      video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto'
      video.onerror = () => finish(new Error('无法读取封面'))
      video.onloadedmetadata = () => { video.currentTime = Math.min(2, Number.isFinite(video.duration) ? video.duration * .18 : .1) }
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180
          const context = canvas.getContext('2d'); context.drawImage(video, 0, 0, 320, 180)
          finish(null, { url: canvas.toDataURL('image/webp', .75), duration: video.duration })
          canvas.width = canvas.height = 0
        } catch (error) { finish(error) }
      }
      video.src = src; video.load()
    }
    if (signal.aborted) { finish(abortError()); return }
    signal.addEventListener('abort', abort, { once: true })
    if (active < 2) start()
    else if (waiting.length < 16) waiting.push(start)
    else finish(new Error('封面队列已满'))
  })
}
