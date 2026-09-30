import { schema } from './resource-state.js'
import { withUploadSlot } from './resource-inspector.js'
import { HttpError } from './http.js'
import { atomicStateSync, withStoreLockSync, readStateSync } from './storage.js'
import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, linkSync, realpathSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024
const EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv'])
export class LibraryError extends HttpError {}

// All mutation paths are either validated direct children or random internal names.
// No path received from the browser is ever used to read, delete or restore a file.
export function createLibraryStore(homeDir, now = Date.now) {
  const home = () => resolve(homeDir())
  const trash = () => join(home(), '.harness-docket-trash')
  const stateFile = () => join(trash(), 'state.json')
  function directory(path) {
    mkdirSync(home(), { recursive: true })
    if (!existsSync(path)) mkdirSync(path, { recursive: true })
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new LibraryError(409, '视频目录不可用')
    if (path !== home() && realpathSync(dirname(path)) !== realpathSync(home())) throw new LibraryError(409, '视频目录不可用')
    return path
  }
  function readState() {
    directory(trash())
    const data = readStateSync(stateFile(), { deleted: [], hidden: [], pendingCleanup: [] }, value => {
      schema(value)
      if (!Array.isArray(value.deleted) || !Array.isArray(value.hidden)) throw new LibraryError(409, '回收站记录损坏')
      for (const item of value.deleted) { if (!Array.isArray(item.files) || !Array.isArray(item.hiddenIds)) throw new Error('invalid journal'); for (const file of item.files) { originalPath(file); blobPath(file.blob) } }
      for (const blob of value.pendingCleanup || []) blobPath(blob)
    })
    data.pendingCleanup ||= []
    const pending = data.pendingCleanup.filter(blob => { try { const path = blobPath(blob); if (existsSync(path)) unlinkSync(path); return false } catch { return true } })
    if (pending.length !== data.pendingCleanup.length) { data.pendingCleanup = pending; save(data) }
    // A durable journal lets a restart finish a deletion interrupted between moves.
    if (data.deleted.some(item => item.pending)) {
      for (const item of data.deleted.filter(item => item.pending)) {
        for (const file of item.files) {
          const blob = blobPath(file.blob)
          if (existsSync(blob)) continue
          const original = originalPath(file)
          managedFile(original)
          const stat = lstatSync(original)
          if (stat.ino !== file.ino || stat.dev !== file.dev || stat.size !== file.size) throw new LibraryError(409, '未完成删除的原文件已变化，请保留回收站数据')
          renameSync(original, blob)
        }
        item.pending = false
      }
      save(data)
    }
    return data
  }
  function originalPath(file) {
    if (!['root', 'videos'].includes(file.location) || typeof file.name !== 'string' || file.name !== basename(file.name) || /[\\/\x00-\x1f\x7f]/.test(file.name)) throw new LibraryError(409, '回收站路径记录无效')
    return join(file.location === 'root' ? home() : join(home(), 'videos'), file.name)
  }
  function save(state) {
    directory(trash())
    atomicStateSync(stateFile(), { ...state, schemaVersion: 1 })
  }
  function managedFile(path) {
    const parent = dirname(resolve(path))
    if (parent !== home() && parent !== join(home(), 'videos')) throw new LibraryError(403, '只能删除片库中的视频')
    directory(parent)
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new LibraryError(403, '不能操作链接或目录')
    return path
  }
  function blobPath(blob) {
    if (!/^[0-9a-f-]{36}\.video$/.test(blob)) throw new LibraryError(409, '回收站文件记录无效')
    const path = join(directory(trash()), blob)
    if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile())) throw new LibraryError(409, '回收站文件不可用')
    return path
  }
  function cleanup() {
    const state = readState()
    const expired = state.deleted.filter(item => item.expiresAt <= now())
    if (!expired.length) return state
    // Keep the journal until every expired blob was removed, so partial cleanup retries.
    for (const item of expired) for (const file of item.files) {
      const path = blobPath(file.blob)
      if (existsSync(path)) unlinkSync(path)
    }
    state.hidden = [...new Set([...state.hidden, ...expired.flatMap(item => item.hiddenIds.filter(id => id.startsWith('builtin:')))])]
    state.deleted = state.deleted.filter(item => item.expiresAt > now())
    save(state)
    return state
  }
  function uniquePath(dir, filename) {
    const ext = extname(filename), stem = basename(filename, ext)
    for (let i = 0; i < 10000; i++) {
      const path = join(dir, i ? `${stem} (${i})${ext}` : filename)
      try { lstatSync(path) } catch (error) { if (error.code === 'ENOENT') return path; throw error }
    }
    throw new LibraryError(409, '同名视频过多，请重命名后上传')
  }
  function safeName(filename) {
    if (typeof filename !== 'string' || filename !== basename(filename) || /[\\/\x00-\x1f\x7f]/.test(filename)) throw new LibraryError(400, '视频文件名无效')
    const ext = extname(filename).toLowerCase()
    if (!EXTENSIONS.has(ext)) throw new LibraryError(415, '请选择 MP4、M4V、MOV、WebM 或 MKV 视频')
    const stem = basename(filename, extname(filename)).normalize('NFC').replace(/^[. ]+|[. ]+$/g, '').slice(0, 80)
    return (stem || 'video') + ext
  }
  async function upload(req, filename) {
    filename = safeName(filename)
    if (Number(req.headers['content-length']) > MAX_UPLOAD_BYTES) throw new LibraryError(413, '视频不能超过 250 MB')
    directory(trash())
    const staging = join(trash(), randomUUID() + '.' + process.pid + '.upload')
    let bytes = 0, head = Buffer.alloc(0)
    const limit = new Transform({ transform(chunk, _, done) {
      bytes += chunk.length
      if (bytes > MAX_UPLOAD_BYTES) return done(new LibraryError(413, '视频不能超过 250 MB'))
      if (head.length < 32) head = Buffer.concat([head, chunk.subarray(0, 32 - head.length)])
      done(null, chunk)
    } })
    const output = createWriteStream(staging, { flags: 'wx', mode: 0o600 })
    // Keep HTTP response ownership on size errors instead of destroying its socket.
    req.pipe(limit)
    const abort = () => limit.destroy(new LibraryError(400, '上传已中断'))
    req.once('aborted', abort)
    req.once('error', abort)
    try {
      await pipeline(limit, output)
      if (!req.complete || bytes === 0) throw new LibraryError(400, '视频为空或上传不完整')
      const ebml = head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      const mp4 = head.subarray(4, 8).toString() === 'ftyp'
      if (['.webm', '.mkv'].includes(extname(filename)) ? !ebml : !mp4) throw new LibraryError(415, '文件内容不是支持的视频格式')
      const path = uniquePath(directory(join(home(), 'videos')), filename)
      linkSync(staging, path) // atomic, never overwrites an existing video
      return { path, file: basename(path) }
    } finally {
      req.unpipe(limit); req.off('aborted', abort); req.off('error', abort)
      if (!req.complete) req.resume()
      if (existsSync(staging)) unlinkSync(staging)
    }
  }
  function remove(video) {
    const state = cleanup()
    const paths = [...new Set(video.paths ?? (video.path ? [video.path] : []))]
    paths.forEach(managedFile)
    const item = { id: randomUUID(), name: video.name, bytes: video.bytes, deletedAt: now(), expiresAt: now() + RETENTION_MS,
      pending: true, hiddenIds: video.id.startsWith('builtin:') ? [video.id] : [], files: paths.map(path => { const stat = lstatSync(path); return { name: basename(path), location: dirname(path) === home() ? 'root' : 'videos', blob: randomUUID() + '.video', ino: stat.ino, dev: stat.dev, size: stat.size } }) }
    const moved = []
    directory(trash())
    state.deleted.push(item); save(state)
    try {
      paths.forEach((path, i) => { const to = blobPath(item.files[i].blob); renameSync(path, to); moved.push([to, path]) })
      item.pending = false; save(state)
    } catch (error) {
      for (const [from, to] of moved.reverse()) { linkSync(from, to); unlinkSync(from) }
      state.deleted = state.deleted.filter(entry => entry.id !== item.id); save(state)
      throw error
    }
    return item
  }
  function restore(id) {
    const state = cleanup(), item = state.deleted.find(item => item.id === id)
    if (!item) throw new LibraryError(404, '视频不存在或已超过 30 天恢复期限')
    const restored = []
    try {
      for (const file of item.files) {
        const original = originalPath(file)
        const filename = basename(original)
        const dir = directory(dirname(original))
        const dest = uniquePath(dir, filename)
        linkSync(blobPath(file.blob), dest); restored.push(dest)
      }
      state.deleted = state.deleted.filter(entry => entry.id !== id)
      state.pendingCleanup.push(...item.files.map(file => file.blob))
      save(state)
    } catch (error) { for (const path of restored) unlinkSync(path); throw error }
    // Unlink only after the restored entries have been committed. Original files are safe.
    readState() // retryable cleanup is recorded before any blob is removed
    return item
  }
  const exclusive = fn => (...args) => { directory(trash()); return withStoreLockSync(trash(), () => fn(...args)) }
  return {
    upload: (...args) => withUploadSlot(() => upload(...args)), remove: exclusive(remove), restore: exclusive(restore), cleanup: exclusive(cleanup),
    hiddenIds: exclusive(() => { const state = readState(); return new Set([...state.hidden, ...state.deleted.flatMap(item => item.hiddenIds)]) }),
    listTrash: exclusive(() => cleanup().deleted.map(({ id, name, bytes, deletedAt, expiresAt }) => ({ id, name, bytes, deletedAt, expiresAt }))),
  }
}
