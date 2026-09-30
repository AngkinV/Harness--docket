import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export function embedClips(destination = join(root, 'lib')) {
  const clips = JSON.parse(readFileSync(join(root, 'media/clips.json'), 'utf8'))
  const ids = new Set(), meta = [], data = []
  for (const clip of clips) {
    if (!/^[a-z][a-z0-9_]*$/.test(clip.id) || ids.has(clip.id) || !/^[\w-]+\.mp4$/.test(clip.file)) throw new Error('Invalid media manifest')
    ids.add(clip.id)
    const bytes = readFileSync(join(root, 'media', clip.file)), head = bytes.subarray(0, 65536).toString('latin1')
    if (head.indexOf('moov') < 0 || head.indexOf('mdat') >= 0 && head.indexOf('moov') > head.indexOf('mdat')) throw new Error(clip.file + ' requires faststart')
    const b64 = bytes.toString('base64')
    meta.push({ id: clip.id, name: clip.name, ext: '.mp4', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16), b64: b64.length })
    data.push('export const ' + clip.id + ' = ' + JSON.stringify(b64))
  }
  mkdirSync(destination, { recursive: true })
  writeFileSync(join(destination, 'clips.meta.js'), '// Generated from media/clips.json.\nexport const CLIPS = ' + JSON.stringify(meta, null, 2) + '\n')
  writeFileSync(join(destination, 'clips.data.js'), '// Generated from media/clips.json.\n' + data.join('\n') + '\n')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) embedClips()
