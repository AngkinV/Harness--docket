import { Worker } from 'node:worker_threads'
import { HttpError } from './http.js'

let running = 0
const waiting = []
export function inspectResource(path, kind, filename = path) {
  if (waiting.length >= 16) return Promise.reject(new HttpError(429, '资源校验繁忙，请稍后重试'))
  return new Promise((resolve, reject) => {
    const start = () => {
      running++
      let worker
      try { worker = new Worker(new URL('./resource-worker.js', import.meta.url), { execArgv: [], workerData: { path, kind, filename }, resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 8 } }) } catch (e) { running--; reject(e); waiting.shift()?.(); return }
      let settled = false
      const finish = (error, value) => {
        if (settled) return
        settled = true; clearTimeout(timer)
        void worker.terminate().finally(() => { running--; waiting.shift()?.() })
        if (error) reject(error); else resolve(value)
      }
      const timer = setTimeout(() => finish(new HttpError(422, '资源校验超时，请精简模型或动作')), 20000)
      worker.once('message', result => result.error ? finish(new HttpError(result.status || 422, result.error)) : finish(null, result.value))
      worker.once('error', () => finish(new HttpError(422, '资源过于复杂或无法解析，请精简后重试')))
      worker.once('exit', code => { if (!settled) finish(new HttpError(422, '资源校验未完成（' + code + '）')) })
    }
    if (running < 2) start(); else waiting.push(start)
  })
}

let uploads = 0
export async function withUploadSlot(action) {
  if (uploads >= 4) throw new HttpError(429, '同时上传的文件过多，请等待当前上传完成')
  uploads++
  try { return await action() } finally { uploads-- }
}
