import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { createWriteStream, constants } from 'node:fs'
import { mkdir, lstat, readdir, writeFile, rename, unlink, open } from 'node:fs/promises'
import { join, resolve, extname, basename } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { AvatarError, MAX_MODEL_BYTES } from './avatar-validation.js'
import { withStoreLock, readState, atomicState, readFileBounded } from './storage.js'
import { schema, drainDeletes, reconcileResources } from './resource-state.js'
import { inspectResource, withUploadSlot } from './resource-inspector.js'

export { AvatarError, MAX_MODEL_BYTES }
const DEFAULT_ID = 'alpha:blue-maid'
const exists = async path => { try { return await lstat(path) } catch (e) { if (e.code === 'ENOENT') return null; throw e } }

export function createAvatarStore(homeDir, localDir, animationItems = [], packagedDir = new URL('../assets/models/', import.meta.url)) {
  const cache = new Map()
  const root = () => join(resolve(homeDir()), 'harness-docket', 'avatars')
  const exclusive = async fn => { await directory(); return withStoreLock(root(), fn) }
  async function directory() {
    for (const path of [resolve(homeDir()), join(resolve(homeDir()), 'harness-docket'), root()]) {
      await mkdir(path, { recursive: true }); const stat = await lstat(path)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AvatarError(409, '角色目录不可用')
    }
    return root()
  }
  const safeRead = readFileBounded
  const save = data => atomicState(join(root(), 'state.json'), { ...data, schemaVersion: 1 })
  async function state() {
    const data = await readState(join(await directory(), 'state.json'), { activeId: null, uploaded: [], pendingDeletes: [] }, value => {
      schema(value)
      if (!Array.isArray(value.uploaded) || value.uploaded.length > 50 || value.uploaded.some(i => !/^[0-9a-f-]{36}$/.test(i.id) || !/^[0-9a-f-]{36}\.(vrm|glb)$/.test(i.file))) throw new Error('invalid avatar state')
    }, 1024 * 1024)
    data.pendingDeletes ||= []
    await drainDeletes(root(), data, save)
    return data
  }
  async function inspect(path) {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MODEL_BYTES) throw new AvatarError(422, '模型必须是 50 MB 内的普通文件')
    const signature = [stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
    if (cache.get(path)?.signature === signature) return cache.get(path).info
    const info = await inspectResource(path, 'avatar')
    if (cache.size > 100) cache.clear()
    cache.set(path, { signature, info }); return info
  }
  async function catalog() {
    const data = await state(), items = [], errors = [], paths = new Map()
    const robotPath = fileURLToPath(new URL('robot.glb', packagedDir))
    try {
      const info = await inspect(robotPath), id = 'packaged:robot'
      items.push({ ...info, id, name: data.names?.[id] || '小机器人', source: 'packaged' }); paths.set(id, robotPath)
    } catch (error) { errors.push({ name: '小机器人', error: '无法读取附带模型' }) }
    const local = resolve(localDir())
    const stat = await exists(local)
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AvatarError(409, '本地模型目录不可用')
      const names = (await readdir(local)).filter(n => /\.(vrm|glb)$/i.test(n)).sort((a, b) => a === 'default.vrm' ? -1 : b === 'default.vrm' ? 1 : a.localeCompare(b)).slice(0, 50)
      for (const file of names) {
        try {
          const path = join(local, file), info = await inspect(path), id = 'local:' + createHash('sha256').update(file).digest('hex').slice(0, 24)
          items.push({ ...info, id, name: data.names?.[id] || basename(file, extname(file)), source: 'local' }); paths.set(id, path)
        } catch (error) { errors.push({ name: file, error: error instanceof AvatarError ? error.message : '无法读取模型' }) }
      }
    }
    for (const item of data.uploaded) {
      try { const path = join(root(), item.file), info = await inspect(path); items.push({ ...info, id: item.id, name: item.name, source: 'uploaded' }); paths.set(item.id, path) }
      catch (error) { errors.push({ name: item.name, error: error instanceof AvatarError ? error.message : '无法读取已上传模型' }) }
    }
    items.unshift(...animationItems.filter(item => !data.hiddenAnimations?.includes(item.id)).map(item => ({ ...item, name: data.names?.[item.id] || item.name })))
    return { data, paths, items, errors, activeId: items.some(i => i.id === data.activeId) ? data.activeId : items[0]?.id ?? null, maxBytes: MAX_MODEL_BYTES }
  }
  async function list() { return exclusive(async () => {
    const { items, errors, activeId, maxBytes, data } = await catalog()
    const recovered = await reconcileResources(root(), new Set([...data.uploaded, ...data.pendingDeletes].map(a => a.file)))
    errors.push(...recovered.errors)
    if (data.pendingDeletes.length) errors.push({ name: '资源清理', error: '部分资源已移出列表，磁盘清理将在下次访问时重试' })
    return { items, errors, activeId, maxBytes }
  }) }
  async function has(id) { return exclusive(async () => {
    if (id === 'packaged:robot') return true
    const data = await state()
    if (animationItems.some(item => item.id === id) && !data.hiddenAnimations?.includes(id)) return true
    if (data.uploaded.some(item => item.id === id)) return true
    try {
      const directory = resolve(localDir()), info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) return false
      for (const name of (await readdir(directory)).filter(n => /\.(vrm|glb)$/i.test(n))) {
        if ('local:' + createHash('sha256').update(name).digest('hex').slice(0, 24) !== id) continue
        const stat = await lstat(join(directory, name)); return stat.isFile() && !stat.isSymbolicLink()
      }
    } catch (e) { if (e.code !== 'ENOENT') throw e }
    return false
  }) }
  async function select(id, version) { return exclusive(async () => {
    const c = await catalog(), item = c.items.find(i => i.id === id)
    if (!item) throw new AvatarError(404, '找不到角色')
    if (item.version !== version) throw new AvatarError(409, '模型已更新，请重新预览后使用')
    c.data.activeId = id; await save(c.data); return { ok: true, activeId: id }
  }) }
  async function renameDisplay(id, name) { return exclusive(async () => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || /[\x00-\x1f]/.test(name)) throw new AvatarError(422, '请输入 1–100 字的角色名称')
    const c = await catalog(), item = c.items.find(i => i.id === id)
    if (!item) throw new AvatarError(404, '找不到角色')
    if (item.source === 'builtin') throw new AvatarError(403, '内置角色名称不可修改')
    if (item.source === 'uploaded') c.data.uploaded.find(i => i.id === id).name = name.trim()
    else { c.data.names ||= {}; c.data.names[id] = name.trim() }
    await save(c.data); return { ok: true }
  }) }
  async function remove(id) { return exclusive(async () => {
    const data = await state()
    if (animationItems.some(item => item.id === id)) {
      data.hiddenAnimations = [...new Set([...(data.hiddenAnimations || []), id])]
      if (data.activeId === id) data.activeId = null
      await save(data); return { ok: true }
    }
    const item = data.uploaded.find(i => i.id === id)
    if (!item) throw new AvatarError(403, '只能删除已上传的角色；本地模型请在 models 目录管理')
    data.uploaded = data.uploaded.filter(i => i.id !== id)
    if (data.activeId === id) data.activeId = DEFAULT_ID
    const path = join(root(), item.file)
      let identity = {}
      try { const stat = await lstat(path); identity = { ino: stat.ino, dev: stat.dev, ctimeMs: stat.ctimeMs } } catch (e) { if (e.code !== 'ENOENT') throw e }
      data.pendingDeletes.push({ ...item, ...identity }); await save(data)
    const warnings = await drainDeletes(root(), data, save)
    cache.delete(join(root(), item.file)); return { ok: true, pendingCleanup: data.pendingDeletes.length, warnings }
  }) }
  async function upload(req, filename) { return withUploadSlot(async () => {
    if (typeof filename !== 'string' || filename !== basename(filename) || /[\\/\x00-\x1f]/.test(filename) || !/\.(vrm|glb)$/i.test(filename)) throw new AvatarError(415, '请选择 VRM 或自包含 GLB 模型')
    if (Number(req.headers['content-length']) > MAX_MODEL_BYTES) throw new AvatarError(413, '模型不能超过 50 MB')
    const dir = await directory(), id = randomUUID(), path = join(dir, id + '.' + process.pid + '.upload'), file = id + extname(filename).toLowerCase()
    let bytes = 0
    const limit = new Transform({ transform(chunk, _, done) { bytes += chunk.length; done(bytes > MAX_MODEL_BYTES ? new AvatarError(413, '模型不能超过 50 MB') : null, chunk) } })
    const abort = () => limit.destroy(new AvatarError(400, '上传已取消或中断'))
    req.once('aborted', abort); req.once('error', abort); req.pipe(limit)
    try {
      await pipeline(limit, createWriteStream(path, { flags: 'wx', mode: 0o600 }))
      if (!req.complete || bytes === 0) throw new AvatarError(400, '上传不完整')
      const info = await inspectResource(path, 'avatar', filename)
      return await exclusive(async () => {
        const before = await catalog(), data = before.data
        if (!data.activeId) data.activeId = before.activeId
        if (data.uploaded.length >= 50) throw new AvatarError(409, '最多保存 50 个上传角色，请先删除不用的角色')
        const recovered = await reconcileResources(root(), new Set([...data.uploaded, ...data.pendingDeletes].map(a => a.file)))
        if ([...data.uploaded, ...data.pendingDeletes].reduce((sum, item) => sum + (item.bytes || 0), 0) + recovered.extraBytes + bytes > 1024 ** 3) throw new AvatarError(413, '角色存储超过 1 GB，请先清理不用的角色')
        await rename(path, join(dir, file))
        const item = { id, file, name: basename(filename, extname(filename)).slice(0, 100), bytes }
        data.uploaded.push(item)
        await save(data) // Preserve the uploaded file if commit acknowledgement fails.
        return { ...info, id, name: item.name, source: 'uploaded' }
      })
    } finally {
      req.unpipe(limit); req.off('aborted', abort); req.off('error', abort); if (!req.complete) req.resume()
      await unlink(path).catch(e => { if (e.code !== 'ENOENT') throw e })
    }
  }) }
  async function serve(req, res, id, version) {
    const c = await exclusive(catalog), path = c.paths.get(id), item = c.items.find(i => i.id === id)
    if (!path || !item) throw new AvatarError(404, '找不到模型文件')
    if (version && item.version !== version) throw new AvatarError(409, '模型已变化，请刷新角色列表')
    // Stream from a no-follow descriptor; the path never comes from a client filename.
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size !== item.bytes) throw new AvatarError(409, '模型已变化，请刷新')
      res.setHeader('content-type', 'model/gltf-binary'); res.setHeader('content-length', stat.size)
      res.setHeader('cache-control', 'private, no-cache'); res.setHeader('etag', '"' + item.version + '"'); res.setHeader('x-content-type-options', 'nosniff')
      if (req.method === 'HEAD') { res.end(); return }
      await pipeline(handle.createReadStream({ autoClose: false }), res)
    } finally { await handle.close() }
  }
  const restoreAnimation = () => exclusive(async () => { const data = await state(); data.hiddenAnimations = []; await save(data); return { ok: true } })
  return { list, has, select, rename: renameDisplay, remove, upload, serve, restoreAnimation }
}
