import { parentPort, workerData } from 'node:worker_threads'
import { readFileBounded } from './storage.js'
import { validateAvatar } from './avatar-validation.js'
import { parseMotion } from './client/motion-core.js'

try {
  const bytes = await readFileBounded(workerData.path, 50 * 1024 ** 2)
  let value
  if (workerData.kind === 'avatar') value = validateAvatar(bytes, workerData.filename)
  else {
    const data = parseMotion(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    value = { clips: data.clips.map((clip, index) => ({ index, name: clip.name, duration: clip.duration })) }
  }
  parentPort.postMessage({ value })
} catch (error) { parentPort.postMessage({ error: error.message, status: error.status || 422 }) }
