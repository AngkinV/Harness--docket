import { randomUUID, createHash } from 'node:crypto'
import { mkdir, open, lstat, writeFile, rename, unlink, readdir } from 'node:fs/promises'
import { constants, createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { withStoreLock, readState, atomicState, readFileBounded } from './storage.js'
import { schema, drainDeletes, reconcileResources } from './resource-state.js'
import { inspectResource, withUploadSlot } from './resource-inspector.js'
import { validateFbxEnvelope } from './fbx-validation.js'
import { join, resolve, basename, extname } from 'node:path'
import { AvatarError } from './avatar-validation.js'

const fail = (message, status = 422) => { throw new AvatarError(status, message) }
export function inspectAsset(bytes, filename) {
  const ext = extname(filename).toLowerCase()
  if (ext === '.fbx') {
    if (bytes.length > 50 * 1024 ** 2) fail('动作不能超过 50 MB', 413)
    if (!bytes.subarray(0, 23).equals(Buffer.from('Kaydara FBX Binary  \0\x1a\0')) && !/FBXHeaderExtension\s*:/.test(bytes.subarray(0, 8192).toString())) fail('不是有效的 FBX 文件')
    try { validateFbxEnvelope(bytes) } catch (e) { fail(e.message) }
    return { kind: 'motion', mime: 'application/octet-stream' }
  }
  if (bytes.length > 5 * 1024 ** 2) fail('贴纸不能超过 5 MB', 413)
  let mime
  if (ext === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png'
  if (ext === '.gif' && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) mime = 'image/gif'
  if (ext === '.webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp'
  if (!mime) fail('请选择有效的 FBX、PNG、WebP 或 GIF 文件')
  let width = 0, height = 0
  if (mime === 'image/png' && bytes.length >= 24) { width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20) }
  if (mime === 'image/gif' && bytes.length >= 10) { width = bytes.readUInt16LE(6); height = bytes.readUInt16LE(8) }
  if (mime === 'image/webp' && bytes.length >= 30) {
    const chunk = bytes.toString('ascii', 12, 16)
    if (chunk === 'VP8X') { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3) }
    else if (chunk === 'VP8 ') { width = bytes.readUInt16LE(26) & 16383; height = bytes.readUInt16LE(28) & 16383 }
    else if (chunk === 'VP8L' && bytes[20] === 47) { const packed = bytes.readUInt32LE(21); width = (packed & 16383) + 1; height = ((packed >>> 14) & 16383) + 1 }
  }
  if (!width || !height || width > 2048 || height > 2048) fail('贴纸尺寸无效或超过 2048 × 2048')
  return { kind: 'sticker', mime }
}
export function validateProfile(input, assets) {
  if (!input || typeof input !== 'object') fail('设置无效')
  const text = (v, max) => typeof v === 'string' && v.length <= max ? v : fail('设置文本过长或无效')
  const number = (v, low, high) => Number.isFinite(v) && v >= low && v <= high ? v : fail('设置数值超出范围')
  const binding = v => {
    if (!v) return null
    const asset = assets.find(a => a.id === v.id && a.kind === 'motion')
    if (!asset) fail('动作已被删除，请重新选择')
    if (!Number.isInteger(v.clip) || v.clip < 0 || !asset.clips?.[v.clip]) fail('动作片段无效，请重新选择')
    return { id: v.id, clip: v.clip }
  }
  if (!Array.isArray(input.interactions) || input.interactions.length < 1 || input.interactions.length > 12) fail('请保留 1–12 个互动')
  const ids = new Set()
  const interactions = input.interactions.map(i => {
    if (!i || typeof i !== 'object' || typeof i.id !== 'string' || !i.id.trim() || ids.has(i.id)) fail('互动标识不能为空或重复')
    ids.add(i.id)
    const sticker = text(i.sticker, 100)
    if (!['heart', 'question', 'music', 'none'].includes(sticker) && !assets.some(a => a.id === sticker && a.kind === 'sticker')) fail('贴纸已被删除')
    return { id: text(i.id, 80), name: text(i.name, 40), enabled: !!i.enabled, action: ['wave', 'head', 'idle'].includes(i.action) ? i.action : 'wave', motion: binding(i.motion), expression: text(i.expression, 80), intensity: number(i.intensity, 0, 1), sticker, size: number(i.size, 32, 128), duration: number(i.duration, 2, i.motion ? 600 : 4), text: text(i.text, 80) }
  })
  if (!interactions.some(i => i.enabled)) fail('至少启用一个互动')
  if (input.mode === 'fixed' && !interactions.some(i => i.enabled && i.id === input.fixed)) fail('固定互动必须存在且已启用')
  if (input.gaze !== undefined && !['off', 'gentle', 'noticeable'].includes(input.gaze)) fail('目光设置无效')
  let attachedMenu
  if (input.attachedMenu !== undefined) {
    const m = input.attachedMenu
    if (!m || !['auto', 'left', 'right'].includes(m.side)) fail('贴身菜单位置无效')
    attachedMenu = { side: m.side, height: number(m.height, -.15, .15), gap: number(m.gap, 2, 10) }
  }
  const daily = input.daily === undefined ? [] : input.daily
  if (!Array.isArray(daily) || daily.length > 12 || new Set(daily.map(e => e?.id)).size !== daily.length) fail('日常候选无效')
  const dailyChoices = daily.map(e => { if (!e || !ids.has(e.id)) fail('日常互动不存在'); return { id: e.id, weight: number(e.weight, 0, 100), cooldown: number(e.cooldown, 10, 600) } })
  const events = {}
  for (const state of ['thinking', 'working', 'waiting', 'success', 'error']) {
    const id = input.events?.[state]
    if (id) { if (!ids.has(id)) fail('会话状态互动不存在'); events[state] = id }
  }
  return { ...(input.gaze === undefined ? {} : { gaze: input.gaze }), ...(attachedMenu ? { attachedMenu } : {}), ...(input.dailyEnabled === undefined ? {} : { dailyEnabled: !!input.dailyEnabled }), ...(input.daily === undefined ? {} : { daily: dailyChoices }), ...(input.events === undefined ? {} : { events }), roaming: !!input.roaming, speed: number(input.speed, 15, 70), walk: binding(input.walk), idle: binding(input.idle), mode: input.mode === 'fixed' ? 'fixed' : 'random', fixed: text(input.fixed || '', 80), interactions }
}
export function createCompanionStore(homeDir, motionsDir = () => null, isAvatar = async id => typeof id === 'string' && !!id && !['__proto__', 'constructor', 'prototype'].includes(id)) {
  const root = () => join(resolve(homeDir()), 'harness-docket', 'companion')
  const exclusive = async fn => { await directory(); return withStoreLock(root(), fn) }
  async function directory() {
    for (const path of [resolve(homeDir()), join(resolve(homeDir()), 'harness-docket'), root()]) {
      await mkdir(path, { recursive: true }); const stat = await lstat(path)
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('互动资源目录不可用', 409)
    }
    return root()
  }
  const read = readFileBounded
  const save = data => atomicState(join(root(), 'state.json'), { ...data, schemaVersion: 1 })
  async function state() {
    const data = await readState(join(await directory(), 'state.json'), { assets: [], profiles: {}, revisions: {}, pendingDeletes: [] }, value => {
      schema(value)
      if (!Array.isArray(value.assets) || !value.profiles || Array.isArray(value.profiles) || value.assets.some(a => !/^[a-f0-9-]{36}\.(fbx|png|webp|gif)$/.test(a.file))) throw new Error('invalid resource state')
    })
    data.revisions ||= {}; data.pendingDeletes ||= []
    if (data.archivedProfiles) {
      for (const [id, value] of Object.entries(data.archivedProfiles)) await archive(id, value)
      delete data.archivedProfiles; await save(data)
    }
    const errors = await drainDeletes(root(), data, save)
    let changed = false
    for (const asset of data.assets) if (asset.kind === 'motion' && !asset.clips) {
      try { Object.assign(asset, await inspectResource(join(root(), asset.file), 'motion')); changed = true }
      catch (e) { errors.push({ name: asset.name, error: e.message }) }
    }
    if (changed) await save(data)
    return { data, errors }
  }
  async function archive(id, value) {
    const dir = join(root(), 'profile-archives'); await mkdir(dir, { recursive: true })
    const stat = await lstat(dir); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('配置归档目录不可用', 409)
    await atomicState(join(dir, createHash('sha256').update(id).digest('hex') + '.json'), { id, ...value })
  }
  // Import each distinct local file once. Library deletion removes only our copy;
  // remembered hashes prevent deleted motions from reappearing on every refresh.
  const fingerprints = new Map()
  async function importMotions(data) {
    const directory = motionsDir()
    if (!directory) return []
    const recovered = await reconcileResources(root(), new Set([...data.assets, ...data.pendingDeletes].map(a => a.file)))
    const errors = [...recovered.errors]
    let entries
    try {
      const stat = await lstat(directory)
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('本地动作目录不可用', 409)
      entries = (await readdir(directory)).filter(f => /\.fbx$/i.test(f)).sort()
    } catch (e) { if (e.code === 'ENOENT') return []; return [{ name: 'motions', error: e.message }] }
    for (const path of fingerprints.keys()) if (!entries.includes(basename(path))) fingerprints.delete(path)
    let manifest = { motions: [] }
    try { manifest = JSON.parse((await read(join(directory, 'motions.json'), 1024 ** 2)).toString()); if (!Array.isArray(manifest.motions)) throw new Error('清单缺少 motions 数组') }
    catch (e) { if (e.code !== 'ENOENT') errors.push({ name: 'motions.json', error: '动作清单无效，已按文件名加载' }); manifest = { motions: [] } }
    const metadata = new Map(manifest.motions.filter(m => m && typeof m.file === 'string').map(m => [m.file, m]))
    entries.sort((a, b) => (metadata.get(a)?.key === manifest.default ? -1 : metadata.get(b)?.key === manifest.default ? 1 : 0))
    data.imported ||= []
    let changed = false
    for (const file of entries.slice(0, 100)) {
      try {
        const path = join(directory, file), stat = await lstat(path)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50 * 1024 ** 2) fail('动作必须是 50 MB 内的普通文件')
        const signature = [stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
        let fingerprint = fingerprints.get(path), bytes
        if (fingerprint?.signature !== signature) {
          bytes = await read(path, 50 * 1024 ** 2)
          fingerprint = { signature, hash: createHash('sha256').update(file).update(bytes).digest('hex') }
          fingerprints.set(path, fingerprint)
        }
        if (data.imported.includes(fingerprint.hash)) continue
        if (data.assets.length >= 100 || [...data.assets, ...data.pendingDeletes].reduce((sum, a) => sum + a.bytes, 0) + recovered.extraBytes + stat.size > 512 * 1024 ** 2) fail('资源库已满，请删除不用的资源')
        bytes ||= await read(path, 50 * 1024 ** 2)
        const info = { ...inspectAsset(bytes, file), ...await inspectResource(path, 'motion') }, meta = metadata.get(file), id = randomUUID(), stored = id + '.fbx'
        await writeFile(join(root(), stored), bytes, { flag: 'wx', mode: 0o600 })
        data.assets.push({ id, file: stored, name: String(meta?.label || basename(file, extname(file))).slice(0, 80), bytes: bytes.length, ...info, source: 'local', key: typeof meta?.key === 'string' ? meta.key : basename(file, extname(file)) })
        data.imported.push(fingerprint.hash)
        if (meta?.key === manifest.default) data.defaultMotion = id
        changed = true
      } catch (e) { errors.push({ name: file, error: e instanceof AvatarError ? e.message : '无法读取动作文件' }) }
    }
    if (changed) await save(data)
    return errors
  }
  const publicState = data => ({ assets: data.assets.map(({ file, ...asset }) => asset), profiles: data.profiles, revisions: data.revisions })
  return {
    list() { return exclusive(async () => {
      const { data, errors } = await state()
      let archived = false
      for (const id of Object.keys(data.profiles)) if (/^[a-f0-9-]{36}$/.test(id) && !await isAvatar(id)) {
        await archive(id, { profile: data.profiles[id], archivedAt: Date.now() }); delete data.profiles[id]; delete data.revisions[id]; archived = true
      }
      if (archived) await save(data)
      errors.push(...await importMotions(data))
      const recovered = await reconcileResources(root(), new Set([...data.assets, ...data.pendingDeletes].map(a => a.file)))
      errors.push(...recovered.errors)
      return { ...publicState(data), defaults: { walk: data.assets.some(a => a.id === data.defaultMotion) ? { id: data.defaultMotion, clip: 0 } : null }, errors }
    }) },
    async upload(req, filename) { return withUploadSlot(async () => {
      if (typeof filename !== 'string' || basename(filename) !== filename || /[\\/\x00-\x1f]/.test(filename) || !/\.(fbx|png|webp|gif)$/i.test(filename)) fail('请选择 FBX 或 PNG/WebP/GIF 文件', 415)
      const limit = /\.fbx$/i.test(filename) ? 50 * 1024 ** 2 : 5 * 1024 ** 2
      if (Number(req.headers['content-length']) > limit) fail('文件超过大小限制', 413)
      const staging = join(await directory(), randomUUID() + '.' + process.pid + '.upload')
      let length = 0
      const bounded = new Transform({ transform(chunk, _, done) { length += chunk.length; done(length > limit ? new AvatarError(413, '文件超过大小限制') : null, chunk) } })
      const abort = () => bounded.destroy(new AvatarError(400, '上传已中断'))
      req.once('aborted', abort); req.once('error', abort); req.pipe(bounded)
      try {
        await pipeline(bounded, createWriteStream(staging, { flags: 'wx', mode: 0o600 }))
        if (!length || !req.complete) fail('上传不完整', 400)
        const info = inspectAsset(await read(staging, limit), filename)
        if (info.kind === 'motion') Object.assign(info, await inspectResource(staging, 'motion'))
        return await exclusive(async () => {
          const { data } = await state()
          const recovered = await reconcileResources(root(), new Set([...data.assets, ...data.pendingDeletes].map(a => a.file)))
          if (data.assets.length >= 100 || [...data.assets, ...data.pendingDeletes].reduce((n, a) => n + a.bytes, 0) + recovered.extraBytes + length > 512 * 1024 ** 2) fail('资源库已满，请先清理不用的资源', 413)
          const id = randomUUID(), file = id + extname(filename).toLowerCase()
          const asset = { id, file, name: basename(filename, extname(filename)).slice(0, 80), bytes: length, ...info }
          await rename(staging, join(root(), file)); data.assets.push(asset)
          await save(data) // Preserve the uploaded file if commit acknowledgement fails.
          return publicState(data).assets.find(a => a.id === id)
        })
      } finally {
        req.unpipe(bounded); req.off('aborted', abort); req.off('error', abort); if (!req.complete) req.resume()
        await unlink(staging).catch(e => { if (e.code !== 'ENOENT') throw e })
      }
    }) },
    update(id, profile, expectedRevision) { return exclusive(async () => {
      if (['__proto__', 'constructor', 'prototype'].includes(id)) fail('角色标识无效')
      if (!await isAvatar(id)) fail('角色不存在，请刷新角色列表', 404)
      const { data } = await state()
      if (!Number.isInteger(expectedRevision)) fail('请刷新设置后保存', 428)
      if (expectedRevision !== (data.revisions[id] || 0)) fail('设置已被其他页面更改，草稿已保留；请比较后重新载入', 409)
      if (!Object.hasOwn(data.profiles, id) && Object.keys(data.profiles).length >= 100) fail('角色设置数量已达上限')
      data.profiles[id] = validateProfile(profile, data.assets); data.revisions[id] = expectedRevision + 1
      await save(data); return { ok: true, revision: data.revisions[id] }
    }) },
    rename(id, name) { return exclusive(async () => {
      if (typeof name !== 'string' || !name.trim() || name.length > 80) fail('请输入 1–80 字的名称')
      const { data } = await state(), item = data.assets.find(a => a.id === id); if (!item) fail('资源不存在', 404)
      item.name = name.trim(); await save(data); return { ok: true }
    }) },
    remove(id) { return exclusive(async () => {
      const { data } = await state(), item = data.assets.find(a => a.id === id); if (!item) fail('资源不存在', 404)
      data.assets = data.assets.filter(a => a.id !== id)
      for (const [profileId, p] of Object.entries(data.profiles)) {
        const before = JSON.stringify(p)
        if (p.walk?.id === id) p.walk = null; if (p.idle?.id === id) p.idle = null
        for (const i of p.interactions) { if (i.motion?.id === id) { i.motion = null; i.duration = Math.min(4, i.duration) }; if (i.sticker === id) i.sticker = 'heart' }
        if (JSON.stringify(p) !== before) data.revisions[profileId] = (data.revisions[profileId] || 0) + 1
      }
      const path = join(root(), item.file)
      let identity = {}
      try { const stat = await lstat(path); identity = { ino: stat.ino, dev: stat.dev, ctimeMs: stat.ctimeMs } } catch (e) { if (e.code !== 'ENOENT') throw e }
      data.pendingDeletes.push({ ...item, ...identity }); await save(data)
      const warnings = await drainDeletes(root(), data, save); return { ok: true, pendingCleanup: data.pendingDeletes.length, warnings }
    }) },
    archiveProfile(id) { return exclusive(async () => {
      const { data } = await state()
      if (Object.hasOwn(data.profiles, id)) {
        await archive(id, { profile: data.profiles[id], archivedAt: Date.now() })
        delete data.profiles[id]; delete data.revisions[id]; await save(data)
      }
    }) },
    async serve(req, res, id) {
      const { item, handle } = await exclusive(async () => {
        const { data } = await state(), item = data.assets.find(a => a.id === id)
        if (!item) fail('资源不存在', 404)
        return { item, handle: await open(join(root(), item.file), constants.O_RDONLY | constants.O_NOFOLLOW) }
      })
      try {
        const stat = await handle.stat(); if (!stat.isFile() || stat.size !== item.bytes) fail('资源文件已变化', 409)
        res.setHeader('content-type', item.mime); res.setHeader('content-length', stat.size); res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('cache-control', 'private, max-age=3600')
        if (req.method === 'HEAD') res.end()
        else await pipeline(handle.createReadStream({ autoClose: false }), res)
      } finally { await handle.close() }
    },
  }
}
