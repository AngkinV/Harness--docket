export { parseMotion, retargetMotion, humanName, humanBones } from './motion-core.js'
import { parseMotion } from './motion-core.js'
import { unpackMotion } from './motion-transfer.js'
export const assetURL = id => '/harness-docket/companion/asset?id=' + encodeURIComponent(id)
const cache = new Map(), pending = new Map()
let cacheBytes = 0, workers = 0
const queue = []
const aborted = () => new DOMException('已取消', 'AbortError')
async function parseAsync(buffer, signal) {
  if (signal?.aborted) throw aborted()
  if (typeof Worker === 'undefined') return parseMotion(buffer)
  if (queue.length >= 16) throw new Error('动作解析繁忙，请稍后重试')
  return new Promise((resolve, reject) => {
    const start = () => {
      if (signal?.aborted) { reject(aborted()); queue.shift()?.(); return }
      workers++
      let worker, timer, ended = false
      const finish = (error, result) => {
        if (ended) return
        ended = true; clearTimeout(timer); worker?.terminate(); signal?.removeEventListener('abort', cancel)
        workers--; queue.shift()?.()
        if (error) reject(error); else resolve(result)
      }
      const cancel = () => finish(aborted())
      try {
        worker = new Worker('/harness-docket/motion-worker.js?v=' + __HARNESS_DOCKET_VERSION__, { type: 'module' })
        signal?.addEventListener('abort', cancel, { once: true })
        timer = setTimeout(() => finish(new Error('动作解析超时，请精简后重试')), 20000)
        worker.onmessage = ({ data }) => {
          try { data.error ? finish(new Error(data.error)) : finish(null, unpackMotion(data.result)) } catch (e) { finish(e) }
        }
        worker.onerror = () => finish(new Error('动作解析失败，请精简后重试'))
        worker.postMessage(buffer, [buffer])
      } catch (e) { finish(e) }
    }
    if (workers < 2) start(); else queue.push(start)
  })
}
function remember(id, parsed) {
  const bytes = parsed.clips.reduce((n, c) => n + c.tracks.reduce((sum, t) => sum + t.times.byteLength + t.values.byteLength, 0), 0)
  while (cache.size && (cacheBytes + bytes > 64 * 1024 ** 2 || cache.size >= 12)) forgetMotionAsset(cache.keys().next().value)
  if (bytes <= 64 * 1024 ** 2) { cache.set(id, { parsed, bytes }); cacheBytes += bytes }
}
export function forgetMotionAsset(id) {
  const entry = cache.get(id); if (entry) { cacheBytes -= entry.bytes; cache.delete(id) }
}
export async function motionAsset(id, signal) {
  if (signal?.aborted) throw aborted()
  if (cache.has(id)) { const entry = cache.get(id); cache.delete(id); cache.set(id, entry); return entry.parsed }
  let job = pending.get(id)
  if (!job) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000)
    job = { controller, users: 0, promise: (async () => {
      const response = await fetch(assetURL(id), { signal: controller.signal })
      if (!response.ok) throw new Error('动作读取失败，请重新上传或选择其他动作')
      const parsed = await parseAsync(await response.arrayBuffer(), controller.signal)
      remember(id, parsed); return parsed
    })().finally(() => { clearTimeout(timer); pending.delete(id) }) }
    pending.set(id, job)
  }
  job.users++
  return new Promise((resolve, reject) => {
    let ended = false
    const finish = (error, value) => { if (ended) return; ended = true; signal?.removeEventListener('abort', cancel); if (--job.users === 0) job.controller.abort(); error ? reject(error) : resolve(value) }
    const cancel = () => finish(aborted())
    signal?.addEventListener('abort', cancel, { once: true })
    job.promise.then(value => finish(null, value), error => finish(error))
  })
}
export async function inspectMotion(buffer, signal) { const data = await parseAsync(buffer, signal); return data.clips.map((c, index) => ({ index, name: c.name || '动作 ' + (index + 1), duration: c.duration })) }
