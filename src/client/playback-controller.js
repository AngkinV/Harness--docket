export class PlaybackController {
  generation = 0
  pending = null
  /** @type {{id: string, name: string, version: string, playId: number, sessionId: string | null, src: string} | null} */
  current = null
  constructor(fetcher = globalThis.fetch) { this.fetcher = (...args) => fetcher.call(globalThis, ...args) }
  async open(sessionId, timeout = 8000) {
    this.cancel()
    const playId = this.generation, abort = new AbortController(); this.pending = abort
    const timer = setTimeout(() => abort.abort(), timeout)
    try {
      const response = await this.fetcher('/harness-docket/videos.json', { cache: 'no-store', signal: abort.signal })
      if (!response.ok) throw new Error('无法读取当前片源')
      const data = await response.json()
      if (abort.signal.aborted || playId !== this.generation) return null
      if (typeof data.activeId !== 'string' || !data.activeVersion) throw new Error('片库中没有可播放的视频')
      this.current = Object.freeze({ id: data.activeId, name: data.videos?.find(v => v.id === data.activeId)?.name || '当前片头', version: data.activeVersion, playId, sessionId, src: '/harness-docket/media/' + encodeURIComponent(data.activeId) + '?v=' + encodeURIComponent(data.activeVersion) })
      return this.current
    } finally { clearTimeout(timer); if (this.pending === abort) this.pending = null }
  }
  cancel() { this.generation++; this.pending?.abort(); this.pending = null; this.current = null }
}
// Reconsider late blankBit, but request at most once per session entry.
export class SessionEntry {
  id = null
  attempted = false
  update(id, blank, pinned, seen, enabled = true) {
    if (id !== this.id) { this.id = id; this.attempted = false }
    if (!enabled) { this.attempted = true; return false }
    if (id === null || this.attempted || (id !== pinned && (!blank || seen))) return false
    this.attempted = true; return true
  }
}
