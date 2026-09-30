import { open, lstat, opendir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname, basename } from 'node:path'
import { HttpError } from './http.js'
export const VIDEO_EXT = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv'])
export const signature = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
export function makeId(p) {
  let h = 0x811c9dc5
  const normalised = p.replace(/\\/g, '/').toLowerCase()
  for (let i = 0; i < normalised.length; i++) { h ^= normalised.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  const stem = basename(p, extname(p)).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return (stem || 'video') + '-' + h.toString(16).padStart(8, '0')
}
export function createMediaCatalog({ home, clips, hidden, env = () => process.env.DSH_BOOT_ANIMATION }) {
  const cache = new Map(), pending = new Map()
  let snapshot = null, snapshotKey = '', expires = 0, scanning = null, epoch = 0
  const warnings = []
  const invalidate = () => { expires = 0; epoch++ }
  async function inspect(path, source = 'yours', budget = null) {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || !stat.size || stat.size > 250 * 1024 ** 2) throw new HttpError(422, '视频必须是 250 MB 内的普通文件')
    const stamp = signature(stat), old = cache.get(path)
    if (old?.signature === stamp) { cache.delete(path); cache.set(path, old); return old }
    if (pending.has(path)) return pending.get(path)
    if (budget && (budget.bytes + stat.size > 2 * 1024 ** 3)) throw new HttpError(429, '本次新增视频超过 2 GB 扫描预算，请稍后刷新继续索引')
    if (budget) budget.bytes += stat.size
    const promise = (async () => {
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        if (signature(await handle.stat()) !== stamp) throw new HttpError(409, '视频在扫描时发生变化')
        const head = Buffer.alloc(Math.min(65536, stat.size)); await handle.read(head, 0, head.length, 0)
        const hash = createHash('sha256')
        for await (const chunk of handle.createReadStream({ start: 0, end: stat.size - 1, autoClose: false, highWaterMark: 256 * 1024 })) hash.update(chunk)
        if (signature(await handle.stat()) !== stamp) throw new HttpError(409, '视频在读取时发生变化')
        const moov = head.indexOf('moov'), mdat = head.indexOf('mdat')
        const item = { id: makeId(path), name: basename(path, extname(path)), file: basename(path), ext: extname(path).toLowerCase(), source, writable: source === 'yours', bytes: stat.size, mtimeMs: stat.mtimeMs, mtime: stat.mtime.toISOString(), legacy: basename(path).toLowerCase() === 'intro.mp4', faststart: moov >= 0 && (mdat < 0 || moov < mdat), path, paths: [path], embedded: null, contentKey: hash.digest('hex').slice(0, 16), signature: stamp, copies: 1, alsoAt: [] }
        cache.delete(path); cache.set(path, item)
        while (cache.size > 1100) cache.delete(cache.keys().next().value)
        return item
      } finally { await handle.close() }
    })()
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
  return { list, find, inspect, invalidate, warnings }
}
