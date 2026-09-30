import { readdir, lstat, mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { HttpError } from './http.js'

const owned = /^[a-f0-9-]{36}\.(vrm|glb|fbx|png|webp|gif)$/
export function schema(data) {
  if (data.schemaVersion !== undefined && data.schemaVersion !== 1) {
    const error = new HttpError(409, '数据由其他版本写入，请使用对应版本打开，未更改原记录')
    error.code = 'UNSUPPORTED_SCHEMA'; throw error
  }
  if (data.pendingDeletes !== undefined && (!Array.isArray(data.pendingDeletes) || data.pendingDeletes.some(item => !item || !owned.test(item.file)))) throw new Error('invalid cleanup journal')
}

// A committed deletion remains retryable until the disk operation succeeds.
export async function drainDeletes(dir, data, save) {
  const warnings = [], pending = []
  for (const item of data.pendingDeletes || []) {
    try {
      const path = join(dir, item.file), stat = await lstat(path)
      if (item.ino !== undefined && (stat.ino !== item.ino || stat.dev !== item.dev || stat.size !== item.bytes || stat.ctimeMs !== item.ctimeMs)) throw new Error('文件内容或身份发生变化，已保留待检查')
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('文件类型发生变化，已保留待检查')
      await unlink(path)
    } catch (e) { if (e.code !== 'ENOENT') { pending.push(item); warnings.push({ name: item.name || item.id, error: '磁盘清理待重试：' + e.message }) } }
  }
  if (pending.length !== (data.pendingDeletes || []).length) { data.pendingDeletes = pending; await save(data) }
  return warnings
}

// Only generated resource filenames are considered; unknown user files remain.
// Unreferenced files are quarantined, never automatically destroyed.
export async function reconcileResources(dir, referenced, now = Date.now()) {
  const quarantine = join(dir, '.orphans'), errors = []; let extraBytes = 0
  for (const name of await readdir(dir)) {
    const staging = /^[a-f0-9-]{36}\.(\d+)\.upload$/.exec(name)
    if ((!owned.test(name) && !staging) || referenced.has(name)) continue
    if (staging) { try { process.kill(Number(staging[1]), 0); continue } catch (e) { if (e.code !== 'ESRCH') continue } }
    const path = join(dir, name), stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) continue
    if (now - stat.mtimeMs < 60 * 60 * 1000) { extraBytes += stat.size; continue }
    await mkdir(quarantine, { recursive: true })
    const qstat = await lstat(quarantine)
    if (!qstat.isDirectory() || qstat.isSymbolicLink()) throw new HttpError(409, '资源隔离目录不可用')
    const target = join(quarantine, name)
    try { await lstat(target); extraBytes += stat.size; continue } catch (e) { if (e.code !== 'ENOENT') throw e }
    await rename(path, target)
  }
  try {
    const qstat = await lstat(quarantine)
    if (!qstat.isDirectory() || qstat.isSymbolicLink()) throw new HttpError(409, '资源隔离目录不可用')
    for (const name of await readdir(quarantine)) {
      const stat = await lstat(join(quarantine, name))
      if (stat.isFile() && !stat.isSymbolicLink()) extraBytes += stat.size
    }
    if (extraBytes) errors.push({ name: '资源恢复', error: '检测到未登记资源，已保留在 .orphans；恢复或移出后可释放资源额度' })
  } catch (e) { if (e.code !== 'ENOENT') throw e }
  return { extraBytes, errors }
}
