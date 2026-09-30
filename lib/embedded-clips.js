/** Bounded decoded-copy cache. Node retains imported ESM/base64 independently. */
export function createEmbeddedClipCache({ clips, load = () => import('./clips.data.js'), clock = { setTimeout, clearTimeout } }) {
  const ids = new Set(clips.map(clip => clip.id))
  const maxBytes = 24 * 1024 * 1024
  let loading = null, cached = null, timer = null, disposed = false
  const clear = () => {
    if (timer !== null) clock.clearTimeout(timer)
    timer = null
    cached = null
  }
  const touch = () => {
    if (timer !== null) clock.clearTimeout(timer)
    timer = clock.setTimeout(clear, 30_000)
    timer?.unref?.()
  }
  return {
    async get(id) {
      if (disposed || !ids.has(id)) return null
      if (cached?.id === id) { touch(); return cached.buffer }
      if (loading === null) {
        const pending = Promise.resolve().then(load)
        loading = pending
        pending.catch(() => { if (loading === pending) loading = null })
      }
      const data = await loading
      if (disposed) return null
      // Another request may have decoded this id while the shared import resolved.
      if (cached?.id === id) { touch(); return cached.buffer }
      if (!Object.hasOwn(data, id) || typeof data[id] !== 'string') return null
      clear()
      const buffer = Buffer.from(data[id], 'base64')
      // Large existing inputs remain playable, but never become resident cache entries.
      if (buffer.length <= maxBytes) { cached = { id, buffer }; touch() }
      return buffer
    },
    dispose() { disposed = true; clear(); loading = null },
    snapshot() { return { entries: cached ? 1 : 0, bytes: cached?.buffer.length ?? 0, timer: timer !== null, disposed } },
  }
}
