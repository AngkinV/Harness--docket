const MAX_BYTES = 50 * 1024 ** 2
const MAX_ARRAY_BYTES = 128 * 1024 ** 2
// Check declared allocations before FBXLoader inflates arrays or builds geometry.
export function validateFbxEnvelope(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  const fail = () => { throw new Error('FBX 数据不完整或复杂度超过限制，请精简后重新导出') }
  if (bytes.length < 27 || bytes.length > MAX_BYTES) fail()
  const head = new TextDecoder().decode(bytes.subarray(0, 8192))
  if (!head.startsWith('Kaydara FBX Binary  \0\x1a\0')) {
    if (bytes.length > 8 * 1024 ** 2 || !/FBXHeaderExtension\s*:/.test(head)) fail()
    return []
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const wide = view.getUint32(23, true) >= 7500, header = wide ? 25 : 13
  const integer = offset => {
    if (offset + (wide ? 8 : 4) > bytes.length) fail()
    const n = wide ? Number(view.getBigUint64(offset, true)) : view.getUint32(offset, true)
    if (!Number.isSafeInteger(n)) fail()
    return n
  }
  const compressedArrays = []
  let nodes = 0, allocation = 0
  function node(offset, depth) {
    if (depth > 64 || ++nodes > 50000 || offset + header > bytes.length) fail()
    const end = integer(offset), count = integer(offset + (wide ? 8 : 4)), length = integer(offset + (wide ? 16 : 8))
    if (!end) return { next: offset + header, terminal: true }
    const start = offset + header + bytes[offset + header - 1], propertyEnd = start + length
    if (end <= offset || end > bytes.length || propertyEnd > end || count > 16384) fail()
    let cursor = start
    for (let i = 0; i < count; i++) {
      if (cursor >= propertyEnd) fail()
      const type = String.fromCharCode(bytes[cursor++])
      const scalar = { Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 }[type]
      if (scalar) cursor += scalar
      else if (type === 'S' || type === 'R') {
        if (cursor + 4 > propertyEnd) fail()
        const size = view.getUint32(cursor, true); cursor += 4 + size
      } else {
        const width = { f: 4, d: 8, l: 8, i: 4, b: 1, c: 1 }[type]
        if (!width || cursor + 12 > propertyEnd) fail()
        const elements = view.getUint32(cursor, true), encoding = view.getUint32(cursor + 4, true), compressed = view.getUint32(cursor + 8, true)
        allocation += elements * width
        if (allocation > MAX_ARRAY_BYTES || elements > 16000000 || encoding > 1) fail()
        const payload = encoding ? compressed : elements * width
        if (!encoding && compressed !== payload) fail()
        if (encoding) compressedArrays.push({ offset: cursor + 12, length: payload, bytes: elements * width })
        cursor += 12 + payload
      }
      if (cursor > propertyEnd) fail()
    }
    if (cursor !== propertyEnd) fail()
    while (cursor < end) {
      const child = node(cursor, depth + 1); cursor = child.next
      if (child.terminal) break
    }
    if (cursor !== end) fail()
    return { next: end, terminal: false }
  }
  let offset = 27, top = 0
  while (offset + header <= bytes.length) {
    const entry = node(offset, 0); offset = entry.next
    if (entry.terminal) break
    top++
  }
  if (!top) fail()
  return compressedArrays
}
