// Run before any upload. Diagnostics name files/rules, never matching secret values.
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MiB = 1024 ** 2
const fail = message => { throw new Error(message) }
const read = file => readFileSync(join(root, file))
const json = file => JSON.parse(read(file).toString())
const policy = json('release/public-files.json')
const allowed = new Set(policy.files)
// Keep explicitly reviewed retired public paths for history checks only; they
// are never allowed back into the current tree or installation package.
const historical = new Set([...allowed, ...(policy.retiredFiles || [])])
// This generic rules file was already published before it was removed. Recognize
// only its exact blob in these reviewed existing commits; never permit it in the
// current tree, the allowlists, or a new commit (even with identical contents).
const publishedAgentRulesBlob = '7662d125d2fcbe8811e3124e5c30ab3f32c2354d'
const publishedAgentRulesCommits = new Set([
  'e29d0c4b583fb382013d97a518ddeaf64e8943e8',
  'f390052a5624805d82cd0959185e417497647873',
  '1b929766ddd266c6280216830a28fb7ceae73742',
  'f17b6fa433271eaf4a9274ccd4f59d6622613073',
  '05d2d3aaaf0d6347883c06bbae10b2499738c83b',
  '01c6a2c499e80d0849edb6030a1b41cbefa88e21',
])
if (policy.schemaVersion !== 1 || allowed.size !== policy.files.length) fail('Invalid public allowlist')
const privateName = /(?:^|\/)(?:AGENTS?\.md|\.env[^/]*|\.npmrc|\.pnpmrc|\.work|artifacts|models|reference|node_modules|\.git|\.codex|\.agents)(?:\/|$)|\.(?:vrm|glb|fbx|mp4|log|map|tgz|zip|db|sqlite\w*|pem|key|heapsnapshot)$/i
// Exactly one reviewed CC0 derivative, never arbitrary private model inputs.
const reviewedModel = new Set(['assets/models/robot.glb', 'assets/models/manifest.json', 'assets/models/NOTICE.md'])
// Explicit lossless-video exception; all other bundled media stay within 5 MiB.
const largeMedia = { file: 'light-color-intro.mp4', bytes: 20375525, sha256: '038fd081590569d7816277d64905f5ad01cbaa4aa82e86d5467731e4ffda28a3' }
const mediaBudget = asset => asset.file === largeMedia.file && asset.bytes === largeMedia.bytes && asset.sha256 === largeMedia.sha256 ? largeMedia.bytes : 5 * MiB
const fileBudget = file => file === 'lib/clips.data.js' ? 40 * MiB : 25 * MiB
const safeMediaName = file => typeof file === 'string' && /^[\p{L}\p{N}_ -]+\.mp4$/u.test(file)
const media = policy.bundledMedia || []
const reviewedMedia = new Map()
const mediaIds = new Set()
for (const asset of media) {
  if (!/^[a-z][a-z0-9_]*$/.test(asset.id) || mediaIds.has(asset.id) || !safeMediaName(asset.file) || reviewedMedia.has('media/' + asset.file) || !Number.isInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > mediaBudget(asset) || !/^[a-f0-9]{64}$/.test(asset.sha256) || typeof asset.name !== 'string' || !asset.name.trim() || typeof asset.source !== 'string' || !asset.source.trim() || typeof asset.license !== 'string' || !asset.license.trim() || asset.license === 'UNCONFIRMED' && !(asset.file === largeMedia.file && asset.sha256 === largeMedia.sha256 && asset.distributionBasis === 'Explicit maintainer instruction to include this exact video in 0.9.2; not a copyright license or downstream rights grant')) fail('Invalid/unconfirmed bundled media record')
  mediaIds.add(asset.id); reviewedMedia.set('media/' + asset.file, asset)
  if (!allowed.has('media/' + asset.file)) fail('Bundled media missing from allowlist')
}
for (const file of historical) if (!file || file.startsWith('/') || file.split('/').some(p => !p || p === '.' || p === '..') || privateName.test(file) && !reviewedModel.has(file) && !reviewedMedia.has(file)) fail('Unsafe allowlist entry: ' + file)

const secrets = [
  ['personal absolute path', /(?:\/Users\/|\/home\/)[a-zA-Z0-9_.-]+\/|[A-Z]:\\Users\\[^\\\s]+\\/],
  ['GitHub token', /\b(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,})\b/],
  ['provider key', /\bsk-(?:proj-|ant-)?[a-zA-Z0-9_-]{20,}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['URL credentials', /https?:\/\/[^\s/"'`:@]+:[^\s/"'`@]+@/],
  ['credential assignment', /(?:api[_-]?key|access[_-]?token|auth[_-]?token|password)\s*[=:]\s*["'][a-zA-Z0-9_+/.=-]{16,}["']/i],
  ['recorded cookie', /(?:cookie|authorization)\s*[=:]\s*["'](?:Bearer |session=|token=)[^"'\s]{16,}/i],
]
function scan(file, bytes, limit = fileBudget(file)) {
  if (bytes.length > limit) fail('File exceeds resource budget: ' + file)
  const value = bytes.toString('utf8')
  for (const [rule, pattern] of secrets) if (pattern.test(value)) fail(rule + ': ' + file)
}
function walk(directory, prefix = '') {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!prefix && ['.git', 'node_modules'].includes(entry.name)) continue
    const file = prefix + entry.name, path = join(directory, entry.name), stat = lstatSync(path)
    if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) fail('Non-regular public file: ' + file)
    if (stat.isDirectory()) {
      if (![...allowed].some(name => name.startsWith(file + '/'))) fail('Directory outside public allowlist: ' + file)
      files.push(...walk(path, file + '/'))
    } else files.push(file)
  }
  return files
}
const files = walk(root)
for (const file of files) if (!allowed.has(file)) fail('File outside public allowlist: ' + file)
for (const file of allowed) if (!files.includes(file)) fail('Missing public file: ' + file)
let bytes = 0
for (const file of files) { const data = read(file); bytes += data.length; scan(file, data) }
if (bytes > 100 * MiB) fail('Public tree exceeds 100 MiB')
for (const asset of policy.documentationAssets || []) {
  if (!allowed.has(asset.path) || !Number.isInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > 5 * MiB || !/^[a-f0-9]{64}$/.test(asset.sha256) || !/^https:\/\/github\.com\/AngkinV\/Harness--docket\/blob\/[a-f0-9]{40}\//.test(asset.sourceUrl)) fail('Invalid documentation asset record')
  const data = read(asset.path)
  if (data.length !== asset.bytes || createHash('sha256').update(data).digest('hex') !== asset.sha256) fail('Documentation asset checksum mismatch: ' + asset.path)
}

const pkg = json('package.json'), lock = json('package-lock.json')
if (pkg.name !== 'harness-docket' || lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) fail('Package/lock identity mismatch')
if (pkg.main !== './lib/index.js' || pkg.dsh?.bundle?.patch !== './cordis.patch.yml' || pkg.dsh?.client?.platform !== 'web' || pkg.exports?.['./client']?.default !== './lib/client.js') fail('Invalid Harness entry points')
const scriptNames = new Set(['build', 'build:client', 'typecheck', 'check:public'])
for (const name of Object.keys(pkg.scripts || {})) if (!scriptNames.has(name)) fail('Unreviewed package script: ' + name)
if (Object.keys(pkg.dependencies || {}).length || Object.keys(pkg.optionalDependencies || {}).length || pkg.workspaces) fail('Unreviewed runtime dependency/workspace')
if (JSON.stringify(pkg.files) !== JSON.stringify(policy.packageFiles)) fail('npm files allowlist changed')
if (json('motions/motions.json').motions.length || json('lib/motions/motions.json').motions.length) fail('Private motion manifests must stay empty')
const clipManifest = media.map(({ id, file, name }) => ({ id, file, name }))
if (JSON.stringify(json('media/clips.json')) !== JSON.stringify(clipManifest)) fail('Bundled clip manifest mismatch')
const clipMeta = [], clipData = []
for (const asset of media) {
  const data = read('media/' + asset.file)
  if (data.length !== asset.bytes || createHash('sha256').update(data).digest('hex') !== asset.sha256) fail('Bundled media checksum mismatch: ' + asset.file)
  const head = data.subarray(0, 65536).toString('latin1')
  if (head.indexOf('moov') < 0 || head.indexOf('mdat') >= 0 && head.indexOf('moov') > head.indexOf('mdat')) fail('Bundled media requires faststart: ' + asset.file)
  const b64 = data.toString('base64')
  clipMeta.push({ id: asset.id, name: asset.name, ext: '.mp4', bytes: data.length, sha256: asset.sha256.slice(0, 16), b64: b64.length })
  clipData.push('export const ' + asset.id + ' = ' + JSON.stringify(b64))
}
const generatedHeader = '// Generated from media/clips.json.\n'
const expectedClipData = generatedHeader + clipData.join('\n') + '\n'
const expectedClipMeta = generatedHeader + 'export const CLIPS = ' + JSON.stringify(clipMeta, null, 2) + '\n'
if (read('lib/clips.data.js').toString() !== expectedClipData || read('lib/clips.meta.js').toString() !== expectedClipMeta) fail('Embedded media does not match reviewed source bytes')
const pet = json('assets/pets/blue-maid/manifest.json')
const robot = read('assets/models/robot.glb'), robotManifest = json('assets/models/manifest.json')
const robotHash = 'ad85dd44b223c4261cd21094d0e0493fc8784f2f683eb05ddd2b6f1a6bb21abe'
if (robotManifest.sha256 !== robotHash || robotManifest.license !== 'CC0-1.0' || robot.length !== 463988 || createHash('sha256').update(robot).digest('hex') !== robotHash) fail('Unreviewed packaged model')
for (const clip of Object.values(pet.clips)) for (const variant of [clip, clip.hevc]) {
  if (!variant || !/^[\w-]+\.(webm|mov)$/.test(variant.file)) fail('Invalid pet media reference')
  const data = read('assets/pets/blue-maid/' + variant.file)
  if (data.length > 5 * MiB || data.length !== variant.bytes || createHash('sha256').update(data).digest('hex') !== variant.sha256) fail('Pet media checksum mismatch: ' + variant.file)
}

function git(args, limit = 45 * MiB) {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: limit, timeout: 60000 })
  if (result.error || result.status !== 0) fail('Git verification failed: ' + args[0])
  return result.stdout
}
let commits = null
if (process.argv.includes('--git')) {
  if (!existsSync(join(root, '.git')) || git(['rev-parse', '--show-toplevel']).toString().trim() !== root) fail('Use an independent public Git repository')
  if (git(['rev-parse', '--is-shallow-repository']).toString().trim() !== 'false') fail('Full Git history required')
  // Disk-only files (including ignored files) disappear on GitHub. Check the
  // index so a staged release can be verified before committing. The pre-push
  // hook additionally requires the index and working tree to match HEAD.
  const tracked = new Set()
  for (const entry of git(['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean)) {
    const match = /^(100644|100755) [a-f0-9]+ 0\t(.+)$/.exec(entry)
    if (!match || !allowed.has(match[2])) fail('Unreviewed path/type or unresolved conflict in Git index')
    tracked.add(match[2])
  }
  for (const file of allowed) if (!tracked.has(file)) fail('Public file missing from Git index (stage and commit before pushing): ' + file)
  const revisions = git(['rev-list', '--all']).toString().trim().split('\n').filter(Boolean)
  if (!revisions.length || revisions.length > 1000) fail('Missing history or history exceeds review bound')
  const checked = new Set(), checkedMedia = new Set()
  for (const rev of revisions) {
    const info = git(['show', '-s', '--format=%B%n%an <%ae>%n%cn <%ce>', rev])
    scan('commit metadata', info)
    const emails = git(['show', '-s', '--format=%ae%n%ce', rev]).toString().trim().split('\n')
    for (const [role, email] of emails.entries()) if (!/^[a-zA-Z0-9+_.-]+@users\.noreply\.github\.com$/.test(email) && !(role === 1 && email === 'noreply@github.com')) fail('Commit email is not a GitHub noreply address')
    for (const entry of git(['ls-tree', '-r', '-z', rev]).toString().split('\0').filter(Boolean)) {
      const match = /^(\d+) blob ([a-f0-9]+)\t(.+)$/.exec(entry)
      const knownPublishedRules = match?.[1] === '100644' && match[3] === 'AGENTS.md' && match[2] === publishedAgentRulesBlob && publishedAgentRulesCommits.has(rev)
      if (!match || match[1] !== '100644' && match[1] !== '100755' || !historical.has(match[3]) && !knownPublishedRules) fail('Unreviewed path/type in Git history')
      if (match[3] === 'assets/models/robot.glb' && createHash('sha256').update(git(['cat-file', 'blob', match[2]])).digest('hex') !== robotHash) fail('Unreviewed historical model')
      const mediaAsset = reviewedMedia.get(match[3])
      if (mediaAsset && createHash('sha256').update(git(['cat-file', 'blob', match[2]])).digest('hex') !== mediaAsset.sha256) fail('Unreviewed historical media')
      const mediaKey = match[3] + ':' + match[2]
      if (!checkedMedia.has(mediaKey)) {
        if (match[3] === 'lib/clips.data.js') {
          const value = git(['cat-file', 'blob', match[2]]).toString()
          if (value !== generatedHeader + '\n' && value !== expectedClipData) fail('Unreviewed historical embedded media')
        }
        if (match[3] === 'lib/clips.meta.js') {
          const value = git(['cat-file', 'blob', match[2]]).toString()
          if (value !== generatedHeader + 'export const CLIPS = []\n' && value !== expectedClipMeta) fail('Unreviewed historical clip metadata')
        }
        if (match[3] === 'media/clips.json') {
          const value = JSON.stringify(JSON.parse(git(['cat-file', 'blob', match[2]])))
          if (value !== '[]' && value !== JSON.stringify(clipManifest)) fail('Unreviewed historical clip manifest')
        }
        checkedMedia.add(mediaKey)
      }
      if (!checked.has(match[2])) {
        if (Number(git(['cat-file', '-s', match[2]]).toString()) > fileBudget(match[3])) fail('Oversized historical blob')
        scan('history: ' + match[3], git(['cat-file', 'blob', match[2]]), fileBudget(match[3])); checked.add(match[2])
      }
    }
  }
  commits = revisions.length
}

// Inspect an actual package, including its measured compressed size. All temporary
// output/cache is ours; npm is synchronous and has exited before finally cleanup.
const temp = mkdtempSync(join(tmpdir(), 'docket-public-pack-'))
let pack
try {
  const result = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temp], {
    cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * MiB,
    env: { ...process.env, npm_config_cache: join(temp, 'cache'), npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' },
  })
  if (result.error || result.status !== 0) fail('npm pack failed (no package or logs published)')
  const packed = JSON.parse(result.stdout)
  // npm <= 11 returns an array; npm 12 returns an object keyed by package name.
  pack = Array.isArray(packed) ? packed[0] : packed[pkg.name]
  if (!pack || !Array.isArray(pack.files)) fail('Unrecognized npm pack result')
  if (pack.size > 64 * MiB || pack.unpackedSize > 80 * MiB) fail('Package exceeds resource budget')
  const expected = new Set(files.filter(file => file === 'package.json' || policy.packageFiles.some(prefix => file === prefix || file.startsWith(prefix + '/'))))
  for (const file of pack.files) if (!expected.delete(file.path)) fail('Unexpected package file: ' + file.path)
  if (expected.size) fail('Package missing runtime files: ' + [...expected].join(', '))
} finally { rmSync(temp, { recursive: true, force: true }) }
console.log(JSON.stringify({ passed: true, publicFiles: files.length, publicBytes: bytes, packageFiles: pack.files.length, packageBytes: pack.size, unpackedBytes: pack.unpackedSize, integrity: pack.integrity, historyCommits: commits, temporaryPackAndCacheRemoved: true }, null, 2))
