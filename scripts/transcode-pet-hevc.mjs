// macOS + ffmpeg (libvpx) + Xcode Command Line Tools. Originals are never rewritten.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve } from 'node:path'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'assets/pets/blue-maid'), temp = mkdtempSync(join(tmpdir(), 'pet-alpha-'))
const manifest = JSON.parse(readFileSync(join(assets, 'manifest.json')))
const hash = data => createHash('sha256').update(data).digest('hex')
try {
  const compiled = spawnSync('swiftc', [join(root, 'scripts/media/encode-alpha.swift'), '-o', join(temp, 'encode')], { stdio: 'inherit' })
  if (compiled.status !== 0) throw new Error('Apple encoder compilation failed')
  for (const [key, clip] of Object.entries(manifest.clips)) {
    if (hash(readFileSync(join(assets, clip.file))) !== clip.sha256) throw new Error('Original checksum mismatch: ' + key)
    const info = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'json', join(assets, clip.file)], { encoding: 'utf8' })
    const rate = JSON.parse(info.stdout).streams[0].r_frame_rate.split('/').map(Number)
    if (rate[1] !== 1) throw new Error('Encoder expects integer source frame rate')
    const decode = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-c:v', 'libvpx-vp9', '-i', join(assets, clip.file), '-f', 'rawvideo', '-pix_fmt', 'bgra', '-'], { stdio: ['ignore', 'pipe', 'inherit'] })
    const encode = spawn(join(temp, 'encode'), [join(assets, key + '.mov'), String(manifest.width), String(manifest.height), String(rate[0])], { stdio: ['pipe', 'inherit', 'inherit'] })
    decode.stdout.pipe(encode.stdin)
    encode.stdin.on('error', () => decode.kill())
    await Promise.all([decode, encode].map(child => new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('Transcode failed: ' + key))) })))
    const data = readFileSync(join(assets, key + '.mov'))
    if (data.length > 5 * 1024 ** 2) throw new Error('Variant exceeds clip limit')
    clip.hevc = { file: key + '.mov', bytes: data.length, sha256: hash(data) }
    console.log(key + ': ' + data.length + ' bytes')
  }
  manifest.version = '0521efa5-2'
  manifest.derivatives = { format: 'HEVC with Alpha / QuickTime', source: 'The unchanged WebM clips in this manifest', encoder: 'Apple AVAssetWriter AVVideoCodecType.hevcWithAlpha; BGRA decoded using FFmpeg libvpx-vp9', script: 'scripts/transcode-pet-hevc.mjs', license: 'Same attribution and noncommercial terms as the originals' }
  writeFileSync(join(assets, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
} finally { rmSync(temp, { recursive: true, force: true }) }
