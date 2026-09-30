/** Harness host routes; media indexing, persistence and resource validation live in separate modules. */
import { open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createMediaCatalog, VIDEO_EXT, makeId, signature } from './media-catalog.js'
import { atomicStateSync, withStoreLockSync } from './storage.js'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  lstatSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLIPS } from './clips.meta.js'
import { createLibraryStore, LibraryError, MAX_UPLOAD_BYTES, RETENTION_MS } from './library.js'
import { createAvatarStore, AvatarError } from './avatars.js'
import { createCompanionStore } from './companion-store.js'
import { HttpError, readJsonBody } from './http.js'
import { readPetPackage, readPetClip } from './pet-package.js'
import { createWorkStatus } from './work-status.js'

export const name = 'harness-docket'

/** HTTP routes and Harness's signed-cookie / request-origin validation. */
export const inject = ['webServer', 'connection']

const HERE = dirname(fileURLToPath(import.meta.url))
/** lib/index.js -> package root */
const PKG_ROOT = join(HERE, '..')

const BASE_ROUTE = '/harness-docket'
const ROUTE = BASE_ROUTE + '/boot.mp4'
/**
 * NO trailing slash. The webserver matches a prefix route with
 *   pathname !== prefix && !pathname.startsWith(prefix + '/')
 * so a registered path of `.../media/` would be tested as
 * `.../media//` and never match a real `.../media/<id>` request — every
 * media URL 404s. Keep this bare and add the separator at slice time.
 */
const MEDIA_ROUTE = BASE_ROUTE + '/media'
const LIST_ROUTE = BASE_ROUTE + '/videos.json'
const SELECT_ROUTE = BASE_ROUTE + '/select'
const STATUS_ROUTE = BASE_ROUTE + '/status.json'
const CONTENT_TYPE = 'video/mp4'

/** Ids of the embedded clips are namespaced so they can never collide with a path. */
const EMBEDDED_PREFIX = 'builtin:'

/**
 * Decoded embedded clips, filled on first use.
 *
 * `clips.data.js` is ~8MB of base64. Importing it eagerly would make every DSH
 * start pay for a video it may never serve, so it is imported on the first
 * request for an embedded clip and the decoded Buffers are kept afterwards.
 */
const decoded = new Map()
let dataModule = null

async function embeddedBuffer(id) {
  const cached = decoded.get(id)
  if (cached !== undefined) return cached
  if (dataModule === null) dataModule = await import('./clips.data.js')
  for (const clip of CLIPS) {
    if (decoded.has(clip.id)) continue
    const b64 = dataModule[clip.id]
    if (typeof b64 === 'string') decoded.set(clip.id, Buffer.from(b64, 'base64'))
  }
  return decoded.get(id) ?? null
}

const HOME = () => process.env.DSH_HOME ?? join(homedir(), '.dsh')
const HOME_DIR = () => join(HOME(), 'boot-animation')
const SELECTION_FILE = () => join(HOME_DIR(), 'selection.json')
const library = createLibraryStore(HOME_DIR)

const catalog = createMediaCatalog({ home: HOME_DIR, clips: CLIPS, hidden: () => library.hiddenIds() })
const listVideos = () => catalog.list()

function readSelection() {
  try {
    const raw = readFileSyncSafe(SELECTION_FILE())
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.id === 'string' && parsed.id !== '' ? parsed.id : null
  } catch {
    return null
  }
}

function readFileSyncSafe(p) {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function writeSelection(id) {
  mkdirSync(HOME_DIR(), { recursive: true })
  withStoreLockSync(HOME_DIR(), () => atomicStateSync(SELECTION_FILE(), { id, at: new Date().toISOString() }))
}

/**
 * Which video plays. An explicit pick wins; otherwise the historical
 * three-level priority, so nothing that worked before stops working.
 */
async function resolveActive() {
  const videos = await listVideos()
  const picked = readSelection()
  if (picked !== null) {
    const hit = videos.find((v) => v.id === picked)
    if (hit) return { video: hit, how: 'selected', videos }
    // Picked file was deleted: fall through rather than show nothing.
  }

  const fromEnv = process.env.DSH_BOOT_ANIMATION
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    const candidate = videos.find(v => v.path === fromEnv.trim())
    if (candidate) return { video: candidate, how: 'env', videos }
    try { return { video: await catalog.inspect(fromEnv.trim(), 'env'), how: 'env', videos } } catch {}
  }

  const legacyDropIn = videos.find((v) => v.source === 'yours' && v.legacy)
  if (legacyDropIn) return { video: legacyDropIn, how: 'legacy-dropin', videos }

  const yours = videos.find((v) => v.source === 'yours')
  if (yours) return { video: yours, how: 'library', videos }

  // Nothing of the user's: the plugin's own clips. These are embedded, so this
  // can never come up empty — which is the point of embedding them.
  const embedded = videos.find((v) => v.source === 'embedded')
  if (embedded) return { video: embedded, how: 'embedded', videos }

  return { video: null, how: 'none', videos }
}

async function findById(id) { return id === 'active' ? (await resolveActive()).video : catalog.find(id) }

function sendJson(res, payload, status = 200) {
  const body = JSON.stringify(payload, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Plain-text reply, always uncacheable.
 *
 * Every failure path has to say `no-store`. A 404 with no cache directive is
 * heuristically cacheable, so a route that 404s once while it is broken keeps
 * 404ing in that browser AFTER the fix — the server returns 200 and the user
 * still sees nothing. That is exactly how "the video will not play" survived a
 * fix that curl proved was live.
 */
function sendText(res, status, body) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function publicVideo(v, extra = {}) {
  return {
    id: v.id,
    name: v.name,
    file: v.file,
    ext: v.ext,
    source: v.source,
    writable: v.writable,
    deletable: v.source !== 'env',
    embedded: v.embedded ?? null,
    bytes: v.bytes,
    mtime: v.mtime,
    legacy: v.legacy,
    faststart: v.faststart === true,
    /**
     * The clip's content identity, so a client can pin it into the media URL as
     * `?v=`. A bare URL must revalidate on every play (correct but slow); a
     * versioned one can be cached forever. It is also what stops a browser from
     * splicing bytes served under the same URL before and after a clip changed.
     */
    version: v.contentKey ?? null,
    // How many on-disk copies collapsed into this row, and where the others
    // live. Reported so a collapsed duplicate is visible rather than mysterious.
    copies: v.copies ?? 1,
    alsoAt: v.alsoAt ?? [],
    ...extra,
  }
}

async function serveList(res) {
  library.cleanup()
  const { video, how, videos } = await resolveActive()
  sendJson(res, {
    warnings: [...catalog.warnings],
    activeId: video === null ? null : video.id,
    activeHow: how,
    activeVersion: video === null ? null : video.contentKey ?? null,
    videos: videos.map((v) => publicVideo(v, { active: video !== null && v.id === video.id })),
    userDir: join(HOME_DIR(), 'videos'),
    accepts: [...VIDEO_EXT],
    maxUploadBytes: MAX_UPLOAD_BYTES,
    retentionDays: RETENTION_MS / 86400000,
  })
}

async function serveStatus(res) {
  // Deliberately reports WHICH slot is active without echoing absolute paths
  // back to anything that can reach this port.
  const { video, how, videos } = await resolveActive()
  sendJson(res, {
    active:
      video === null
        ? null
        : { kind: how, id: video.id, name: video.name, bytes: video.bytes, version: video.contentKey ?? null },
    count: videos.length,
    videos: videos.map((v) => publicVideo(v, { active: video !== null && v.id === video.id })),
    // Legacy fields, kept because README and older probes read them.
    candidates: [
      { kind: 'selection', exists: readSelection() !== null, bytes: 0 },
      { kind: 'library', exists: videos.length > 0, bytes: videos.length },
      {
        kind: 'embedded',
        exists: CLIPS.length > 0,
        bytes: CLIPS.reduce((total, clip) => total + clip.bytes, 0),
      },
    ],
    lookupOrder:
      'selection.json -> DSH_BOOT_ANIMATION -> $DSH_HOME/boot-animation/intro.mp4 -> ' +
      '$DSH_HOME/boot-animation/videos -> embedded built-ins',
  })
}

/**
 * Identity of one on-disk cut, for conditional requests.
 *
 * Size plus mtime is enough: a file the user replaces differs in at least one of
 * them, and both are free (no read, no hash of a 3MB file per request).
 */
function etagOf(stats) {
  return '"' + stats.size.toString(16) + '-' + Math.round(stats.mtimeMs).toString(16) + '"'
}

/**
 * Which `cache-control` a media response may carry.
 *
 * A bare URL can only revalidate: `no-cache` means "keep it, but ask before
 * using", so an unchanged clip answers 304 and playback starts from the local
 * copy, while a clip the user just swapped in fails the comparison and streams
 * fresh. Correct, but it costs a round trip per play and it leaves the browser
 * free to splice ranges served before and after the bytes changed — which shows
 * up as a video that never paints.
 *
 * A URL that PINS the content key (`?v=<contentKey>`) cannot go stale: the key
 * changes whenever the bytes do, so the old URL is simply a different resource.
 * That one may be cached forever, which is what makes a replay start without a
 * single request.
 *
 * `no-store` used to be here, the worst of both worlds for media: the browser
 * could not keep a byte, so every overlay opening re-downloaded the whole clip
 * and the splash sat black while it did.
 */
function cacheControlFor(req, version) {
  if (typeof version === 'string' && version !== '') {
    const raw = typeof req.url === 'string' ? req.url : ''
    const query = raw.indexOf('?')
    if (query !== -1) {
      try {
        if (new URLSearchParams(raw.slice(query + 1)).get('v') === version) {
          return 'private, max-age=31536000, immutable'
        }
      } catch {
        /* malformed query: fall through to revalidation */
      }
    }
  }
  return 'private, no-cache'
}

/**
 * Serve media bytes with Range support and content-addressed caching.
 *
 * `open(start, end)` yields the body for the resolved slice, either a Buffer
 * (embedded clips) or a Readable (files), so this one routine covers both.
 */
function sendMedia(req, res, { size, etag, lastModified, version = null, contentType = CONTENT_TYPE, open }) {
  const requested = new URL(req.url, 'http://localhost').searchParams.get('v')
  if (requested && requested !== version) { sendText(res, 409, '视频版本已变化，请刷新片库'); return }
  const validators = {}
  if (etag !== null) validators.etag = etag
  if (lastModified !== null) validators['last-modified'] = lastModified
  const cacheControl = cacheControlFor(req, version)

  if (etag !== null) {
    const inm = req.headers['if-none-match']
    const matched =
      typeof inm === 'string' &&
      inm
        .split(',')
        .map((s) => s.trim())
        .some((candidate) => candidate.replace(/^W\//, '') === etag || candidate === '*')
    if (matched) {
      // The body the browser already has is still current.
      res.writeHead(304, { ...validators, 'cache-control': cacheControl })
      res.end()
      return
    }
  }

  const body = (start, end) => {
    const chunk = open(start, end)
    if (Buffer.isBuffer(chunk)) res.end(chunk)
    else {
      chunk.on('error', () => res.destroy())
      res.on('close', () => chunk.destroy())
      chunk.pipe(res)
    }
  }

  const ifRange = req.headers['if-range']
  const rangeAllowed = typeof ifRange !== 'string' || (ifRange.startsWith('"')
    ? ifRange === etag && !ifRange.startsWith('W/')
    : !ifRange.startsWith('W/') && lastModified !== null && Number.isFinite(Date.parse(ifRange)) && Date.parse(lastModified) <= Date.parse(ifRange))
  const range = rangeAllowed ? req.headers.range : undefined
  if (typeof range === 'string') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (match !== null) {
      const rawStart = match[1]
      const rawEnd = match[2]
      let start = rawStart === '' ? undefined : Number(rawStart)
      let end = rawEnd === '' ? undefined : Number(rawEnd)
      if (start === undefined && end !== undefined) {
        // Suffix form: last N bytes.
        start = Math.max(0, size - end)
        end = size - 1
      }
      if (start !== undefined && end === undefined) end = size - 1
      const valid =
        start !== undefined &&
        end !== undefined &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start <= end &&
        start < size
      if (!valid) {
        res.writeHead(416, {
          'content-range': 'bytes */' + String(size),
          'cache-control': 'no-store',
        })
        res.end()
        return
      }
      end = Math.min(end, size - 1)
      res.writeHead(206, {
        ...validators,
        'content-type': contentType,
        'content-length': String(end - start + 1),
        'content-range': 'bytes ' + String(start) + '-' + String(end) + '/' + String(size),
        'accept-ranges': 'bytes',
        'cache-control': cacheControl,
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      body(start, end)
      return
    }
  }

  res.writeHead(200, {
    ...validators,
    'content-type': contentType,
    'content-length': String(size),
    'accept-ranges': 'bytes',
    'cache-control': cacheControl,
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  body(undefined, undefined)
}

/** Serve a clip from disk. */
async function streamFile(req, res, video) {
  const handle = await open(video.path, constants.O_RDONLY | constants.O_NOFOLLOW)
  let streamed = false
  const close = () => { void handle.close().catch(() => {}) }
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || signature(stat) !== video.signature) { catalog.invalidate(); throw new HttpError(409, '视频文件已变化，请刷新片库') }
    sendMedia(req, res, {
      size: stat.size, version: video.contentKey,
      contentType: ({ '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime' })[video.ext] || CONTENT_TYPE,
      etag: '"' + video.contentKey + '"', lastModified: stat.mtime.toUTCString(),
      open: (start, end) => {
        streamed = true
        const stream = handle.createReadStream({ start: start ?? 0, end: end ?? stat.size - 1, autoClose: false })
        stream.once('end', close); stream.once('error', close); stream.once('close', close)
        return stream
      },
    })
  } finally { if (!streamed) await handle.close() }
}

/** Serve an embedded clip from memory. */
function streamEmbedded(req, res, buffer, contentKey) {
  sendMedia(req, res, {
    size: buffer.length,
    version: contentKey,
    // The content hash is already the clip's identity, so revalidation is exact
    // rather than stat-based.
    etag: '"embedded-' + contentKey + '"',
    lastModified: null,
    open: (start, end) => (start === undefined ? buffer : buffer.subarray(start, end + 1)),
  })
}

/**
 * Serve one resolved clip, from memory or from disk.
 *
 * Async because an embedded clip's data module is imported on first use, so the
 * host does not parse ~8MB of base64 at startup for a video it may never serve.
 */
async function streamClip(req, res, video) {
  if (video.embedded !== null && video.embedded !== undefined) {
    const buffer = await embeddedBuffer(video.embedded)
    if (buffer === null) {
      sendText(res, 500, 'harness-docket: embedded clip data is missing from lib/clips.data.js')
      return
    }
    streamEmbedded(req, res, buffer, video.contentKey)
    return
  }
  await streamFile(req, res, video)
}

/** The historical single-video route: whatever is active right now. */
async function serveVideo(req, res) {
  const { video } = await resolveActive()
  if (video === null) {
    sendText(
      res,
      404,
      'harness-docket: no video found (drop an .mp4 into ' +
        join(HOME_DIR(), 'videos') +
        ', set DSH_BOOT_ANIMATION, or add $DSH_HOME/boot-animation/intro.mp4)',
    )
    return
  }
  await streamClip(req, res, video)
}

/**
 * One specific video from the library, by id.
 *
 * The handler signature is `(req, res)` — the webserver does NOT pass a URL as
 * a third argument. Reading `req.url` is therefore the only way to see the id,
 * and doing it from a parameter that is always undefined made every request
 * 404 (the library listed videos it could not then serve).
 */
async function serveMedia(req, res) {
  const raw = typeof req.url === 'string' ? req.url : ''
  const path = raw.split('?')[0]
  // MEDIA_ROUTE has no trailing slash, so drop exactly one separator here.
  const id = decodeURIComponent(path.slice(MEDIA_ROUTE.length + 1))
  const video = id === '' ? null : await findById(id)
  if (video === null) {
    sendText(res, 404, 'harness-docket: no such video id')
    return
  }
  await streamClip(req, res, video)
}

async function jsonBody(req) {
  const data = await readJsonBody(req, 8192)
  if (typeof data.id !== 'string' || !data.id || data.id.length > 256) throw new HttpError(400, '视频标识无效')
  return data
}

async function selectVideo(req, res) {
  const { id } = await jsonBody(req)
  const video = await findById(id)
  if (!video) throw new LibraryError(404, '找不到这个视频')
  writeSelection(video.id)
  sendJson(res, { ok: true, activeId: video.id, name: video.name })
}

export function apply(ctx) {
  const work = createWorkStatus()
  if (typeof ctx.on === 'function') ctx.on('session/event', (session, event) => work.accept(session, event))
  // Use the same Host/Origin and signed-cookie check as Harness's own API.
  const register = (path, methods, handler, kind = 'exact') => ctx.effect(
    () => ctx.webServer.register({ kind, path, handler: async (req, res) => {
      try {
        const rejection = ctx.connection.requestRejection(req)
        if (rejection !== undefined) { sendJson(res, { ok: false, error: rejection === 401 ? '请先登录 Harness' : '请求来源不受信任' }, rejection); return }
        if (!methods.includes(req.method)) { res.setHeader?.('allow', methods.join(', ')); throw new LibraryError(405, '不支持此请求方式') }
        await handler(req, res)
      } catch (error) {
        const known = error instanceof HttpError || error instanceof LibraryError || error instanceof AvatarError
        if (!res.headersSent && !res.destroyed) sendJson(res, { ok: false, error: known ? error.message : '操作失败，请稍后重试' }, known ? error.status : 500)
      }
    } }), 'harness-docket: ' + path)
  register(BASE_ROUTE + '/client-config.json', ['GET'], (_req, res) => sendJson(res, { namespace: createHash('sha256').update(resolve(HOME())).digest('hex').slice(0, 24) }))
  register(ROUTE, ['GET', 'HEAD'], serveVideo)
  register(MEDIA_ROUTE, ['GET', 'HEAD'], serveMedia, 'prefix')
  register(LIST_ROUTE, ['GET'], (_req, res) => serveList(res))
  register(STATUS_ROUTE, ['GET'], (_req, res) => serveStatus(res))
  register(SELECT_ROUTE, ['POST'], selectVideo)
  const pet = readPetPackage()
  const avatars = createAvatarStore(HOME, () => process.env.HARNESS_DOCKET_MODELS_DIR || resolve(process.cwd(), 'models'), [pet])
  register(BASE_ROUTE + '/work-status.json', ['GET'], (req, res) => sendJson(res, work.snapshot(new URL(req.url, 'http://localhost').searchParams.get('session'))))
  register(BASE_ROUTE + '/avatars/restore-animation', ['POST'], async (_req, res) => sendJson(res, await avatars.restoreAnimation()))
  register(BASE_ROUTE + '/pet-clip', ['GET', 'HEAD'], (req, res) => {
    const query = new URL(req.url, 'http://localhost').searchParams
    const resource = query.get('id') === pet.id && readPetClip(pet, query.get('clip'), query.get('format') ?? 'webm')
    if (!resource) throw new HttpError(404, '找不到角色动画')
    sendMedia(req, res, { size: resource.buffer.length, version: resource.version, etag: '"' + resource.version + '"', lastModified: null, contentType: resource.contentType, open: (start, end) => start === undefined ? resource.buffer : resource.buffer.subarray(start, end + 1) })
  })
  const avatarBody = async req => {
    const data = await readJsonBody(req)
    if (typeof data.id !== 'string' || !data.id || data.id.length > 100) throw new HttpError(400, '角色标识无效')
    return data
  }
  const companion = createCompanionStore(HOME, () => {
    const local = process.env.HARNESS_DOCKET_MOTIONS_DIR || resolve(process.env.HARNESS_DOCKET_MODELS_DIR ? resolve(process.env.HARNESS_DOCKET_MODELS_DIR, '..') : process.cwd(), 'motions')
    return existsSync(local) ? local : join(HERE, 'motions')
  }, id => avatars.has(id))
  register(BASE_ROUTE + '/companion.json', ['GET'], async (_req, res) => sendJson(res, await companion.list()))
  register(BASE_ROUTE + '/companion/upload', ['POST'], async (req, res) => sendJson(res, { ok: true, item: await companion.upload(req, new URL(req.url, 'http://localhost').searchParams.get('filename')) }, 201))
  register(BASE_ROUTE + '/companion/settings', ['POST'], async (req, res) => { const data = await avatarBody(req); sendJson(res, await companion.update(data.id, data.profile, data.revision)) })
  register(BASE_ROUTE + '/companion/rename', ['POST'], async (req, res) => { const data = await avatarBody(req); sendJson(res, await companion.rename(data.id, data.name)) })
  register(BASE_ROUTE + '/companion/delete', ['POST'], async (req, res) => { const data = await avatarBody(req); sendJson(res, await companion.remove(data.id)) })
  register(BASE_ROUTE + '/companion/asset', ['GET', 'HEAD'], async (req, res) => companion.serve(req, res, new URL(req.url, 'http://localhost').searchParams.get('id')))
  register(BASE_ROUTE + '/avatars.json', ['GET'], async (_req, res) => sendJson(res, await avatars.list()))
  register(BASE_ROUTE + '/avatars/upload', ['POST'], async (req, res) => {
    const filename = new URL(req.url, 'http://localhost').searchParams.get('filename')
    sendJson(res, { ok: true, item: await avatars.upload(req, filename) }, 201)
  })
  register(BASE_ROUTE + '/avatars/select', ['POST'], async (req, res) => { const data = await avatarBody(req); sendJson(res, await avatars.select(data.id, data.version)) })
  register(BASE_ROUTE + '/avatars/rename', ['POST'], async (req, res) => { const data = await avatarBody(req); sendJson(res, await avatars.rename(data.id, data.name)) })
  register(BASE_ROUTE + '/avatars/delete', ['POST'], async (req, res) => { const data = await avatarBody(req); const result = await avatars.remove(data.id); await companion.archiveProfile(data.id); sendJson(res, result) })
  register(BASE_ROUTE + '/avatar-model', ['GET', 'HEAD'], async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    await avatars.serve(req, res, url.searchParams.get('id'), url.searchParams.get('v'))
  })
  for (const asset of ['avatar-renderer.js', 'motion-worker.js']) register(BASE_ROUTE + '/' + asset, ['GET', 'HEAD'], async (req, res) => {
    const file = join(HERE, asset)
    res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.setHeader('cache-control', 'private, no-cache'); res.setHeader('x-content-type-options', 'nosniff')
    const body = readFileSync(file)
    res.setHeader('content-length', body.length); res.end(req.method === 'HEAD' ? undefined : body)
  })
  register(BASE_ROUTE + '/upload', ['POST'], async (req, res) => {
    const previousActive = (await resolveActive()).video?.id
    const filename = new URL(req.url, 'http://localhost').searchParams.get('filename')
    const { path, file } = await library.upload(req, filename)
    // Adding the first user file must not silently replace the default theme.
    // An explicit selection made in another tab while uploading still wins.
    if (readSelection() === null && previousActive && await findById(previousActive)) writeSelection(previousActive)
    catalog.invalidate()
    const video = (await listVideos()).find(v => v.path === path || v.paths?.includes(path))
    sendJson(res, { ok: true, name: file, id: video?.id ?? null }, 201)
  })
  register(BASE_ROUTE + '/trash.json', ['GET'], (_req, res) => sendJson(res, { items: library.listTrash(), retentionDays: 30 }))
  register(BASE_ROUTE + '/delete', ['POST'], async (req, res) => {
    const { id } = await jsonBody(req)
    const video = await findById(id)
    if (!video) throw new LibraryError(404, '找不到这个视频')
    if (video.source === 'env') throw new LibraryError(403, '外部片源不能在片库中删除')
    const wasActive = (await resolveActive()).video?.id === video.id
    const item = library.remove(video); catalog.invalidate()
    const active = (await resolveActive()).video
    if (wasActive) writeSelection(active?.id ?? null)
    sendJson(res, { ok: true, item: { id: item.id, name: item.name, expiresAt: item.expiresAt }, activeId: active?.id ?? null })
  })
  register(BASE_ROUTE + '/restore', ['POST'], async (req, res) => {
    const { id } = await jsonBody(req)
    const item = library.restore(id); catalog.invalidate()
    sendJson(res, { ok: true, name: item.name })
  })
  ctx.effect(() => {
    const cleanup = () => { try { library.cleanup() } catch (error) { console.error('[Harness- docket] 回收站清理失败:', error.message) } }
    cleanup()
    const timer = setInterval(cleanup, 60 * 60 * 1000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'harness-docket: trash retention')
}
