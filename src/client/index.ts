import { ensureUIStyle, UIIcon as LibraryIcon, useDialogFocus, tabKeys, useTransientNotice } from './ui'
/**
 * harness-docket - browser half.
 *
 * Plays the boot video full-frame in two cases:
 *   1. the conversation the user PINNED as their intro session, EVERY time it is
 *      opened (that is the "professional work mode" conversation they return to);
 *   2. a brand new, still-empty conversation, once per conversation.
 *
 * The pin exists because a specific conversation cannot be identified by name
 * from the client: session titles are not part of the session summary the client
 * holds, and asking a human for a session UUID is not a workflow. So the
 * floating dock includes a player button that pins the open conversation.
 *
 * Seating:
 *   - `shell.overlay` the animation, library, and collapsible floating dock.
 * It is a list slot, so the plugin is added without replacing host content.
 *
 * Which session is current comes from the ui-session service. Its
 * `adapter.current` store resolves to `{ key, hooks, keyedHooks, props }`, i.e.
 * `props.sessionId` and `hooks.session`. A brand new conversation is
 * `hooks.session.blankBit === true` (`blank` belongs to another package's
 * projected summary and is not on this snapshot).
 *
 * The transition plays muted in a fixed full-frame overlay. A dedicated skip
 * button closes it; the video itself has no controls or click actions.
 */

import { configurePreferences, readPreference, writePreference } from './preferences.js'
import { PlaybackController, SessionEntry } from './playback-controller.js'
import { AvatarDock } from './floating-avatar'
import { useSingleCompanion } from './single-companion'
import { usePlayback, getPlaybackState, setAutoplay, setPinned, setPlayback, advancePlayback, selectedFromList, refreshSelection, playbackDescription } from './playback-state'
import type { ReactElement } from 'react'
import { Fragment, createElement as h, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Slot service for both seats, ui-session for the current conversation. */
export const inject = ['slots', 'uiSession']

const LIST_URL = '/harness-docket/videos.json'
const SELECT_URL = '/harness-docket/select'
const UPLOAD_URL = '/harness-docket/upload'
const TRASH_URL = '/harness-docket/trash.json'
const DELETE_URL = '/harness-docket/delete'
const RESTORE_URL = '/harness-docket/restore'
// Instance-scoped preferences migrate the existing keys on first use.
const SEEN_KEY = 'dsh-boot-animation:seen'
const PIN_KEY = 'dsh-boot-animation:pinned'
const FIT_KEY = 'dsh-boot-animation:fit'
/** Never let a stalled video trap the user behind the overlay. */
const STALL_TIMEOUT_MS = 25000

/**
 * How the clip meets the window: 'cover' fills it and crops the overflow,
 * 'contain' shows the whole frame and leaves black bars. Cover by default,
 * because a splash that leaves bars on a normal monitor reads as broken.
 * Read per overlay open, like the clip choice, so a change lands next playback.
 */
type Fit = 'cover' | 'contain'
function readFit(): Fit {
  try {
    return readPreference(FIT_KEY) === 'contain' ? 'contain' : 'cover'
  } catch {
    return 'cover'
  }
}
function writeFit(fit: Fit): void {
  try {
    writePreference(FIT_KEY, fit)
  } catch {
    /* private mode: it simply does not persist */
  }
}

/** Set to true to narrate every decision the plugin makes in the browser console. */
const DEBUG = false
function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}
function narrate(text: string): void {
  try {
    console.log('[Harness- docket] ' + text)
  } catch {
    /* console unavailable */
  }
}
function log(...args: unknown[]): void {
  if (!DEBUG) return
  narrate(formatArgs(args))
}

/**
 * The always-on subset. A black overlay reports nothing by itself — no network
 * error, no thrown exception, just a video element that never paints — so the
 * four things needed to diagnose one from the outside are logged unconditionally:
 * which URL the element actually used, when the first frame arrived, when the
 * element errored and with which code, and when the stall watchdog gave up.
 * They are one line each and only fire on a play, so the noise is bounded.
 */
function notify(...args: unknown[]): void {
  narrate(formatArgs(args))
}

function readSeen(): string[] {
  try {
    const parsed = JSON.parse(readPreference(SEEN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

function hasPlayed(sessionId: string): boolean {
  return readSeen().includes(sessionId)
}

function markPlayed(sessionId: string): void {
  try {
    const seen = readSeen()
    if (!seen.includes(sessionId)) seen.push(sessionId)
    writePreference(SEEN_KEY, JSON.stringify(seen))
  } catch {
    /* private mode: it simply replays next time */
  }
}

function readPinned(): string | null {
  try {
    const value = readPreference(PIN_KEY)
    return value === null || value === '' ? null : value
  } catch {
    return null
  }
}

function writePinned(sessionId: string | null): void {
  try {
    if (sessionId === null) writePreference(PIN_KEY, null)
    else writePreference(PIN_KEY, sessionId)
  } catch {
    /* private mode: the pin simply does not persist */
  }
}

const STYLE_ID = 'harness-docket-style'
const CSS = `
.dba-root{position:fixed;inset:0;z-index:2147483000;background:#000;
  display:flex;align-items:center;justify-content:center;
  pointer-events:auto;cursor:default;overflow:hidden;user-select:none}
.dba-video{width:100%;height:100%;object-fit:contain;background:#000;display:block;pointer-events:none}
.dba-video::-webkit-media-controls{display:none!important}
/* The ONLY difference between the fit modes is object-fit.
   Do not "harden" this with position/inset changes: the bar fix does not need
   them, and an overlay that rendered correctly under flex + percentage sizing
   went fully black in the real app the one time the layout mechanics were
   rewritten for no reason. Minimal change, or you trade a cosmetic defect for
   a functional one.
   NOTE: never put a backtick in this block — the whole sheet is a template
   literal, and one backtick ends it. scripts/check-css-template.mjs enforces it. */
.dba-video.dba-cover{object-fit:cover;object-position:center}
.dba-skip{position:absolute;top:20px;right:22px;z-index:2;
  border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.55);
  color:#fff;border-radius:8px;padding:8px 18px;min-height:40px;
  font:inherit;font-size:13px;line-height:1.4;cursor:pointer}
.dba-skip:hover{background:rgba(0,0,0,.8)}
.dba-skip:focus-visible{outline:2px solid #fff;outline-offset:3px}
.dba-veil{position:fixed;inset:0;z-index:2147483200;background:var(--hdk-mask);
  display:flex;align-items:center;justify-content:center;padding:24px}
.dba-lib{--dba-muted:var(--hdk-muted);--dba-line:var(--hdk-line);--dba-accent:var(--hdk-accent);
  box-sizing:border-box;width:min(960px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;
  overflow:hidden;background:var(--hdk-surface);color:var(--hdk-text);border:1px solid var(--hdk-line);
  border-radius:var(--hdk-panel-radius);box-shadow:var(--hdk-shadow);font-family:inherit;font-size:13px;line-height:1.55}
.dba-lib *{box-sizing:border-box}
.dba-lib p{margin:0;color:var(--dba-muted);font-size:12px}
.dba-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:20px 24px 16px;flex-shrink:0}
.dba-lib h3{margin:0 0 6px;font-size:16px;font-weight:600;letter-spacing:-.04em;line-height:1.3}
.dba-btn:disabled,.dba-choice:disabled{opacity:.45;cursor:not-allowed}
.dba-icon{width:16px;height:16px;flex-shrink:0}
.dba-toolbar{display:flex;gap:16px;align-items:center;margin:0 24px;min-height:48px;border-bottom:1px solid var(--dba-line);flex-shrink:0}
.dba-tabs{display:flex;gap:24px;align-self:stretch;flex:1}
.dba-count{font-size:12px;font-variant-numeric:tabular-nums;padding:1px 6px;border-radius:5px;background:var(--hdk-line);color:var(--hdk-muted)}
.dba-upload{margin-bottom:8px}
.dba-content{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--hdk-line) transparent;padding:16px 24px 24px}
.dba-section-note{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;color:var(--dba-muted);font-size:12px}
.dba-section-note strong{font-weight:500;color:var(--hdk-muted)}
.dba-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.dba-item{min-width:0;position:relative;border:1px solid var(--dba-line);border-radius:var(--hdk-radius);background:var(--hdk-surface);transition:border-color .15s,background .15s}
.dba-item:hover{border-color:var(--hdk-line);background:var(--hdk-hover)}
.dba-item.dba-cur{border-color:var(--hdk-accent);background:var(--hdk-selected);box-shadow:none}
.dba-choice{width:100%;min-width:0;display:flex;flex-direction:column;background:transparent;
  border:0;border-radius:11px;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:0;overflow:hidden}
.dba-thumb{display:block;position:relative;width:100%;aspect-ratio:16/9;background:var(--hdk-subtle);overflow:hidden}
.dba-thumb video{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;opacity:0;transition:opacity .2s}
.dba-thumb.dba-thumb-ready video{opacity:1}
.dba-thumb-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--hdk-muted);font-size:12px}
.dba-thumb-fallback .dba-icon{width:26px;height:26px}
.dba-duration{position:absolute;right:9px;bottom:9px;padding:2px 6px;border-radius:4px;background:#080b12cc;color:#fff;
  font-size:12px;line-height:1.5;font-variant-numeric:tabular-nums}
.dba-selected{position:absolute;top:10px;left:10px;display:flex;align-items:center;gap:4px;
  padding:3px 7px;border:1px solid var(--hdk-line);border-radius:5px;background:var(--hdk-surface);color:var(--hdk-text);font-size:12px;pointer-events:none}
.dba-selected .dba-icon{width:12px;height:12px}
.dba-details{min-width:0;display:flex;flex-direction:column;gap:5px}
.dba-choice .dba-details{width:100%;padding:12px 48px 12px 12px}
.dba-nm{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500}
.dba-details small{color:var(--dba-muted);font-size:12px;line-height:1.5}
.dba-btn.dba-delete{position:absolute;right:8px;bottom:12px}

.dba-b-warn{display:block;padding:0 13px 10px;color:var(--hdk-warning);font-size:12px}
.dba-item:has(.dba-b-warn) .dba-delete{bottom:42px}
.dba-footer{flex-shrink:0;background:var(--hdk-surface);border-top:1px solid var(--dba-line);padding:16px 24px}
.dba-current{display:flex;align-items:center;gap:9px;min-width:0;flex:1}
.dba-current>.dba-icon{color:var(--dba-accent);width:20px;height:20px}
.dba-current .dba-details{gap:2px;flex:1}
.dba-current .dba-details small{font-size:12px}
.dba-bar{display:flex;align-items:center;gap:16px}
.dba-btn.dba-btn-preview{flex-shrink:0}
.dba-settings{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding-top:16px;margin-top:16px;border-top:1px solid var(--dba-line)}
.dba-fit{display:flex;flex-wrap:wrap;align-items:center;gap:12px;color:var(--dba-muted);font-size:12px}
.dba-fit-options{display:flex;gap:2px;border:1px solid var(--dba-line);padding:3px;border-radius:8px;background:var(--hdk-subtle)}
.dba-msg{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--dba-muted);overflow-wrap:anywhere}
.dba-msg{min-height:24px;margin-top:8px}.dba-msg:not(:empty){padding-top:0}
.dba-msg .dba-btn{flex-shrink:0;min-height:28px;font-size:12px;padding:5px 9px}
.dba-msg.dba-ok{color:var(--hdk-success)}.dba-msg.dba-err{color:var(--hdk-danger)}
.dba-progress{display:flex;gap:12px;align-items:center;padding:12px 24px 0;font-size:12px;color:var(--dba-accent)}
.dba-progress progress{flex:1;min-width:0;height:5px;accent-color:var(--hdk-accent)}
.dba-trash-note{display:flex;align-items:flex-start;gap:10px;padding:0 0 12px;border:0;border-radius:0;margin-bottom:16px;color:var(--dba-muted)}
.dba-trash-note>.dba-icon{margin-top:2px;color:var(--dba-accent)}
.dba-trash-list{display:flex;flex-direction:column;gap:8px}
.dba-trash-item{display:flex;align-items:center;gap:14px;padding:14px}
.dba-trash-item>.dba-icon{width:22px;height:22px;color:var(--hdk-muted)}
.dba-trash-item .dba-details{flex:1}.dba-trash-item small{overflow-wrap:anywhere}
.dba-empty{grid-column:1/-1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;
  min-height:180px;padding:25px;text-align:center;color:var(--dba-muted);font-size:12px}
.dba-empty>.dba-icon{width:32px;height:32px;color:var(--hdk-muted)}
.dba-empty strong{font-size:14px;font-weight:500;color:var(--hdk-text)}
@media(max-width:760px){.dba-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dba-section-note{align-items:flex-start;flex-direction:column;gap:4px}}
@media(max-width:520px){.dba-veil{padding:10px}.dba-lib{max-height:calc(100dvh - 20px);border-radius:var(--hdk-panel-radius)}
.dba-header{padding:20px 18px 14px;gap:10px}.dba-lib h3{font-size:16px}.dba-header p{font-size:12px;max-width:260px}
.dba-toolbar{margin:0 18px;gap:10px}.dba-tabs{gap:16px}.dba-tabs .dba-icon{display:none}
.dba-upload{padding:7px 10px;font-size:12px}.dba-content{padding:16px 18px 20px}.dba-grid{grid-template-columns:minmax(0,1fr);gap:14px}
.dba-footer{padding:15px 18px}.dba-bar{gap:12px}.dba-btn.dba-btn-preview{flex-shrink:0}
.dba-current>.dba-icon{display:none}.dba-settings{gap:6px;padding-top:12px;margin-top:12px}.dba-fit{gap:7px}.dba-refresh{padding:6px}.dba-progress{padding:12px 18px 0}.dba-msg{flex-wrap:wrap;gap:8px}
.dba-trash-item{gap:10px;padding:12px}.dba-trash-item>.dba-icon{display:none}}
@media(max-height:650px){.dba-lib{overflow:auto}.dba-content{overflow:visible;flex-shrink:0}.dba-header{padding-top:16px;padding-bottom:12px}}
@media(prefers-reduced-motion:reduce){.dba-lib *{transition:none!important}}


`

function ensureStyle(): void {
  ensureUIStyle()
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

type CurrentStore = {
  getSnapshot: () => unknown
  subscribe: (listener: () => void) => () => void
}

/** Resolved ui-session binding as the built-in source publishes it. */
type Binding = {
  key?: unknown
  hooks?: {
    session?: {
      /** The snapshot's own "this conversation is still empty" flag. */
      blankBit?: unknown
    }
  }
  keyedHooks?: unknown
  props?: { sessionId?: unknown }
}

const noopSubscribe = () => () => {}

/** Subscribe to the current-conversation store, tolerating its absence. */
function useCurrentSession(store: CurrentStore | null): {
  sessionId: string | null
  isNewConversation: boolean
} {
  const binding = useSyncExternalStore(
    store === null ? noopSubscribe : store.subscribe,
    store === null ? () => null : store.getSnapshot,
  ) as Binding | null
  const sessionId = typeof binding?.props?.sessionId === 'string' ? binding.props.sessionId : null
  return { sessionId, isNewConversation: binding?.hooks?.session?.blankBit === true }
}

function BootOverlay({
  store,
  previewAt = 0,
}: {
  store: CurrentStore | null
  /** Bumped by the library's preview button to force a play right now. */
  previewAt?: number
}): ReactElement | null {
  ensureStyle()

  const { sessionId, isNewConversation } = useCurrentSession(store)
  // Decided per open, so a change in the library panel lands on the next play.
  const fit = readFit()
  const playback = usePlayback()
  const source = useRef<'auto' | 'preview'>('auto')

  const [showing, setShowing] = useState(false)
  /**
   * Resolve the selected clip at each open, then keep it fixed during playback.
   * The overlay stays mounted when the library opens, so returning from the
   * library must not reset session-entry or preview tracking.
   */
  const [src, setSrc] = useState('')
  const [playId, setPlayId] = useState(0)
  const controller = useRef(new PlaybackController()), entry = useRef(new SessionEntry())
  const playbackSession = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const close = useCallback((state = 'skipped', expected?: number) => {
    if (expected !== undefined && controller.current.generation !== expected) return
    const activePlay = getPlaybackState().play
    setPlayback({ ...activePlay, phase: state as any })
    notify('playback ' + state)
    if (state === 'completed' && source.current === 'auto' && playbackSession.current) markPlayed(playbackSession.current)
    controller.current.cancel()
    setShowing(false)
    const video = videoRef.current
    if (video !== null) {
      try {
        video.pause()
      } catch {
        /* already stopped */
      }
    }
  }, [])

  const open = useCallback((id: string | null = null) => {
    setShowing(false)
    notify('playback attempted')
    source.current = id === null ? 'preview' : 'auto'
    const pending = controller.current.open(id)
    const generation = controller.current.generation, origin = source.current
    setPlayback({ phase: 'resolving', source: origin, playId: generation })
    void pending.then(play => {
      if (!play || generation !== controller.current.generation) return
      setPlayback({ phase: 'loading', source: origin, playId: play.playId, id: play.id, version: play.version, name: play.name })
      playbackSession.current = id; setSrc(play.src); setPlayId(play.playId); setShowing(true)
    }).catch(error => { if (generation === controller.current.generation) { notify('playback failed', error.message); setPlayback({ ...getPlaybackState().play, phase: 'failed' }) } })
  }, [])
  useEffect(() => () => controller.current.cancel(), [])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('harness-docket:playback', { detail: showing }))
    return () => { window.dispatchEvent(new CustomEvent('harness-docket:playback', { detail: false })) }
  }, [showing])
  useEffect(() => {
    if (entry.current.id !== sessionId) close('left')
    if (entry.current.update(sessionId, isNewConversation, getPlaybackState().pinned, sessionId ? hasPlayed(sessionId) : false, playback.enabled)) open(sessionId)
  }, [sessionId, isNewConversation, open, close, playback.enabled])
  useEffect(() => { if (!playback.enabled && source.current === 'auto' && (controller.current.pending || showing)) close('disabled') }, [playback.enabled, showing, close])

  // An explicit preview from the library. This exists because the normal trigger
  // is deliberately narrow — a NEW conversation plays once, and only a PINNED one
  // replays — so "I switched the clip and refreshed and the other one never
  // showed" was the expected behaviour of a design with no way to check your
  // choice. A preview button removes that guesswork.
  useEffect(() => {
    if (previewAt === 0) return
    log('preview requested', previewAt)
    open()
  }, [previewAt, open])

  // Start playback explicitly: relying on the autoplay attribute alone is
  // fragile. Playback failures close the overlay without adding interactive UI.
  useEffect(() => {
    if (!showing) return undefined
    const video = videoRef.current
    if (video === null) return undefined
    video.muted = true
    const openedAt = performance.now()
    let active = true
    let lastProgressAt = openedAt
    let lastTime = video.currentTime
    /** One line that carries everything a black-frame report needs. */
    const report = (label: string): void =>
      notify(label, {
        ms: Math.round(performance.now() - openedAt),
        readyState: video.readyState,
        networkState: video.networkState,
        src: video.currentSrc || video.src,
      })
    const onPlaying = (): void => {
      if (!active) return
      advancePlayback(playId, 'playing'); report('playback started')
    }
    const onWaiting = () => { if (active) advancePlayback(playId, 'buffering') }
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    const attempt = video.play()
    if (attempt !== undefined && typeof attempt.then === 'function') {
      attempt.then(() => log('play started')).catch((error: unknown) => {
        if (!active) return
        notify('play rejected', String(error))
        close('failed', playId)
      })
    }
    // Limit time without progress, never the duration of a healthy video.
    const guard = window.setInterval(() => {
      const now = performance.now()
      if (document.hidden || video.currentTime !== lastTime) {
        lastProgressAt = now
        lastTime = video.currentTime
      } else if (now - lastProgressAt >= STALL_TIMEOUT_MS) {
        report('stalled, no progress for ' + STALL_TIMEOUT_MS + 'ms')
        close('failed', playId)
      }
    }, 1000)
    return () => {
      active = false
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      window.clearInterval(guard)
    }
  }, [showing, src, playId, close])

  if (!showing) return null

  const blockInteraction = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return h(
    'div',
    {
      className: 'dba-root hdk-ui',
      onClick: blockInteraction,
      onDoubleClick: blockInteraction,
      onContextMenu: blockInteraction,
    },
    h('video', {
      key: playId,
      ref: videoRef,
      className: fit === 'cover' ? 'dba-video dba-cover' : 'dba-video',
      src,
      muted: true,
      autoPlay: true,
      loop: false,
      playsInline: true,
      controls: false,
      controlsList: 'nodownload nofullscreen noremoteplayback',
      disablePictureInPicture: true,
      disableRemotePlayback: true,
      tabIndex: -1,
      preload: 'auto',
      onEnded: () => close('completed', playId),
      onError: () => {
        const video = videoRef.current
        const code = video?.error?.code ?? 0
        const message = video?.error?.message ?? ''
        notify('video element error', { code, message, src: video?.currentSrc || src, readyState: video?.readyState ?? -1 })
        close('failed', playId)
      },
    }),
    h('button', {
      type: 'button',
      className: 'dba-skip',
      'aria-label': '跳过启动动画',
      onClick: (event: { stopPropagation: () => void }) => {
        event.stopPropagation()
        close('skipped', playId)
      },
    }, '跳过'),
  )
}

/** Keep the existing session replay behavior behind the movable avatar. */
function FloatingDock({ store, onOpen, suspended }: { store: CurrentStore | null; onOpen: () => void; suspended: boolean }): ReactElement {
  const { sessionId } = useCurrentSession(store)
  const playback = usePlayback()
  useEffect(() => { void refreshSelection() }, [])
  const playerTitle = '自动播放：' + (playback.enabled ? '开' : '关')
  return h(AvatarDock, { sessionId, isPinned: playback.enabled, playerDisabled: false, playerTitle, onPlayer: () => setAutoplay(!getPlaybackState().enabled), onOpenLibrary: onOpen, suspended })
}

/** One entry as the host lists it. */
type VideoInfo = {
  id: string
  name: string
  file: string
  ext?: string
  source: string
  writable?: boolean
  bytes: number
  mtime: string
  version?: string | null
  legacy?: boolean
  faststart?: boolean
  copies?: number
  alsoAt?: string[]
  active?: boolean
  deletable?: boolean
}

type VideoList = {
  activeId: string | null
  activeVersion?: string | null
  maxUploadBytes?: number
  accepts?: string[]
  activeHow?: string
  videos: VideoInfo[]
  userDir: string
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}

/**
 * Where a clip comes from, as one word a user can act on.
 *
 * The plugin's clips are embedded in code now, so there is a single built-in
 * kind; anything else on the list is a file the user put there.
 */
const SOURCE_LABEL: Record<string, string> = {
  yours: '我的上传',
  embedded: '内置片头',
  env: '外部片源',
}

type TrashItem = { id: string; name: string; bytes: number; deletedAt: number; expiresAt: number }
/** Load a still only when its card approaches the viewport; never autoplay the library. */
function VideoThumbnail({ video }: { video: VideoInfo }): ReactElement {
  const frame = useRef<HTMLSpanElement | null>(null)
  const media = useRef<HTMLVideoElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [duration, setDuration] = useState('')
  useEffect(() => {
    const element = frame.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { root: element.closest('.dba-content'), rootMargin: '100px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const element = media.current
    return () => { if (element) { element.removeAttribute('src'); element.load() } }
  }, [visible])
  const src = '/harness-docket/media/' + encodeURIComponent(video.id) + (video.version ? '?v=' + encodeURIComponent(video.version) : '')
  return h('span', { ref: frame, className: 'dba-thumb' + (ready ? ' dba-thumb-ready' : ''), 'aria-hidden': true },
    visible ? h('video', { ref: media, src, muted: true, playsInline: true, preload: 'metadata', tabIndex: -1,
      onLoadedMetadata: (event: { currentTarget: HTMLVideoElement }) => {
        const element = event.currentTarget
        if (Number.isFinite(element.duration) && element.duration > 0) {
          const seconds = Math.floor(element.duration)
          setDuration(Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'))
          element.currentTime = Math.min(2, element.duration * .18)
        }
      },
      onSeeked: () => setReady(true),
      onError: () => { setFailed(true); setReady(false) },
    }) : null,
    ready ? null : h('span', { className: 'dba-thumb-fallback' }, h(LibraryIcon, { kind: 'film' }), failed ? '暂无封面' : '正在读取封面'),
    duration ? h('span', { className: 'dba-duration' }, duration) : null)
}
async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options })
  const data = await response.json()
  if (!response.ok || data.ok === false) throw new Error(data.error ?? '请求失败，请重新登录或稍后重试')
  return data as T
}
function VideoLibrary({ onClose, onPreview, sessionId }: { onClose: () => void; onPreview: () => void; sessionId: string | null }): ReactElement {
  ensureStyle()
  const playback = usePlayback()
  const [state, setState] = useState<VideoList | null>(null)
  const [trash, setTrash] = useState<TrashItem[]>([])
  const [tab, setTab] = useState<'library' | 'trash'>('library')
  const [fit, setFit] = useState<Fit>(() => readFit())
  const [msg, setMsg] = useState({ text: '', kind: '' })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [undo, setUndo] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const uploadRequest = useRef<XMLHttpRequest | null>(null)
  const dialog = useRef<HTMLDivElement | null>(null)
  const operation = useRef(false)

  const load = useCallback(async () => {
    const [data, bin] = await Promise.all([
      requestJson<VideoList>(LIST_URL), requestJson<{ items: TrashItem[] }>(TRASH_URL),
    ])
    setState(data)
    selectedFromList(data)
    setTrash(bin.items)
  }, [])
  useEffect(() => { void load().catch(error => setMsg({ text: '读取片库失败：' + String(error.message), kind: 'dba-err' })) }, [load])
  useDialogFocus(dialog, onClose)
  useEffect(() => () => uploadRequest.current?.abort(), [])
  useTransientNotice(msg.text, () => setMsg({ text: '', kind: '' }), msg.kind !== 'dba-ok' || !!undo)

  const perform = async (action: () => Promise<void>) => {
    if (operation.current) return
    operation.current = true; setBusy(true); setMsg({ text: '', kind: '' })
    try { await action() }
    catch (error) { setMsg({ text: error instanceof Error ? error.message : String(error), kind: 'dba-err' }) }
    finally { operation.current = false; setBusy(false) }
  }
  const post = <T,>(url: string, id: string) => requestJson<T>(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
  })
  const choose = (id: string) => perform(async () => {
    const data = await post<{ name: string }>(SELECT_URL, id)
    await load()
    setMsg({ text: '已设为片头：' + data.name, kind: 'dba-ok' })
  })
  const remove = (video: VideoInfo) => perform(async () => {
    const data = await post<{ item: TrashItem }>(DELETE_URL, video.id)
    setUndo(data.item.id)
    await load()
    setMsg({ text: '已将「' + video.name + '」移入回收站，30 天内可恢复。', kind: 'dba-ok' })
  })
  const restore = (id: string) => perform(async () => {
    const data = await post<{ name: string }>(RESTORE_URL, id)
    setUndo(null)
    await load()
    setMsg({ text: '已恢复「' + data.name + '」，可在片库中选择。', kind: 'dba-ok' })
  })
  const upload = (file: File) => perform(async () => {
    if (file.size === 0 || file.size > (state?.maxUploadBytes ?? 250 * 1024 * 1024)) throw new Error('请选择不超过 250 MB 的非空视频')
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!(state?.accepts ?? ['.mp4', '.m4v', '.mov', '.webm', '.mkv']).includes(ext)) throw new Error('请选择 MP4、M4V、MOV、WebM 或 MKV 视频')
    setProgress(0)
    try {
      const result = await new Promise<{ name: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest(); uploadRequest.current = xhr
        xhr.open('POST', UPLOAD_URL + '?filename=' + encodeURIComponent(file.name))
        xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)) }
        xhr.onload = () => {
          try { const data = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(data); else reject(new Error(data.error ?? '上传失败')) }
          catch { reject(new Error('上传失败，请重新登录或稍后重试')) }
        }
        xhr.onerror = () => reject(new Error('网络中断，视频未上传完成'))
        xhr.onabort = () => reject(new Error('已取消上传'))
        xhr.send(file)
      })
      await load(); setTab('library')
      setMsg({ text: '已上传「' + result.name + '」。点击视频即可切换为片头。', kind: 'dba-ok' })
    } finally { uploadRequest.current = null; setProgress(null) }
  })
  const videos = state?.videos ?? []
  const activeId = state?.activeId ?? null
  const active = videos.find(video => video.id === activeId)
  return h('div', { className: 'dba-veil hdk-ui', onClick: (event: { target: unknown; currentTarget: unknown }) => { if (event.target === event.currentTarget) onClose() } },
    h('div', { className: 'dba-lib', ref: dialog, role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'dba-library-title', 'aria-describedby': 'dba-library-description', tabIndex: -1 },
      h('header', { className: 'dba-header' },
        h('div', null,
          h('h3', { id: 'dba-library-title' }, '片头片库'),
          h('p', { id: 'dba-library-description', className: 'hdk-identity' }, 'Harness- docket · 插件')),
        h('button', { type: 'button', className: 'dba-btn dba-close', 'aria-label': '关闭片头片库', title: '关闭 · Esc', onClick: onClose }, h(LibraryIcon, { kind: 'close' }))),
      h('div', { className: 'dba-playback-settings' },
        h('label', null, h('input', { type: 'checkbox', checked: playback.enabled, onChange: (e: any) => setAutoplay(e.target.checked) }), '片头自动播放：' + (playback.enabled ? '开' : '关')),
        h('label', null, h('input', { type: 'checkbox', disabled: !sessionId, checked: !!sessionId && playback.pinned === sessionId, onChange: (e: any) => setPinned(e.target.checked ? sessionId : null) }), '当前会话每次进入重播'),
        h('span', { role: 'status', className: 'dba-playback-status' }, playbackDescription(playback)),
        h('small', null, playback.enabled ? '新会话播放一次；手动预览独立可用。' : '所有自动片头已关闭，手动预览仍可使用。')),
      h('div', { className: 'dba-toolbar' },
        h('div', { className: 'dba-tabs', role: 'tablist', 'aria-label': '片库视图', onKeyDown: tabKeys },
          h('button', { type: 'button', className: 'dba-btn' + (tab === 'library' ? ' dba-btn-on' : ''), disabled: busy, role: 'tab', id: 'dba-tab-library', 'aria-controls': 'dba-library-panel', tabIndex: tab === 'library' ? 0 : -1, 'aria-selected': tab === 'library', 'aria-pressed': tab === 'library', onClick: () => setTab('library') },
            h(LibraryIcon, { kind: 'film' }), '视频', h('span', { className: 'dba-count' }, videos.length)),
          h('button', { type: 'button', className: 'dba-btn dba-trash-tab' + (tab === 'trash' ? ' dba-btn-on' : ''), disabled: busy, role: 'tab', id: 'dba-tab-trash', 'aria-controls': 'dba-library-panel', tabIndex: tab === 'trash' ? 0 : -1, 'aria-selected': tab === 'trash', 'aria-pressed': tab === 'trash', onClick: () => setTab('trash') },
            h(LibraryIcon, { kind: 'delete' }), '回收站', h('span', { className: 'dba-count' }, trash.length))),
        h('input', { ref: fileInput, type: 'file', hidden: true, accept: '.mp4,.m4v,.mov,.webm,.mkv', onChange: (event: { currentTarget: HTMLInputElement }) => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file)
        } }),
        h('button', { type: 'button', className: 'dba-btn dba-upload', disabled: busy || !state, onClick: () => fileInput.current?.click() }, h(LibraryIcon, { kind: 'upload' }), '上传视频')),
      progress === null ? null : h('div', { className: 'dba-progress' },
        h('progress', { value: progress, max: 100, 'aria-label': '视频上传进度' }),
        h('span', null, progress === 100 ? '正在保存…' : progress + '%'),
        h('button', { type: 'button', className: 'dba-btn', onClick: () => uploadRequest.current?.abort() }, '取消')),
      h('div', { className: 'dba-content', id: 'dba-library-panel', role: 'tabpanel', 'aria-labelledby': 'dba-tab-' + tab, 'aria-busy': busy || (!state && msg.kind !== 'dba-err') },
        tab === 'library' ? h('div', null,
          h('div', { className: 'dba-section-note' }, h('strong', null, '点击封面，设为会话片头'), h('span', null, '单个视频 ≤ 250 MB · 推荐 MP4（H.264）')),
          h('div', { className: 'dba-grid' },
            ...videos.map(v => h('div', { key: v.id, className: 'dba-item' + (v.id === activeId ? ' dba-cur' : '') },
              h('button', { type: 'button', className: 'dba-choice', disabled: busy, 'aria-pressed': v.id === activeId,
                'aria-label': '使用 ' + v.name, onClick: () => { if (v.id !== activeId) void choose(v.id) } },
                h(VideoThumbnail, { key: v.version ?? v.mtime, video: v }),
                h('span', { className: 'dba-details' }, h('span', { className: 'dba-nm', title: v.name }, v.name),
                  h('small', null, (SOURCE_LABEL[v.source] ?? v.source) + ' · ' + formatBytes(v.bytes) + ((v.copies ?? 1) > 1 ? ' · 已合并 ' + v.copies + ' 份' : '')))),
              v.id === activeId ? h('span', { className: 'dba-selected' }, h(LibraryIcon, { kind: 'check' }), '当前片头') : null,
              (v.ext === '.mp4' || v.ext === '.m4v') && v.faststart === false ? h('span', { className: 'dba-b-warn', title: '此视频可能需要下载完成后才能播放' }, '加载可能较慢') : null,
              v.deletable !== false ? h('button', { type: 'button', className: 'dba-btn dba-delete', disabled: busy,
                'aria-label': '删除 ' + v.name, title: '移入回收站，30 天内可恢复', onClick: () => void remove(v) }, h(LibraryIcon, { kind: 'delete' })) : null)),
            videos.length ? null : h('div', { className: 'dba-empty' }, h(LibraryIcon, { kind: 'film' }),
              h('strong', null, state ? '暂无视频' : msg.kind === 'dba-err' ? '暂时无法读取片库' : '正在读取片库…'),
              h('span', null, state ? '上传喜欢的视频，或从回收站恢复。' : msg.kind === 'dba-err' ? '请点击刷新重试。' : '正在获取视频列表。'))))
        : h('div', null,
          h('div', { className: 'dba-trash-note' }, h(LibraryIcon, { kind: 'restore' }), h('p', null, '删除的视频保留 30 天，到期自动清理。恢复后可重新选择，同名文件会另存。')),
          h('div', { className: 'dba-trash-list' },
            ...trash.map(item => h('div', { key: item.id, className: 'dba-item dba-trash-item' },
              h(LibraryIcon, { kind: 'film' }),
              h('span', { className: 'dba-details' }, h('span', { className: 'dba-nm', title: item.name }, item.name),
                h('small', null, formatBytes(item.bytes) + ' · 剩余 ' + Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 86400000)) + ' 天 · ' + new Date(item.expiresAt).toLocaleDateString() + ' 到期')),
              h('button', { type: 'button', className: 'dba-btn dba-restore', disabled: busy, onClick: () => void restore(item.id), 'aria-label': '恢复 ' + item.name }, h(LibraryIcon, { kind: 'restore' }), '恢复')))),
          trash.length ? null : h('div', { className: 'dba-empty' }, h(LibraryIcon, { kind: 'delete' }), h('strong', null, '回收站是空的'), h('span', null, '删除的视频会在这里保留 30 天。')))),
      h('footer', { className: 'dba-footer' },
        h('div', { className: 'dba-bar' },
          h('div', { className: 'dba-current' }, h(LibraryIcon, { kind: 'play' }),
            h('div', { className: 'dba-details' }, h('small', null, '当前片头 · 用于新会话和指定会话'), h('span', { className: 'dba-nm', title: active?.name }, active?.name ?? (state ? '尚未选择片头' : '正在读取…')))),
          h('button', { type: 'button', className: 'dba-btn dba-btn-preview', disabled: busy || !activeId, onClick: onPreview }, h(LibraryIcon, { kind: 'play' }), '预览当前')),
        h('div', { className: 'dba-settings' },
          tab === 'library' ? h('div', { className: 'dba-fit' }, h('span', null, '画面适配'),
            h('div', { className: 'dba-fit-options', role: 'group', 'aria-label': '画面适配' },
              ...(['cover', 'contain'] as Fit[]).map(mode => h('button', { key: mode, type: 'button', className: 'dba-btn' + (fit === mode ? ' dba-btn-on' : ''),
                'aria-pressed': fit === mode, title: mode === 'cover' ? '填满屏幕，可能裁切画面边缘' : '保留完整画面，可能显示黑边',
                onClick: () => { writeFit(mode); setFit(mode) } }, h(LibraryIcon, { kind: mode }), mode === 'cover' ? '铺满屏幕' : '完整显示')))) : h('p', null, '恢复后，在片库中重新选择'),
          h('button', { type: 'button', className: 'dba-btn dba-refresh', disabled: busy, onClick: () => void perform(async () => { await load(); setMsg({ text: '片库已刷新', kind: 'dba-ok' }) }) }, h(LibraryIcon, { kind: 'refresh' }), '刷新')),
        h('div', { className: 'dba-msg ' + msg.kind, role: msg.kind === 'dba-err' ? 'alert' : 'status', 'aria-live': 'polite' }, msg.text,
          undo && trash.some(item => item.id === undo) ? h('button', { type: 'button', className: 'dba-btn', disabled: busy, onClick: () => void restore(undo) }, '撤销删除') : null))))
}

type ClientContext = {
  slots: {
    inject: (name: string, register: () => unknown) => unknown
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  uiSession?: { adapter?: { current?: CurrentStore } }
  effect?: (callback: () => unknown, label?: string) => unknown
}

export function apply(ctx: ClientContext): void {
  const candidate = ctx.uiSession?.adapter?.current
  const store =
    candidate !== undefined &&
    typeof candidate.getSnapshot === 'function' &&
    typeof candidate.subscribe === 'function'
      ? candidate
      : null
  log('apply', { hasUiSession: ctx.uiSession !== undefined, hasStore: store !== null })

  // Rendering a JSX-free tree on purpose (createElement), so no provider
  // element is involved. Hooks live in AppRoot, never in apply: apply is called
  // by the plugin loader, not by React, and a hook call there would throw.
  const AppRoot = () => {
    const owned = useSingleCompanion()
    const { sessionId } = useCurrentSession(store)
    const [ready, setReady] = useState(false)
    useEffect(() => {
      const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 8000)
      fetch('/harness-docket/client-config.json', { cache: 'no-store', signal: abort.signal }).then(r => { if (!r.ok) throw new Error('读取配置失败'); return r.json() }).then(data => { if (typeof data.namespace === 'string') configurePreferences(data.namespace) }).catch(() => {}).finally(() => { clearTimeout(timeout); setReady(true) })
      return () => { clearTimeout(timeout); abort.abort() }
    }, [])
    const [libOpen, setLibOpen] = useState(false)
    // Only an explicit preview increments this request counter.
    const [previewAt, setPreviewAt] = useState(0)

    // Keep BootOverlay mounted: remounting it on library close replays the old
    // preview counter and treats a pinned session as a fresh entry.
    if (!ready || !owned) return null
    return h(Fragment, null,
      h(BootOverlay, { store, previewAt }),
      h(FloatingDock, { store, onOpen: () => setLibOpen(true), suspended: libOpen }),
      libOpen ? h(VideoLibrary, { sessionId,
        onClose: () => setLibOpen(false),
        onPreview: () => {
          setLibOpen(false)
          setPreviewAt((n) => n + 1)
        },
      }) : null,
    )
  }

  // Slot names are inlined on purpose: the injector's pre-flight check reads
  // register() calls statically and cannot follow a constant.
  const mount = () => {
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register({ name: 'shell.overlay', id: 'harness-docket', order: 900 }, AppRoot),
    )
  }
  if (typeof ctx.effect === 'function') ctx.effect(mount, 'harness-docket: mounts')
  else mount()
}
