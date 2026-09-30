import { open, lstat, opendir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname, basename } from 'node:path'
import { HttpError } from './http.js'
export const VIDEO_EXT = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv'])
export const signature = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
// Bound disk hashing to two readers and sixteen waiters. A timed-out waiter is
// removed before rejecting, so it cannot retain a task or consume a later slot.
export function createMediaReadLimiter({ waitMs = 15000 } = {}) {
  let reads = 0
  const queue = []
  return task => new Promise((resolve, reject) => {
    if (reads >= 2 && queue.length >= 16) { reject(new HttpError(429, '视频索引繁忙，请稍后重试')); return }
    let timer
    const start = () => {
      clearTimeout(timer); reads++
      Promise.resolve().then(task).then(resolve, reject).finally(() => { reads--; queue.shift()?.() })
    }
    if (reads < 2) start()
    else {
      queue.push(start)
      timer = setTimeout(() => {
        const index = queue.indexOf(start)
        if (index < 0) return
        queue.splice(index, 1)
        reject(new HttpError(429, '视频索引等待超时，请稍后重试'))
      }, waitMs)
    }
  })
}
export function makeId(p) {
  let h = 0x811c9dc5
  const normalised = p.replace(/\\/g, '/').toLowerCase()
  for (let i = 0; i < normalised.length; i++) { h ^= normalised.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  const stem = basename(p, extname(p)).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return (stem || 'video') + '-' + h.toString(16).padStart(8, '0')
}
export function createMediaCatalog({ home, clips, hidden, env = () => process.env.DSH_BOOT_ANIMATION, readLimiter = createMediaReadLimiter() }) {
  const cache = new Map(), pending = new Map()
  const withReadSlot = readLimiter
  let snapshot = null, snapshotKey = '', expires = 0, scanning = null, epoch = 0
  const warnings = []
  const invalidate = () => { expires = 0; epoch++ }
  async function inspect(path, source = 'yours', budget = null, uploaded = null) {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || !stat.size || stat.size > 250 * 1024 ** 2) throw new HttpError(422, '视频必须是 250 MB 内的普通文件')
    const stamp = signature(stat), old = cache.get(path)
    if (old?.signature === stamp) { cache.delete(path); cache.set(path, old); return old }
    if (pending.has(path)) return pending.get(path)
    if (budget && (budget.bytes + stat.size > 2 * 1024 ** 3)) throw new HttpError(429, '本次新增视频超过 2 GB 扫描预算，请稍后刷新继续索引')
    if (budget) budget.bytes += stat.size
    const promise = withReadSlot(async () => {
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        if (signature(await handle.stat()) !== stamp) throw new HttpError(409, '视频在扫描时发生变化')
        const head = uploaded?.head || Buffer.alloc(Math.min(65536, stat.size))
        if (!uploaded) await handle.read(head, 0, head.length, 0)
        let contentKey = uploaded?.contentKey
        if (!contentKey) {
          const hash = createHash('sha256')
          for await (const chunk of handle.createReadStream({ start: 0, end: stat.size - 1, autoClose: false, highWaterMark: 256 * 1024 })) hash.update(chunk)
          contentKey = hash.digest('hex').slice(0, 16)
        }
        if (signature(await handle.stat()) !== stamp) throw new HttpError(409, '视频在读取时发生变化')
        const moov = head.indexOf('moov'), mdat = head.indexOf('mdat')
        const item = { id: makeId(path), name: basename(path, extname(path)), file: basename(path), ext: extname(path).toLowerCase(), source, writable: source === 'yours', bytes: stat.size, mtimeMs: stat.mtimeMs, mtime: stat.mtime.toISOString(), legacy: basename(path).toLowerCase() === 'intro.mp4', faststart: moov >= 0 && (mdat < 0 || moov < mdat), path, paths: [path], embedded: null, contentKey, signature: stamp, copies: 1, alsoAt: [] }
        cache.delete(path); cache.set(path, item)
        while (cache.size > 1100) cache.delete(cache.keys().next().value)
        return item
      } finally { await handle.close() }
    })
    pending.set(path, promise)
    try { return await promise } finally { pending.delete(path) }
  }
  async function scan() {
    warnings.length = 0
    const found = [], seen = new Set(), budget = { bytes: 0 }, hiddenIds = hidden()
    for (const c of clips) if (!hiddenIds.has('builtin:' + c.id)) found.push({ id: 'builtin:' + c.id, name: c.name, file: null, ext: c.ext, source: 'embedded', writable: false, bytes: c.bytes, mtimeMs: 0, mtime: null, legacy: false, faststart: true, path: null, embedded: c.id, contentKey: c.sha256, copies: 1, alsoAt: [] })
    let count = 0
    for (const dir of [join(home(), 'videos'), home()]) {
      try {
        const stat = await lstat(dir); if (!stat.isDirectory() || stat.isSymbolicLink()) continue
        for await (const entry of await opendir(dir)) {
          if (++count > 2000) { warnings.push('目录条目超过 2000，部分文件未扫描'); break }
          if (!VIDEO_EXT.has(extname(entry.name).toLowerCase())) continue
          const path = join(dir, entry.name); if (hiddenIds.has(makeId(path)) || seen.has(path)) continue
          seen.add(path)
          if (found.length >= 1003) { warnings.push('片库条目超过 1000，部分文件未扫描'); break }
          try { found.push({ ...await inspect(path, 'yours', budget), paths: [path], copies: 1, alsoAt: [] }) } catch (e) { warnings.push(entry.name + '：' + e.message) }
        }
      } catch (e) { if (e.code !== 'ENOENT') warnings.push('视频目录暂时无法读取') }
    }
    for (const path of cache.keys()) if (!seen.has(path) && path !== env()?.trim()) cache.delete(path)
    const grouped = new Map()
    for (const video of found) {
      const first = grouped.get(video.contentKey)
      if (!first) grouped.set(video.contentKey, video)
      else { first.paths = [...(first.paths || []), ...(video.paths || [])]; first.copies++; first.alsoAt.push(video.source) }
    }
    return [...grouped.values()].sort((a, b) => a.source === 'embedded' ? b.source === 'embedded' ? 0 : -1 : b.source === 'embedded' ? 1 : b.mtimeMs - a.mtimeMs)
  }
  async function list() {
    const stamps = await Promise.all([home(), join(home(), 'videos'), join(home(), '.harness-docket-trash/state.json')].map(async path => { try { return signature(await lstat(path)) } catch { return '' } }))
    const key = home() + ':' + env() + ':' + stamps.join('|')
    if (snapshot && snapshotKey === key && Date.now() < expires) return snapshot
    if (scanning) { await scanning; return list() }
    const generation = epoch
    scanning = scan()
    try { snapshot = await scanning; snapshotKey = key; expires = generation === epoch ? Date.now() + 1000 : 0; return snapshot } finally { scanning = null }
  }
  async function find(id) {
    const item = (await list()).find(v => v.id === id)
    if (item || !env()?.trim() || makeId(env().trim()) !== id) return item || null
    try { return await inspect(env().trim(), 'env') } catch { return null }
  }
  // Playback must not hash every other video before opening the chosen file.
  // Reader backpressure is retryable, not evidence that a clip was deleted;
  // preserve it instead of falling through to a different startup video.
  async function playable(id, fallback = false) {
    const hiddenIds = hidden()
    const embedded = clips.filter(c => !hiddenIds.has('builtin:' + c.id)).map(c => ({ id: 'builtin:' + c.id, name: c.name, ext: c.ext, bytes: c.bytes, embedded: c.id, contentKey: c.sha256, source: 'embedded' }))
    const builtin = embedded.find(v => v.id === id)
    if (builtin) return builtin
    const candidates = []; let count = 0
    for (const dir of [join(home(), 'videos'), home()]) {
      try {
        const stat = await lstat(dir); if (!stat.isDirectory() || stat.isSymbolicLink()) continue
        for await (const entry of await opendir(dir)) {
          if (++count > 2000) break
          if (!VIDEO_EXT.has(extname(entry.name).toLowerCase())) continue
          const path = join(dir, entry.name)
          if (hiddenIds.has(makeId(path))) continue
          if (makeId(path) === id) { try { return await inspect(path) } catch (error) { if (error.status === 429) throw error } }
          if (fallback && candidates.length < 1000) {
            const stat = await lstat(path)
            if (stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 250 * 1024 ** 2) candidates.push({ path, time: stat.mtimeMs, legacy: entry.name.toLowerCase() === 'intro.mp4' })
          }
        }
      } catch (e) { if (e.status === 429) throw e; if (e.code !== 'ENOENT') warnings.splice(0, warnings.length, '视频目录暂时无法读取') }
    }
    const external = env()?.trim()
    if (external && (fallback || makeId(external) === id)) { try { return await inspect(external, 'env') } catch (error) { if (error.status === 429) throw error } }
    if (!fallback) return null
    candidates.sort((a, b) => Number(b.legacy) - Number(a.legacy) || b.time - a.time)
    for (const candidate of candidates) { try { return await inspect(candidate.path) } catch (error) { if (error.status === 429) throw error } }
    return embedded[0] || null
  }
  return { list, find, inspect, playable, invalidate, warnings }
}
