export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

// Decode once, after receiving all bytes. TCP chunks need not end on UTF-8 boundaries.
export async function readJsonBody(req, maxBytes = 16384) {
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, '需要 JSON 请求')
  if (Number(req.headers['content-length']) > maxBytes) throw new HttpError(413, '请求过大')
  const chunks = []; let length = 0
  const stream = req.iterator ? req.iterator({ destroyOnReturn: false }) : req
  try { for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += bytes.length
    if (length > maxBytes) throw new HttpError(413, '请求过大')
    chunks.push(bytes)
  } } catch (error) { req.resume?.(); throw error instanceof HttpError ? error : new HttpError(400, '请求已中断') }
  if (req.complete === false || req.aborted) throw new HttpError(400, '请求不完整')
  try {
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length)))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('object required')
    return data
  } catch { throw new HttpError(400, '请求格式或 UTF-8 编码无效') }
}
