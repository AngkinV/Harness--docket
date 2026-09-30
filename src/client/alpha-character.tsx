import React, { useEffect, useRef, useState } from 'react'
import { maskFromPixels } from './attached-menu-layout.js'
import { alphaSources, loadAlphaSource } from './alpha-video.js'

export function AlphaCharacter(props: any) {
  const host = useRef<HTMLDivElement>(null), players = useRef<(HTMLVideoElement | null)[]>([]), front = useRef(-1)
  const callbacks = useRef(props); callbacks.current = props
  const [status, setStatus] = useState('loading'), sequence = useRef(0), previousClick = useRef('click2')
  const playingReady = useRef(false)
  const preferredFormat = useRef('')
  const paused = useRef(props.paused), mirror = useRef(false), loadedId = useRef('')
  paused.current = props.paused
  const { item, action, motionRevision = 0, oneShot } = props
  const sample = (video: HTMLVideoElement, verify = false) => {
    const canvas = document.createElement('canvas'), w = 128, h = 72
    canvas.width = w; canvas.height = h
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(video, 0, 0, w, h)
    const pixels = context.getImageData(0, 0, w, h).data
    if (verify) {
      let transparent = 0, opaque = 0
      for (let n = 3; n < pixels.length; n += 4) { if (pixels[n] < 16) transparent++; if (pixels[n] > 128) opaque++ }
      if (transparent < w * h * .1 || opaque < 10) throw new Error('角色动画的透明背景解码失败，请更新浏览器后重试，或暂用 3D 角色。')
    }
    if (!host.current || !callbacks.current.onLayout) return
    const cssWidth = host.current.clientWidth, cssHeight = host.current.clientHeight
    canvas.width = Math.max(32, Math.round(96 * cssWidth / cssHeight)); canvas.height = 96
    // Match object-fit: cover, and flip rows for the shared WebGL mask format.
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
    context.translate(mirror.current ? canvas.width : 0, canvas.height); context.scale(mirror.current ? -1 : 1, -1)
    context.drawImage(video, (canvas.width - video.videoWidth * scale) / 2, (canvas.height - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale)
    const mask = maskFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, cssWidth, cssHeight)
    const value = { id: item.id, version: item.version, cssWidth, cssHeight, mask, referenceHeight: cssHeight * .7, confidence: 'alpha' }
    ;(host.current as any).__hdaMeasurement = value
    callbacks.current.onLayout(value)
  }
  useEffect(() => {
    const serial = ++sequence.current, controller = new AbortController()
    playingReady.current = false
    const index = front.current === 0 ? 1 : 0, video = players.current[index]!
    let key = item.clips[action] ? action : action === 'wave' ? 'click1' : 'idle'
    if (oneShot) { key = previousClick.current === 'click1' ? 'click2' : 'click1'; previousClick.current = key }
    callbacks.current.onMotionStatus?.('loading', motionRevision)
    const load = async () => {
      video.loop = !oneShot; video.playbackRate = 1
      const format = await loadAlphaSource(video, alphaSources(item, key, video, navigator.userAgent, preferredFormat.current), {
        signal: controller.signal, verify: (candidate: HTMLVideoElement) => sample(candidate, true),
      })
      if (sequence.current !== serial) return
      preferredFormat.current = format
      if (paused.current || document.hidden) video.pause()
      const old = players.current[front.current]
      if (old) { old.pause(); old.style.opacity = '0' }
      front.current = index; video.style.opacity = '1'
      playingReady.current = true
      setStatus('ready'); loadedId.current = item.id
      callbacks.current.onReady?.(item); callbacks.current.onCapabilities?.({ motion: false, expressions: [], alpha: true })
      callbacks.current.onMotionStatus?.('ready', motionRevision)
    }
    void load().catch(error => {
      if (error.name === 'AbortError' || serial !== sequence.current) return
      if (front.current < 0) { setStatus('error'); callbacks.current.onError?.(error.message) }
      else callbacks.current.onMotionStatus?.(error.message, motionRevision)
    })
    return () => { controller.abort(); if (index !== front.current) video.pause() }
  }, [item.id, item.version, action, motionRevision, oneShot])
  useEffect(() => {
    const sync = () => { const video = players.current[front.current]; if (!video) return; if (props.paused || document.hidden) video.pause(); else void video.play().catch(() => {}) }
    sync(); document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [props.paused, status])
  useEffect(() => {
    mirror.current = action === 'walk' && Math.sin(props.angle || 0) > 0
    for (const video of players.current) if (video) video.style.transform = mirror.current ? 'scaleX(-1)' : ''
  }, [action, props.angle])
  useEffect(() => {
    let frame = 0, lastTime = -1, lastVideo: HTMLVideoElement | null = null, sampled = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const video = players.current[front.current]
      if (!video) return
      if (lastVideo !== video) { lastTime = video.currentTime; lastVideo = video }
      const delta = video.currentTime - lastTime; lastTime = video.currentTime
      if (playingReady.current && !paused.current && !document.hidden && !video.paused && delta > 0) callbacks.current.onTick?.(Math.min(delta, .1))
      // Finish a short one-shot even when its natural length is below the configured interaction duration.
      if (playingReady.current && video.ended && !paused.current && !document.hidden) callbacks.current.onTick?.(.016)
      if (!paused.current && !document.hidden && now - sampled > 250 && video.readyState >= 2) { sampled = now; sample(video) }
    }
    frame = requestAnimationFrame(tick)
    const resize = new ResizeObserver(() => { const v = players.current[front.current]; if (v?.readyState! >= 2) sample(v!) })
    if (host.current) resize.observe(host.current)
    return () => { cancelAnimationFrame(frame); resize.disconnect(); sequence.current++; for (const video of players.current) if (video) { video.pause(); video.removeAttribute('src'); video.load() } }
  }, [item.id])
  return <div className="hda-canvas-wrap hda-alpha-wrap" data-status={status} data-motion-id="">
    <div className="hda-canvas hda-alpha" ref={host} data-model-id={loadedId.current || item.id}>
      {[0, 1].map(i => <video key={i} ref={node => { players.current[i] = node }} muted playsInline preload="none" aria-hidden="true"/>)}
    </div>
    {status !== 'ready' && <span className="hda-loading-dot" role="status" aria-label={status === 'error' ? '角色加载失败' : '角色加载中'}/>}
  </div>
}
