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
for (const file of historical) if (!file || file.startsWith('/') || file.split('/').some(p => !p || p === '.' || p === '..') || privateName.test(file)) fail('Unsafe allowlist entry: ' + file)

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
function scan(file, bytes) {
  if (bytes.length > 25 * MiB) fail('File over 25 MiB: ' + file)
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
if (bytes > 50 * MiB) fail('Public tree exceeds 50 MiB')
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
if (json('media/clips.json').length || json('motions/motions.json').motions.length || json('lib/motions/motions.json').motions.length) fail('Private sample manifests must stay empty')
if (!read('lib/clips.data.js').toString().startsWith('// Generated from media/clips.json.') || read('lib/clips.data.js').length > 100 || !/export const CLIPS = \[\]/.test(read('lib/clips.meta.js').toString())) fail('Embedded sample data is not empty')
const pet = json('assets/pets/blue-maid/manifest.json')
for (const clip of Object.values(pet.clips)) for (const variant of [clip, clip.hevc]) {
  if (!variant || !/^[\w-]+\.(webm|mov)$/.test(variant.file)) fail('Invalid pet media reference')
  const data = read('assets/pets/blue-maid/' + variant.file)
  if (data.length > 5 * MiB || data.length !== variant.bytes || createHash('sha256').update(data).digest('hex') !== variant.sha256) fail('Pet media checksum mismatch: ' + variant.file)
}

function git(args, limit = 30 * MiB) {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: limit, timeout: 60000 })
  if (result.error || result.status !== 0) fail('Git verification failed: ' + args[0])
  return result.stdout
}
let commits = null
if (process.argv.includes('--git')) {
  if (!existsSync(join(root, '.git')) || git(['rev-parse', '--show-toplevel']).toString().trim() !== root) fail('Use an independent public Git repository')
  if (git(['rev-parse', '--is-shallow-repository']).toString().trim() !== 'false') fail('Full Git history required')
  const revisions = git(['rev-list', '--all']).toString().trim().split('\n').filter(Boolean)
  if (!revisions.length || revisions.length > 1000) fail('Missing history or history exceeds review bound')
  const checked = new Set()
  for (const rev of revisions) {
    const info = git(['show', '-s', '--format=%B%n%an <%ae>%n%cn <%ce>', rev])
    scan('commit metadata', info)
    const emails = git(['show', '-s', '--format=%ae%n%ce', rev]).toString().trim().split('\n')
    for (const [role, email] of emails.entries()) if (!/^[a-zA-Z0-9+_.-]+@users\.noreply\.github\.com$/.test(email) && !(role === 1 && email === 'noreply@github.com')) fail('Commit email is not a GitHub noreply address')
    for (const entry of git(['ls-tree', '-r', '-z', rev]).toString().split('\0').filter(Boolean)) {
      const match = /^(\d+) blob ([a-f0-9]+)\t(.+)$/.exec(entry)
      const knownPublishedRules = match?.[1] === '100644' && match[3] === 'AGENTS.md' && match[2] === publishedAgentRulesBlob && publishedAgentRulesCommits.has(rev)
      if (!match || match[1] !== '100644' && match[1] !== '100755' || !historical.has(match[3]) && !knownPublishedRules) fail('Unreviewed path/type in Git history')
      if (!checked.has(match[2])) {
        if (Number(git(['cat-file', '-s', match[2]]).toString()) > 25 * MiB) fail('Oversized historical blob')
        scan('history: ' + match[3], git(['cat-file', 'blob', match[2]])); checked.add(match[2])
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
  if (pack.size > 40 * MiB || pack.unpackedSize > 50 * MiB) fail('Package exceeds resource budget')
  const expected = new Set(files.filter(file => file === 'package.json' || policy.packageFiles.some(prefix => file === prefix || file.startsWith(prefix + '/'))))
  for (const file of pack.files) if (!expected.delete(file.path)) fail('Unexpected package file: ' + file.path)
  if (expected.size) fail('Package missing runtime files: ' + [...expected].join(', '))
} finally { rmSync(temp, { recursive: true, force: true }) }
console.log(JSON.stringify({ passed: true, publicFiles: files.length, publicBytes: bytes, packageFiles: pack.files.length, packageBytes: pack.size, unpackedBytes: pack.unpackedSize, integrity: pack.integrity, historyCommits: commits, temporaryPackAndCacheRemoved: true }, null, 2))
