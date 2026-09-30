import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '../assets/pets/blue-maid')
export function readPetPackage() {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.id !== 'alpha:blue-maid' || manifest.width !== 640 || manifest.height !== 360) throw new Error('Invalid transparent character package')
  for (const [key, clip] of Object.entries(manifest.clips)) {
    if (!/^[a-z0-9]+$/.test(key) || clip.file !== key + '.webm' || !/^[a-f0-9]{64}$/.test(clip.sha256) || !(clip.bytes > 0 && clip.bytes <= 5 * 1024 ** 2)) throw new Error('Invalid character animation')
    if (clip.hevc && (clip.hevc.file !== key + '.mov' || !/^[a-f0-9]{64}$/.test(clip.hevc.sha256) || !(clip.hevc.bytes > 0 && clip.hevc.bytes <= 5 * 1024 ** 2))) throw new Error('Invalid HEVC character animation')
  }
  for (const key of ['idle', 'walk', 'drag', 'click1', 'click2', 'thinking', 'working', 'waiting', 'success', 'error']) if (!manifest.clips[key]) throw new Error('Missing character animation: ' + key)
  return { ...manifest, format: 'alpha-video', source: 'animation', human: false, rigged: false, boneCount: 0, bytes: Object.values(manifest.clips).reduce((sum, clip) => sum + clip.bytes + (clip.hevc?.bytes || 0), 0), author: 'PC2005-cloud' }
}
export function readPetClip(item, key, format = 'webm') {
  if (format !== 'webm' && format !== 'hevc') return null
  if (!Object.hasOwn(item.clips, key)) return null
  const clip = format === 'hevc' ? item.clips[key].hevc : item.clips[key]
  if (!clip) return null
  const buffer = readFileSync(join(root, clip.file))
  if (buffer.length !== clip.bytes || createHash('sha256').update(buffer).digest('hex') !== clip.sha256) throw new Error('Character animation checksum mismatch')
  return { buffer, version: clip.sha256, contentType: format === 'hevc' ? 'video/quicktime' : 'video/webm' }
}
