import { ensureUIStyle, UIIcon as Icon, useDialogFocus, tabKeys, useTransientNotice } from './ui'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import style from './avatar.css'
import { CompanionControls, Sticker, defaultProfile, type CompanionData, type Profile, type Binding, type Interaction } from './companion-controls'
import { ActivityClock } from './activity-clock.js'
import { preferenceKey } from './preferences.js'
import { MotionInspector } from './motion-inspector'
import { createInteractionPicker, interactionChoices } from './companion-random.js'
import { useAttachedMenu, MenuToggle, LayoutDebug, type MenuPreferences } from './attached-menu'
import { overlapsMask } from './attached-menu-layout.js'
import { advanceRoam } from './companion-roam.js'
import { AlphaCharacter } from './alpha-character'
import { CompanionNotice, CompanionVoiceSettings, useCompanionVoice, type CompanionVoice } from './companion-feedback'
import { PocketMenu } from './pocket-menu'
import { pocketMenuLayout } from './pocket-menu-layout.js'
import { useWorkStatus } from './work-status'
import { behaviorPriority, createDailyPicker } from './companion-behavior.js'

type Item = { id: string; name: string; source: string; format: string; version: string; human: boolean; rigged: boolean; boneCount: number; bytes: number; animations?: number; author?: string; license?: string; sourceUrl?: string; clips?: Record<string, any> }
type Catalog = { items: Item[]; activeId: string; errors: { name: string; error: string }[]; maxBytes: number }
import { DEFAULT_CHARACTER } from './default-character.js'
const DEFAULT: Item = DEFAULT_CHARACTER
const SETTINGS = 'harness-docket:avatar-position:v1'
let rendererModule: Promise<any> | null = null
const renderer = () => rendererModule ??= import('/harness-docket/avatar-renderer.js?v=' + __HARNESS_DOCKET_VERSION__).catch(e => { rendererModule = null; throw e })
const keyOf = (item: Item) => item.id + ':' + item.version
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
async function request(path: string, data?: object) {
  const response = await fetch('/harness-docket/' + path, data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok || result.ok === false) throw Object.assign(new Error(result.error || '请求失败，请重新登录后重试'), { status: response.status })
  return result
}
function ensureStyle() {
  ensureUIStyle()
  if (document.getElementById('harness-docket-avatar-style')) return
  const sheet = document.createElement('style'); sheet.id = 'harness-docket-avatar-style'; sheet.textContent = style; document.head.appendChild(sheet)
}
function AvatarCanvas(props: React.ComponentProps<typeof ModelCanvas>) {
  const kind = props.item.format === 'alpha-video' ? 'alpha' : 'model'
  const [front, setFront] = useState(kind), lastReady = useRef(props), current = useRef(props.item)
  const committed = useRef(false), readyCapabilities = useRef<any>(null)
  current.current = props.item
  useEffect(() => {
    if (committed.current && front === kind && keyOf(lastReady.current.item) === keyOf(props.item)) {
      props.onReady?.(props.item); if (readyCapabilities.current) props.onCapabilities?.(readyCapabilities.current)
      props.onMotionStatus?.('ready', props.motionRevision || 0)
    }
  }, [kind, props.item.id, props.item.version])
  // Prepare a different renderer invisibly. Commit only after its first usable
  // frame; cancelling or failing the candidate leaves the previous pet intact.
  return <div className="hda-canvas-stack">{[...new Set([front, kind])].map(slot => {
    const candidate = slot === kind
    const value = candidate ? { ...props, onReady: (item: Item) => {
      if (keyOf(item) !== keyOf(current.current)) return
      committed.current = true; lastReady.current = props; setFront(kind); props.onReady?.(item)
    }, onCapabilities: (value: any) => { readyCapabilities.current = value; props.onCapabilities?.(value) } } : { ...lastReady.current, paused: true, onReady: undefined, onError: undefined, onMotionStatus: undefined, onTick: undefined, onLayout: undefined }
    return <div key={slot} className="hda-render-slot" style={{ visibility: slot === front ? 'inherit' : 'hidden' }} aria-hidden={slot !== front}>
      {slot === 'alpha' ? <AlphaCharacter {...value}/> : <ModelCanvas {...value}/>}
    </div>
  })}</div>
}
function ModelCanvas({ item, paused = false, action = 'walk', bones = false, angle = 0, pace = 1, oneShot = false, motion = null, motionRevision = 0, expression = '', intensity = .8, onCapabilities, onMotionStatus, onTick, onReady, onError, onLayout, pocketOpen = false, pocketSide = 1, pocketSuspended = false, onPocket, gazeMode = 'gentle', gazeEnabled = true, speaking = false }: { gazeMode?: string; gazeEnabled?: boolean; speaking?: boolean; pocketOpen?: boolean; pocketSide?: number; pocketSuspended?: boolean; onPocket?: (value: any) => void; onLayout?: (value: any) => void; item: Item; paused?: boolean; action?: string; bones?: boolean; angle?: number; pace?: number; oneShot?: boolean; motion?: Binding; motionRevision?: number; expression?: string; intensity?: number; onCapabilities?: (value: any) => void; onMotionStatus?: (value: string, revision: number) => void; onTick?: (delta: number) => void; onReady?: (item: Item) => void; onError?: (text: string) => void }) {
  const host = useRef<HTMLDivElement>(null), view = useRef<any>(null), callbacks = useRef({ onReady, onError, onCapabilities, onMotionStatus, onTick, onLayout, onPocket })
  const canTick = useRef(false)
  callbacks.current = { onReady, onError, onCapabilities, onMotionStatus, onTick, onLayout, onPocket }
  const [generation, setGeneration] = useState(0), [status, setStatus] = useState('loading'), [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    renderer().then(module => {
      if (cancelled || !host.current) return
      view.current = module.createAvatarView(host.current, { onPocket: (value: any) => callbacks.current.onPocket?.(value), onLayout: onLayout ? (value: any) => callbacks.current.onLayout?.(value) : undefined, onTick: (delta: number) => { if (canTick.current) callbacks.current.onTick?.(delta) }, onError: (text: string) => { setStatus('error'); setError(text); callbacks.current.onError?.(text) } })
      setGeneration(n => n + 1)
    }).catch(e => { if (!cancelled) { setStatus('error'); setError('无法加载 3D，快捷功能仍可使用'); callbacks.current.onError?.(message(e)) } })
    return () => { cancelled = true; view.current?.dispose(); view.current = null }
  }, [])
  useEffect(() => {
    if (!view.current) return
    const abort = new AbortController(); canTick.current = false; setStatus('loading'); setError('')
    view.current.load(item, abort.signal).then((ready: boolean) => {
      if (abort.signal.aborted || !ready) return
      setStatus('ready'); callbacks.current.onReady?.(item); callbacks.current.onCapabilities?.(view.current.capabilities())
    }).catch((e: unknown) => { if (!abort.signal.aborted) { setStatus('error'); setError(message(e)); callbacks.current.onError?.(message(e)) } })
    return () => abort.abort()
  }, [generation, item.id, item.version])
  useEffect(() => { view.current?.setPaused(paused) }, [generation, paused])
  useEffect(() => { view.current?.setPocket(pocketOpen, pocketSide, pocketSuspended) }, [generation, status, pocketOpen, pocketSide, pocketSuspended])
  useEffect(() => { view.current?.setAnimation(action); view.current?.setSkeleton(bones); view.current?.setAngle(angle) }, [generation, action, bones, angle])
  useEffect(() => {
    if (!view.current || status !== 'ready') return
    let active = true
    canTick.current = false
    callbacks.current.onMotionStatus?.('loading', motionRevision)
    view.current.setMotion(motion, oneShot).then(() => { if (active) { canTick.current = true; callbacks.current.onMotionStatus?.('ready', motionRevision) } }).catch((e: any) => { if (active) callbacks.current.onMotionStatus?.(e.name === 'AbortError' ? '动作加载已取消或超时，请重试' : message(e), motionRevision) })
    return () => { active = false }
  }, [generation, status, item.id, item.version, motion?.id, motion?.clip, oneShot, motionRevision])
  useEffect(() => { view.current?.setGaze(gazeMode, gazeEnabled); view.current?.setSpeaking(speaking) }, [generation, status, gazeMode, gazeEnabled, speaking])
  useEffect(() => { view.current?.setPace(pace) }, [generation, pace])
  useEffect(() => { view.current?.setExpression(expression, intensity) }, [generation, expression, intensity])
  return <div className="hda-canvas-wrap" data-status={status} data-motion-id={motion?.id || ''}>
    <div className="hda-canvas" ref={host}/>
    {status !== 'ready' && <span className="hda-loading-dot" role="status" aria-label={status === 'error' ? '角色加载失败' : '角色加载中'}/>}
    {error && <span className="hda-sr" role="status">{error}</span>}
  </div>
}
type Position = { x: number; y: number; size: number }
function initialPosition(): Position {
  try {
    const data = JSON.parse(localStorage.getItem(preferenceKey(SETTINGS)) || 'null')
    if (data && [data.x, data.y, data.size].every(Number.isFinite)) return { x: Math.min(1, Math.max(0, data.x)), y: Math.min(1, Math.max(0, data.y)), size: Math.min(300, Math.max(120, data.size)) }
  } catch {}
  return { x: .94, y: .75, size: 210 }
}
function persist(position: Position) { try { localStorage.setItem(preferenceKey(SETTINGS), JSON.stringify(position)) } catch {} }
export function AvatarDock({ sessionId, isPinned, playerDisabled, playerTitle, onPlayer, onOpenLibrary, suspended }: { sessionId: string | null; isPinned: boolean; playerDisabled: boolean; playerTitle: string; onPlayer: () => void; onOpenLibrary: () => void; suspended: boolean }) {
  ensureStyle()
  const [catalog, setCatalog] = useState<Catalog | null>(null), [failure, setFailure] = useState('')
  const [companion, setCompanion] = useState<CompanionData>({ assets: [], profiles: {} })
  const reloadCompanion = useCallback(async () => { setCompanion(await request('companion.json')) }, [])
  const [reaction, setReaction] = useState<Interaction | null>(null), [walking, setWalking] = useState(false), [heading, setHeading] = useState(0), [hovered, setHovered] = useState(false), [renderReady, setRenderReady] = useState(false)
  const activity = useRef(new ActivityClock()), reactionRef = useRef<Interaction | null>(null)
  const [reactionRevision, setReactionRevision] = useState(0), [reactionStarted, setReactionStarted] = useState(false)
  const pickInteraction = useRef(createInteractionPicker())
  const dailyPicker = useRef(createDailyPicker()), dailySeconds = useRef(0), workSeconds = useRef(0)
  const reactionKind = useRef('click'), work = useWorkStatus(sessionId), [finishedWork, setFinishedWork] = useState('')
  const workKey = sessionId + ':' + work.revision, workState = finishedWork === workKey ? null : work.state
  useEffect(() => { workSeconds.current = 0 }, [workKey])
  const [speaking, setSpeaking] = useState(false)
  const [retry, setRetry] = useState(0)
  const [expanded, setExpandedState] = useState(false), [manager, setManager] = useState(false), [covered, setCovered] = useState(!!(window as any).__HDK_STARTUP__?.active)
  const [position, setPosition] = useState(initialPosition), [viewport, setViewport] = useState({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight })
  const dock = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null), suppressClick = useRef(false)
  const positionRef = useRef(position); useEffect(() => { positionRef.current = position }, [position])
  const [dragging, setDragging] = useState(false), [measurement, setMeasurement] = useState<any>(null)
  const [touch, setTouch] = useState(() => matchMedia('(pointer:coarse)').matches)
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => { const media = matchMedia('(pointer:coarse)'); const change = () => setTouch(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change) }, [])
  const selected = catalog?.items.find(i => i.id === catalog.activeId) || DEFAULT
  const profile = companion.profiles[selected.id] || defaultProfile(selected.human && selected.source !== 'builtin' ? companion : undefined)
  const voice = useCompanionVoice(selected.id + ':' + sessionId, suspended || covered || dragging, setSpeaking)
  const alpha = selected.format === 'alpha-video'
  const thought = companion.assets.find(asset => asset.kind === 'motion' && (asset as any).key === 'think')
  const workInteraction = profile.interactions.find(i => i.id === profile.events?.[workState || ''] && i.enabled)
  const paused = suspended || manager || covered || dragging || expanded
  const behavior = behaviorPriority({ paused, reaction: reaction && reactionKind.current === 'click', work: workState, daily: reaction, walking })
  const height = Math.min(position.size, Math.max(64, viewport.height - 24)), width = height * (alpha ? 1 : .64) + 40
  const maxX = Math.max(0, viewport.width - width - 16), maxY = Math.max(0, viewport.height - height - 16)
  const left = 8 + maxX * positionRef.current.x, top = 8 + maxY * positionRef.current.y
  const measured = measurement?.id === selected.id && measurement?.version === selected.version ? measurement : null
  const layout = useAttachedMenu(measured, width - 40, height, { x: left, y: top }, viewport, profile.attachedMenu, touch, false)
  const [pocketFrame, setPocketFrame] = useState<any>(null), pocketBusy = useRef(false)
  pocketBusy.current = !!pocketFrame?.active
  const setExpanded = (value: boolean | ((previous: boolean) => boolean)) => { const next = typeof value === 'function' ? value(expanded) : value; if (next && !expanded) setPocketFrame(null); setExpandedState(next) }
  const arcRef = useRef<any>(null), arcKey = [selected.id, width, height, viewport.width, viewport.height, left, top].join(':')
  const arcIdentity = useRef(''), arcWasOpen = useRef(false)
  if (!arcRef.current || arcIdentity.current !== arcKey || expanded && !arcWasOpen.current) {
    arcRef.current = pocketMenuLayout({ measurement: measured, width: width - 40, height, origin: { x: left, y: top }, viewport, touch, side: profile.attachedMenu?.side })
    arcIdentity.current = arcKey
  }
  arcWasOpen.current = expanded
  const arc = arcRef.current
  useEffect(() => {
    if (!expanded || (!alpha && renderReady)) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !renderReady) { setPocketFrame({ instant: true, time: 4 }); return }
    const start = performance.now(), palm = { x: arc.center.x + arc.side * height * .10, y: arc.center.y }
    let frame = 0, previous = 0
    const tick = (now: number) => {
      frame = 0
      if (document.hidden) { frame = 0; return }
      if (now - start >= 1180 || now - previous >= 1000 / 30) {
        previous = now
        setPocketFrame({ active: true, time: Math.min(1.18, (now - start) / 1000), palm, release: [palm, palm, palm] })
      }
      if (now - start < 1180) frame = requestAnimationFrame(tick)
    }
    const resume = () => { if (!document.hidden && !frame) frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick); document.addEventListener('visibilitychange', resume)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', resume); setPocketFrame(null) }
  }, [expanded, alpha, renderReady])
  const bodyHit = (event: React.PointerEvent | React.MouseEvent) => !measured?.mask || overlapsMask(measured.mask, { x: event.clientX - (dock.current?.getBoundingClientRect().left || left), y: event.clientY - (dock.current?.getBoundingClientRect().top || top), width: 1, height: 1 }, 2)
  const load = useCallback(async () => { const data = await request('avatars.json'); setCatalog(data); setFailure(''); return data as Catalog }, [])
  useEffect(() => {
    // The host can stop bubbling pointer events outside its overlay slot.
    // Capture on window keeps a drag alive across the entire application.
    const moving = (event: PointerEvent) => {
      const start = drag.current
      if (!start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      if (!start.moved && Math.hypot(dx, dy) < 6) return
      start.moved = true; event.preventDefault(); setDragging(true); setExpanded(false)
      const next = { ...positionRef.current, x: maxX ? Math.min(1, Math.max(0, (start.left + dx - 8) / maxX)) : 0, y: maxY ? Math.min(1, Math.max(0, (start.top + dy - 8) / maxY)) : 0 }
      positionRef.current = next; setPosition(next)
    }
    const finish = (event: PointerEvent) => {
      const start = drag.current
      if (!start || event.pointerId !== start.id) return
      drag.current = null; setDragging(false)
      if (start.moved) { suppressClick.current = true; persist(positionRef.current) }
      if (trigger.current?.hasPointerCapture(event.pointerId)) trigger.current.releasePointerCapture(event.pointerId)
    }
    window.addEventListener('pointermove', moving, { capture: true, passive: false })
    window.addEventListener('pointerup', finish, true); window.addEventListener('pointercancel', finish, true)
    return () => { window.removeEventListener('pointermove', moving, true); window.removeEventListener('pointerup', finish, true); window.removeEventListener('pointercancel', finish, true) }
  }, [maxX, maxY])
  useEffect(() => { void load().catch(e => setFailure(message(e))) }, [load])
  useEffect(() => { void reloadCompanion().catch(e => setFailure(message(e))) }, [reloadCompanion])
  useEffect(() => { setRenderReady(false); setPocketFrame(null); setReaction(null); reactionRef.current = null; activity.current.cancel(); dailyPicker.current = createDailyPicker(); dailySeconds.current = 0 }, [selected.id])
  useEffect(() => { if (workState && reactionKind.current === 'daily') { activity.current.cancel(); reactionRef.current = null; setReaction(null) } }, [workKey])
  useEffect(() => {
    let frame = 0, last = 0, waitUntil = performance.now() + 1500
    let target = { x: Math.random(), y: Math.random() }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (last && now - last < 32) return
      const delta = last ? Math.min(.08, (now - last) / 1000) : 0; last = now
      if (expanded || pocketBusy.current) return
      if (!renderReady || !profile.roaming || reduced.matches || document.hidden || suspended || covered || manager || expanded || hovered || workState || trigger.current?.matches(':focus-visible') || drag.current || reactionRef.current !== null) { setWalking(false); return }
      if (now < waitUntil) { setWalking(false); return }
      const next = advanceRoam(positionRef.current, target, delta, profile.speed * height / 210, maxX, maxY)
      if (next.arrived) { setWalking(false); persist(positionRef.current); waitUntil = now + 1200 + Math.random() * 1800; target = { x: .05 + Math.random() * .9, y: .05 + Math.random() * .9 }; return }
      setWalking(true); setHeading(next.angle)
      const point = { ...positionRef.current, x: next.x, y: next.y }; positionRef.current = point
      if (dock.current) { dock.current.style.left = (8 + maxX * point.x) + 'px'; dock.current.style.top = (8 + maxY * point.y) + 'px' }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [renderReady, profile.roaming, profile.speed, suspended, covered, manager, expanded, hovered, workState, maxX, maxY, height])
  useEffect(() => { setPosition(positionRef.current) }, [expanded, manager, hovered, suspended])
  const interact = () => {
    setExpanded(false)
    if (reactionRef.current && reactionKind.current !== 'daily' || !renderReady) return
    const choices = interactionChoices(profile, defaultProfile().interactions)
    const next = pickInteraction.current(choices)
    if (!next) return
    setExpanded(false); setWalking(false); setHeading(0); setReaction(next)
    reactionKind.current = 'click'; reactionRef.current = next; setReactionStarted(false); setReactionRevision(activity.current.begin(next.duration))
  }

  useEffect(() => {
    const resize = () => setViewport({ left: window.visualViewport?.offsetLeft || 0, top: window.visualViewport?.offsetTop || 0, width: window.visualViewport?.width || window.innerWidth, height: window.visualViewport?.height || window.innerHeight })
    window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize)
    const coverage = (event: Event) => setCovered(Boolean((event as CustomEvent).detail))
    window.addEventListener('harness-docket:playback', coverage); setCovered(Boolean(document.querySelector('.dba-root')))
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize); window.removeEventListener('harness-docket:playback', coverage) }
  }, [])
  useEffect(() => {
    if (!expanded || manager || suspended) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !dock.current?.contains(event.target)) setExpanded(false) }
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); toggle.current?.focus() } }
    window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', keyboard)
    return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', keyboard) }
  }, [expanded, manager, suspended])
  const move = (x: number, y: number) => {
    const next = { ...position, x: maxX ? Math.min(1, Math.max(0, (x - 8) / maxX)) : 0, y: maxY ? Math.min(1, Math.max(0, (y - 8) / maxY)) : 0 }
    positionRef.current = next; setPosition(next); return next
  }
  const closeManager = useCallback(() => setManager(false), [])
  return <>
    <nav ref={dock} className={'hda-dock dba-dock hdk-ui' + (expanded ? ' dba-dock-open' : '')} aria-label="Harness- docket 快捷功能" data-interaction={reaction?.id || ''} data-activity={behavior} data-renderer={alpha ? 'alpha-video' : '3d'} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} data-menu-layout={JSON.stringify(layout)} style={{ left, top, width, height, visibility: covered || manager || suspended ? 'hidden' : 'visible' }}>
      <button ref={trigger} className={'hda-trigger dba-dock-toggle' + (dragging ? ' hda-dragging' : '')} type="button" aria-label="与角色互动" aria-description="点击互动，拖动移动；右键或菜单键打开快捷功能" onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setExpanded(true) }}
        onPointerDown={event => { if (event.button !== 0 || !event.isPrimary || expanded && !bodyHit(event)) return; suppressClick.current = false; drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: dock.current?.getBoundingClientRect().left ?? left, top: dock.current?.getBoundingClientRect().top ?? top, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onDragStart={event => event.preventDefault()}
        onClick={event => { if (expanded && event.detail !== 0 && !bodyHit(event)) return; if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return }; interact() }}
        onKeyDown={event => { if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); setExpanded(true); return }; if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); const step = event.shiftKey ? 30 : 10; persist(move(left + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), top + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))) }}>
        <AvatarCanvas key={retry} item={selected} gazeMode={profile.gaze} gazeEnabled={!workState && !dragging && !expanded} speaking={speaking} onLayout={setMeasurement} pocketOpen={expanded} pocketSide={arc.side} pocketSuspended={suspended || manager || covered || dragging} onPocket={setPocketFrame} motionRevision={reactionRevision}
          onTick={delta => {
            if (activity.current.advance(delta)) { reactionRef.current = null; setReaction(null); setReactionStarted(false) }
            if (reactionRef.current) return
            if (workState) { if (['success', 'error'].includes(workState)) { workSeconds.current += delta; if (workSeconds.current >= 4) setFinishedWork(workKey) }; return }
            if (hovered || paused || !renderReady || matchMedia('(prefers-reduced-motion: reduce)').matches) return
            dailySeconds.current += delta
            const next = dailyPicker.current(dailySeconds.current, profile)
            if (next) { reactionKind.current = 'daily'; reactionRef.current = next; setReaction(next); setWalking(false); setReactionStarted(false); setReactionRevision(activity.current.begin(next.duration)) }
          }}
          oneShot={!!reaction && (!alpha || reactionKind.current === 'click')} pace={walking && !workState ? profile.speed / 32 : 1}
          action={alpha && dragging ? 'drag' : reaction?.action || (workState ? alpha ? workState : workInteraction?.action || (workState === 'thinking' ? 'head' : workState === 'success' ? 'wave' : 'idle') : walking ? 'walk' : 'idle')}
          angle={reaction || workState ? 0 : heading}
          motion={alpha ? null : reaction?.motion || (reaction ? null : workState ? workInteraction?.motion || (workState === 'thinking' && selected.human && selected.source !== 'builtin' && thought ? { id: thought.id, clip: 0 } : null) : walking ? profile.walk : profile.idle)}
          expression={reaction?.expression || workInteraction?.expression || (workState === 'success' ? 'happy' : '')} intensity={reaction?.intensity ?? workInteraction?.intensity}
          paused={paused} onReady={() => setRenderReady(true)}
          onError={text => { setMeasurement(null); setFailure(text); setRenderReady(false); activity.current.cancel(); reactionRef.current = null; setReaction(null) }}
          onMotionStatus={(text, revision) => { if (revision !== activity.current.token || !reactionRef.current) { if (!['ready', 'loading'].includes(text)) setFailure(text); return }; if (text === 'ready') { activity.current.ready(revision); setReactionStarted(true) } else if (text !== 'loading') { setFailure(text); activity.current.cancel(); reactionRef.current = null; setReaction(null) } }}/>

      </button>
      <MenuToggle layout={layout} expanded={expanded} buttonRef={toggle} aria-label={expanded ? '收起快捷功能' : '展开快捷功能'} aria-controls="hda-actions" onClick={() => setExpanded(value => !value)}/>
      {reaction && reactionKind.current === 'click' && reactionStarted && <div className="hda-floating-reaction" hidden={expanded || manager || suspended} style={{ animationPlayState: expanded || manager || suspended ? 'paused' : 'running' }}><Sticker key={reactionRevision} interaction={reaction}/></div>}
      <PocketMenu expanded={expanded} layout={arc} frame={pocketFrame} menuRef={menu}>
          {[{ kind: 'play', label: playerTitle, aria: '片头自动播放：' + (isPinned ? '开' : '关'), className: 'dba-player', disabled: playerDisabled, pressed: isPinned, run: onPlayer }, { kind: 'film', label: '片库', aria: '打开片头片库', className: 'dba-lib-open', run: onOpenLibrary }, { kind: 'person', label: '角色', aria: '管理角色模型', className: 'dba-dock-add', run: () => { setManager(true); void load().catch(e => setFailure(message(e))) } }].map(item =>
            <button key={item.kind} role="menuitem" className={item.className} aria-label={item.aria} aria-pressed={item.pressed} disabled={item.disabled} onClick={() => { setExpanded(false); item.run() }}><span className="hda-pocket-token"><Icon kind={item.kind}/>{item.kind === 'play' && <i className="hda-playback-mark" aria-hidden="true">{isPinned ? '✓' : '／'}</i>}</span><span className="hda-pocket-label">{item.label}</span></button>
          )}
      </PocketMenu>

      <LayoutDebug measurement={measured} layout={layout}/>

    </nav>
    <CompanionNotice key={selected.id + ':' + sessionId} suspended={suspended || manager || covered || dragging} settling={!!pocketFrame?.active} voice={voice}/>
      {expanded && failure && <div className="hda-menu-notice hdk-ui" role="status">{failure}{failure && <button onClick={() => { setRetry(value => value + 1); void load().catch(e => setFailure(message(e))) }}>重试</button>}</div>}
    {manager && <AvatarManager voice={voice} companion={companion} reloadCompanion={reloadCompanion} catalog={catalog} reload={load} onClose={closeManager} position={position} onSize={size => { const next = { ...position, size }; setPosition(next); persist(next) }} onReset={() => { const next = { x: .94, y: .75, size: 210 }; setPosition(next); persist(next) }}/>}</>
}

function AvatarManager({ voice, companion, reloadCompanion, catalog, reload, onClose, position, onSize, onReset }: { voice: CompanionVoice; companion: CompanionData; reloadCompanion: () => Promise<void>; catalog: Catalog | null; reload: () => Promise<Catalog>; onClose: () => void; position: Position; onSize: (size: number) => void; onReset: () => void }) {
  const [previewId, setPreviewId] = useState(catalog?.activeId || DEFAULT.id), [ready, setReady] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState<number | null>(null), [action, setAction] = useState('walk'), [bones, setBones] = useState(false), [angle, setAngle] = useState(0), [confirmDelete, setConfirmDelete] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false), [settingsBusy, setSettingsBusy] = useState(false), [closing, setClosing] = useState(false), [pendingModel, setPendingModel] = useState('')
  const [tab, setTab] = useState('model'), [motion, setMotion] = useState<Binding>(null), [previewInteraction, setPreviewInteraction] = useState<Interaction | null>(null), [capabilities, setCapabilities] = useState({ expressions: [], motion: false }), [motionStatus, setMotionStatus] = useState('ready')
  const [motionRevision, setMotionRevision] = useState(0), [menuDraft, setMenuDraft] = useState<MenuPreferences>(), [previewMeasurement, setPreviewMeasurement] = useState<any>(null)
  const previewClock = useRef(new ActivityClock())
  const preview = (value: string, binding: Binding, interaction?: Interaction, seconds?: number) => {
    const revision = previewClock.current.begin(seconds || interaction?.duration || Infinity)
    setAction(value); setMotion(binding); setMotionRevision(revision); setPreviewInteraction(interaction || null); setMotionStatus(binding ? 'loading' : 'ready')
  }
  const dirtyRef = useRef(false); dirtyRef.current = settingsDirty
  const askClose = useCallback(() => { if (dirtyRef.current) setClosing(true); else onClose() }, [onClose])
  const dialog = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), xhr = useRef<XMLHttpRequest | null>(null), lock = useRef(false), mounted = useRef(true)
  const items = catalog?.items || [DEFAULT], item = items.find(i => i.id === previewId) || items[0]
  const previewMenu = useAttachedMenu(previewMeasurement?.id === item.id ? previewMeasurement : null, previewMeasurement?.cssWidth || 220, previewMeasurement?.cssHeight || 300, { x: 0, y: 0 }, { left: -100, top: -100, width: (previewMeasurement?.cssWidth || 220) + 200, height: (previewMeasurement?.cssHeight || 300) + 200 }, menuDraft, false, false)
  const [modelName, setModelName] = useState(item.name)
  useEffect(() => { setModelName(item.name) }, [item.id, item.name])
  useDialogFocus(dialog, askClose)
  useTransientNotice(notice, () => setNotice(''))
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; xhr.current?.abort() } }, [])
  const perform = async (fn: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await fn() } catch (e) { if (mounted.current) setError(message(e)) }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setProgress(null) } }
  }
  const choose = (id: string, discard = false) => { if (id === item.id) return; previewClock.current.cancel(); if (!discard && settingsDirty && id !== item.id) { setPendingModel(id); return }; if (id !== item.id) setReady(''); setPreviewId(id); setTab('model'); setError(''); setNotice(''); setAction('walk'); setMotion(null); setPreviewInteraction(null); setCapabilities({ expressions: [], motion: false }); setBones(false); setAngle(0); setConfirmDelete(false) }
  const upload = (file: File) => perform(async () => {
    if (!/\.(vrm|glb)$/i.test(file.name)) throw new Error('请选择 VRM 或 GLB 模型')
    if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('模型应大于 0 字节且不超过 50 MB')
    setProgress(0)
    const result: any = await new Promise((resolve, reject) => {
      const request = new XMLHttpRequest(); xhr.current = request
      request.open('POST', '/harness-docket/avatars/upload?filename=' + encodeURIComponent(file.name)); request.setRequestHeader('content-type', 'model/gltf-binary'); request.timeout = 120000
      request.upload.onprogress = event => { if (event.lengthComputable && mounted.current) setProgress(Math.round(event.loaded / event.total * 100)) }
      request.onload = () => { try { const data = JSON.parse(request.responseText); if (request.status < 200 || request.status >= 300 || !data.ok) reject(new Error(data.error || '上传失败')); else resolve(data) } catch { reject(new Error('上传响应无效')) } }
      request.onerror = () => reject(new Error('上传中断，请检查连接')); request.onabort = () => reject(new Error('已取消上传')); request.ontimeout = () => reject(new Error('上传超时，请重试'))
      request.send(file)
    })
    xhr.current = null; await reload()
    if (mounted.current) { choose(result.item.id); setNotice('已上传。请检查动作，再点击“使用此角色”。') }
  })
  const use = () => perform(async () => {
    if (ready !== keyOf(item)) throw new Error('请等待模型预览加载完成')
    await request('avatars/select', { id: item.id, version: item.version }); await reload(); setNotice('已更换为「' + item.name + '」')
  })
  const remove = () => perform(async () => { await request('avatars/delete', { id: item.id }); const next = await reload(); choose(next.activeId); setNotice('已删除上传的角色') })
  const restoreDefault = () => perform(async () => {
    if (!items.some(model => model.id === DEFAULT.id)) { await request('avatars/restore-animation', {}); await reload() }
    choose(DEFAULT.id)
  })
  return <div className="hda-veil hdk-ui" onPointerDown={event => { if (event.target === event.currentTarget) askClose() }}>
    <div className="hda-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="hda-title" tabIndex={-1}>
      <header className="hda-header"><div><h2 id="hda-title">角色管理</h2><p className="hdk-identity">Harness- docket · 插件</p></div><button className="hda-icon-button" onClick={askClose} aria-label="关闭角色管理"><Icon kind="close"/></button></header>
      <div className="hda-navigation">
      <div className="hda-tabs" onKeyDown={tabKeys} role="tablist" aria-label="伙伴设置">{[['model', '角色'], ...(item.format === 'alpha-video' ? [] : [['motion', '动作库']]), ['interaction', '互动']].map(([value, label]) => <button key={value} role="tab" id={"hda-tab-" + value} aria-controls="hda-settings-panel" tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} onClick={() => { setTab(value); setPreviewInteraction(null) }}>{label}</button>)}</div>
      </div>
      <div className="hda-body" id="hda-settings-panel" role="tabpanel" aria-labelledby={"hda-tab-" + tab}>
        <section className="hda-stage" data-tab={tab} aria-label="角色预览">
          <div className="hda-stage-label"><span className="hda-dot"/>{item.format === 'alpha-video' ? '透明动画' : item.format}<span>{item.source === 'local' ? '本地模型' : item.source === 'uploaded' ? '已上传' : '内置角色'}</span></div>
          <div className="hda-preview" key="preview"><AvatarCanvas item={item} gazeMode={companion.profiles[item.id]?.gaze} onLayout={setPreviewMeasurement} action={action} oneShot={!!previewInteraction} motion={motion} motionRevision={motionRevision} expression={previewInteraction?.expression || ''} intensity={previewInteraction?.intensity} onCapabilities={setCapabilities} onTick={delta => { if (previewClock.current.advance(delta)) { setPreviewInteraction(null); setMotion(null); setAction('idle') } }} onMotionStatus={(text, revision) => { setMotionStatus(text); if (text === 'ready') previewClock.current.ready(revision); else if (text !== 'loading') previewClock.current.cancel() }} bones={bones} angle={angle} onReady={loaded => { setReady(keyOf(loaded)); setError('') }} onError={text => { setReady(''); setError(text) }}/>{tab === 'model' && <span className="hda-menu-preview" data-menu-layout={JSON.stringify(previewMenu)}><MenuToggle layout={previewMenu} aria-label="贴身入口预览" tabIndex={-1} disabled/><LayoutDebug measurement={previewMeasurement} layout={previewMenu}/></span>}{previewInteraction && <div className="hda-preview-reaction"><Sticker key={JSON.stringify(previewInteraction)} interaction={previewInteraction}/></div>}</div>
          <div className="hda-stage-caption"><strong>{item.name}</strong><span>{item.format === 'alpha-video' ? '透明动画 · 点击回应' : item.human ? '标准人形 · 可检查骨骼动作' : item.animations ? '播放模型自带动画' : '静态角色'}</span></div>
          {item.format === 'alpha-video' && <div className="hda-inspection"><label>预览动作<select aria-label="透明角色预览动作" value={action} onChange={e => preview(e.target.value, null)}>{Object.entries(item.clips || {}).map(([key, clip]) => <option key={key} value={key}>{clip.original.replace('.webm', '')}</option>)}</select></label></div>}
          <div className="hda-inspection" hidden={item.format === 'alpha-video'}>
            <MotionInspector key={item.id} data={companion} basicEnabled={item.human} enabled={capabilities.motion} ready={ready === keyOf(item)} action={action} status={motionStatus} renderer={renderer} preview={(a, b, seconds) => preview(a, b, undefined, seconds)}/>
            <label className="hda-checkbox"><input type="checkbox" checked={bones} onChange={e => setBones(e.target.checked)} disabled={!item.rigged}/>显示骨架</label>
            <label className="hda-angle">查看角度<input type="range" aria-label="预览旋转角度" min="-180" max="180" value={Math.round(angle * 180 / Math.PI)} onChange={e => setAngle(Number(e.target.value) * Math.PI / 180)}/></label>
          </div>
        </section>
        <div className="hda-editor-column"><section className="hda-picker" aria-label="角色列表" hidden={tab !== 'model'}>
          <p className="hda-help hda-main-chat-guide">直接在 Harness 主输入框提问、继续任务。人物会随当前会话状态作出反馈；点击人物可互动。</p>
          {tab === 'model' && <CompanionVoiceSettings voice={voice}/>}
          <div className="hda-section-title"><h3>角色收藏 <span>{items.length}</span></h3><button className="hda-small-button" disabled={busy} onClick={() => void perform(async () => { await reload(); setNotice('角色列表已刷新') })} aria-label="刷新角色列表"><Icon kind="reset"/></button></div>
          <div className="hda-model-list">
            {items.map(model => <button key={model.id} className={'hda-model' + (model.id === item.id ? ' hda-selected' : '')} disabled={busy} aria-label={'预览角色 ' + model.name} aria-pressed={model.id === item.id} onClick={() => choose(model.id)}>
              <span className="hda-model-icon"><Icon kind="person"/></span><span className="hda-model-text"><strong title={model.name}>{model.name}</strong><small>{model.format === 'alpha-video' ? '透明动画' : model.format}{model.bytes ? ' · ' + (model.bytes / 1024 / 1024).toFixed(1) + ' MB' : ' · 随时可用'}</small></span>{catalog?.activeId === model.id && <span className="hda-current"><Icon kind="check"/>使用中</span>}
            </button>)}
          </div>
          <input hidden ref={input} type="file" accept=".vrm,.glb" onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void upload(file) }}/>
          <button className="hda-upload" onClick={() => input.current?.click()} disabled={busy}><Icon kind="upload"/>上传你的模型</button>
          {!items.some(i => i.format === 'alpha-video') && <button className="hda-text-button" disabled={busy} onClick={() => void perform(async () => { await request('avatars/restore-animation', {}); await reload(); setNotice('透明动画角色已加入列表，请先预览。') })}>添加 dsh-pet 透明角色</button>}
          {item.sourceUrl && <p className="hda-help">素材来自 <a href={item.sourceUrl} target="_blank" rel="noreferrer">PC2005-cloud/dsh-pet</a> · 仅限非商用</p>}
          <p className="hda-help">VRM 0.x / 1.0、GLB · 最大 50 MB<br/>模型与纹理需包含在同一个文件中。</p>
          {progress !== null && <div className="hda-progress" role="status"><progress aria-label="模型上传进度" max="100" value={progress}/><span>{progress < 100 ? '上传中 ' + progress + '%' : '正在校验骨架与蒙皮…'}</span><button onClick={() => xhr.current?.abort()}>取消</button></div>}
          {item.source !== 'builtin' && <form className="hda-rename" onSubmit={e => { e.preventDefault(); void perform(async () => { await request('avatars/rename', { id: item.id, name: modelName }); await reload(); setNotice('角色名称已更新，动作和互动设置保留。') }) }}><label htmlFor="hda-model-name">角色名称</label><div className="hda-inline"><input id="hda-model-name" aria-label="角色名称" maxLength={100} value={modelName} disabled={busy} onChange={e => setModelName(e.target.value)}/><button className="hda-secondary" disabled={busy || !modelName.trim() || modelName.trim() === item.name}>保存名称</button></div></form>}
          <div className="hda-settings"><label>悬浮大小 <span>{position.size}px</span><input type="range" aria-label="悬浮角色大小" min="120" max="300" step="10" value={position.size} onChange={e => onSize(Number(e.target.value))}/></label><button className="hda-text-button" onClick={onReset}><Icon kind="move"/>重置大小与位置</button></div>
          <div className="hda-details"><span>{ready === keyOf(item) ? '✓ 预览加载完成' : '正在准备预览'}</span>{item.boneCount > 0 && <span>{item.boneCount} 个人形骨骼 · 结构校验通过</span>}{item.author && <span>作者：{item.author}</span>}<p>请切换检查动作，确认关节变形自然后再使用。</p></div>
          {catalog?.errors.map((failure, index) => <p className="hda-error" key={index}>{failure.name}：{failure.error}</p>)}
        </section>
        <CompanionControls key={item.id + ':' + item.version} tab={tab} id={item.id} data={companion} initial={companion.profiles[item.id] || defaultProfile(item.human && item.source !== 'builtin' ? companion : undefined)} reload={reloadCompanion} request={request} renderer={renderer} capabilities={capabilities} onPreview={preview} motionStatus={motionStatus} onMenuDraft={setMenuDraft} onEditState={(dirty, busy) => { setSettingsDirty(dirty); setSettingsBusy(busy) }}/></div>
      </div>
      {pendingModel && <div className="hda-unsaved" role="alert"><span>切换角色会放弃当前未保存的设置。</span><button className="hda-secondary" onClick={() => setPendingModel('')}>继续编辑</button><button className="hda-danger" onClick={() => { choose(pendingModel, true); setPendingModel('') }}>放弃修改并切换</button></div>}
      {closing && <div className="hda-unsaved" role="alert"><span>角色设置尚未保存。</span><button className="hda-secondary" onClick={() => setClosing(false)}>继续编辑</button><button className="hda-danger" onClick={onClose}>放弃修改并关闭</button></div>}
      <footer className="hda-footer">
        <div className="hda-feedback" role="status">{error ? <span className="hda-error">{error}</span> : notice || (tab === 'model' ? '选择角色预览，点击“使用此角色”应用。' : settingsDirty ? '有未保存的设置' : '设置保存后生效。')}</div>
        <div className="hda-footer-actions" hidden={tab !== 'model'}><button className="hda-secondary" disabled={busy} onClick={() => void restoreDefault()}>恢复默认角色</button>{['uploaded', 'animation'].includes(item.source) && (confirmDelete ? <button className="hda-danger" disabled={busy} onClick={() => void remove()}>确认删除</button> : <button className="hda-danger" disabled={busy} onClick={() => setConfirmDelete(true)}><Icon kind="trash"/>删除</button>)}<button className={settingsDirty ? "hda-secondary" : "hda-primary"} disabled={busy || ready !== keyOf(item) || catalog?.activeId === item.id} onClick={() => void use()}><Icon kind="check"/>{catalog?.activeId === item.id ? '正在使用' : '使用此角色'}</button></div>
        {(tab !== 'model' || settingsDirty) && <button type="submit" form="hda-companion-settings" className="hda-primary" disabled={!settingsDirty || settingsBusy}>{settingsBusy ? '正在保存…' : tab === 'model' ? '保存贴身菜单设置' : '保存动作与互动设置'}</button>}
      </footer>
    </div>
  </div>
}
