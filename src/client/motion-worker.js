import { parseMotion } from './motion-core.js'
import { packMotion } from './motion-transfer.js'
globalThis.onmessage = ({ data }) => {
  try {
    const result = packMotion(parseMotion(data))
    const buffers = [...new Set(result.clips.flatMap(c => c.tracks.flatMap(t => [t.times.buffer, t.values.buffer])))]
    globalThis.postMessage({ result }, buffers)
  } catch (e) { globalThis.postMessage({ error: e.message || 'FBX 无法解析' }) }
}
