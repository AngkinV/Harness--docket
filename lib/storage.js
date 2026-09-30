import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { constants, openSync, closeSync, writeFileSync, readFileSync, lstatSync, unlinkSync, renameSync, fsyncSync, existsSync } from 'node:fs'
import { mkdir, open, unlink, lstat, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { HttpError } from './http.js'

const nofollow = constants.O_NOFOLLOW || 0
const ownHost = hostname()
function deadOwner(lock) {
  try {
    const fd = openSync(lock, constants.O_RDONLY | nofollow)
    let owner
    try { owner = JSON.parse(readFileSync(fd, 'utf8')) } finally { closeSync(fd) }
    if (owner.host !== ownHost || !Number.isInteger(owner.pid) || owner.pid <= 0) return false
    try { process.kill(owner.pid, 0); return false } catch (e) { return e.code === 'ESRCH' }
  } catch { return false }
}
function tryLock(lock) {
  let fd
  try { fd = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | nofollow, 0o600) }
  catch (e) {
    if (e.code !== 'EEXIST') throw e
    // Never steal a live writer's lock, even if its operation is slow.
    let stat
    try { stat = lstatSync(lock) } catch (e) { if (e.code === 'ENOENT') return null; throw e }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new HttpError(409, '存储锁不可用，请保留数据')
    if (deadOwner(lock)) {
      // Rename, rather than unlink, to avoid deleting a later writer's lock.
      // Competing recovery uses an exclusive recovery lock.
      const recovery = lock + '.recover'
      let guard
      try {
        guard = openSync(recovery, 'wx', 0o600)
        writeFileSync(guard, JSON.stringify({ pid: process.pid, host: ownHost })); fsyncSync(guard)
        if (lstatSync(lock).ino === stat.ino && deadOwner(lock)) {
          const retired = lock + '.retired-' + randomUUID(); renameSync(lock, retired); unlinkSync(retired)
        }
      } catch (error) {
        if (!['EEXIST', 'ENOENT'].includes(error.code)) throw error
        if (error.code === 'EEXIST' && deadOwner(recovery)) { try { unlinkSync(recovery) } catch (e) { if (e.code !== 'ENOENT') throw e } }
      }
      finally { if (guard !== undefined) { closeSync(guard); try { unlinkSync(recovery) } catch (e) { if (e.code !== 'ENOENT') throw e } } }
    }
    return null
  }
  const owner = { pid: process.pid, host: ownHost, token: randomUUID() }
  try { writeFileSync(fd, JSON.stringify(owner)); fsyncSync(fd) } catch (e) { closeSync(fd); unlinkSync(lock); throw e }
  closeSync(fd)
  return () => {
    // A replaced lock is never ours to remove.
    const fd = openSync(lock, constants.O_RDONLY | nofollow)
    let current
    try { current = JSON.parse(readFileSync(fd, 'utf8')) } finally { closeSync(fd) }
    if (current.token === owner.token) unlinkSync(lock)
  }
}

export async function withStoreLock(directory, action) {
  await mkdir(directory, { recursive: true })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new HttpError(409, '存储目录不可用')
  const lock = join(directory, '.write.lock'), until = Date.now() + 15000
  let release
  while (!(release = tryLock(lock))) {
    if (Date.now() >= until) throw new HttpError(409, '另一个操作正在保存，请稍后重试')
    await delay(15 + Math.floor(Math.random() * 20))
  }
  try { return await action() } finally { release() }
}

export function withStoreLockSync(directory, action) {
  const release = tryLock(join(directory, '.write.lock'))
  if (!release) throw new HttpError(409, '另一个操作正在保存，请稍后重试')
  try { return action() } finally { release() }
}

export async function readFileBounded(path, maxBytes) {
  const file = await open(path, constants.O_RDONLY | nofollow)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > maxBytes) throw new HttpError(409, '文件无效或超过大小限制')
    const data = await file.readFile()
    if (data.length > maxBytes) throw new HttpError(409, '文件读取期间发生变化')
    return data
  } finally { await file.close() }
}

// Call under the store lock. Preserve the previous committed state and flush
// before rename. Unknown/new schemas must be rejected by the caller's validator.
export async function readState(path, defaults, validate, maxBytes = 2 * 1024 ** 2) {
  try {
    const data = JSON.parse((await readFileBounded(path, maxBytes)).toString('utf8'))
    validate(data); return data
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(defaults)
    if (error.code === 'UNSUPPORTED_SCHEMA') throw error
    let backup
    try { backup = JSON.parse((await readFileBounded(path + '.backup', maxBytes)).toString('utf8')); validate(backup) }
    catch { throw new HttpError(409, '记录损坏，且没有可用备份；请保留数据并恢复备份') }
    // Keep the damaged file for diagnosis; never discard unique bytes.
    await rename(path, path + '.corrupt-' + randomUUID())
    await atomicState(path, backup, false)
    return backup
  }
}

export async function atomicState(path, value, backup = true) {
  const write = async (target, bytes) => {
    const temp = target + '.' + randomUUID() + '.tmp'
    const handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | nofollow, 0o600)
    try {
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); await rename(temp, target)
    } finally { await handle.close().catch(() => {}); await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e }) }
  }
  if (backup) {
    try { await write(path + '.backup', await readFileBounded(path, 8 * 1024 ** 2)) }
    catch (e) { if (e.code !== 'ENOENT') throw e }
  }
  await write(path, JSON.stringify(value))
  const dir = await open(dirname(path), constants.O_RDONLY)
  try { await dir.sync() } finally { await dir.close() }
}

export function atomicStateSync(path, value, backup = true) {
  const write = (target, bytes) => {
    const tmp = target + '.' + randomUUID() + '.tmp'; const fd = openSync(tmp, 'wx', 0o600)
    try { writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); renameSync(tmp, target) }
    catch (e) { try { closeSync(fd) } catch {}; throw e }
    finally { if (existsSync(tmp)) unlinkSync(tmp) }
  }
  if (backup && existsSync(path)) {
    const fd = openSync(path, constants.O_RDONLY | nofollow)
    try { write(path + '.backup', readFileSync(fd)) } finally { closeSync(fd) }
  }
  write(path, JSON.stringify(value))
}

export function readStateSync(path, defaults, validate) {
  const read = target => {
    const fd = openSync(target, constants.O_RDONLY | nofollow)
    try {
      const stat = lstatSync(target)
      if (!stat.isFile() || stat.size > 8 * 1024 ** 2) throw new Error('invalid state file')
      const value = JSON.parse(readFileSync(fd, 'utf8')); validate(value); return value
    } finally { closeSync(fd) }
  }
  try { return read(path) } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(defaults)
    if (error.code === 'UNSUPPORTED_SCHEMA') throw error
    let value
    try { value = read(path + '.backup') } catch { throw new HttpError(409, '记录损坏，且没有可用备份；请保留数据并恢复备份') }
    renameSync(path, path + '.corrupt-' + randomUUID()); atomicStateSync(path, value, false); return value
  }
}
