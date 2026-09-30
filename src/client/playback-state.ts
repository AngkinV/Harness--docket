import { useSyncExternalStore } from 'react'
import { preferenceKey, readPreference, writePreference } from './preferences.js'

const ENABLED = 'harness-docket:autoplay:v1', PIN = 'dsh-boot-animation:pinned'
type Phase = 'idle' | 'resolving' | 'loading' | 'playing' | 'buffering' | 'completed' | 'skipped' | 'failed' | 'disabled' | 'left'
type Play = { phase: Phase; playId: number; source: 'auto' | 'preview'; name?: string; id?: string; version?: string }
export type PlaybackState = { enabled: boolean; pinned: string | null; selected: { id: string; name: string; version: string } | null; selectionKnown: boolean; play: Play; notice: { id: number; text: string; at: number } | null }
let state: PlaybackState | null = null, noticeId = 0, selectionGeneration = 0, consumedNotice = 0
const listeners = new Set<() => void>()
const publish = (next: Partial<PlaybackState>) => { state = { ...getPlaybackState(), ...next }; listeners.forEach(fn => fn()) }
export const getPlaybackState = (): PlaybackState => state ??= { enabled: readPreference(ENABLED) !== 'false', pinned: readPreference(PIN), selected: null, selectionKnown: false, play: { phase: 'idle', playId: 0, source: 'auto' }, notice: null }
export function consumeNotice(id: number) { if (id <= consumedNotice) return false; consumedNotice = id; return true }
export function say(text: string) { publish({ notice: { id: ++noticeId, text, at: Date.now() } }) }
export function setAutoplay(enabled: boolean) {
  if (enabled === getPlaybackState().enabled) return
  const saved = writePreference(ENABLED, String(enabled))
  publish({ enabled })
  say(!saved ? `本页已${enabled ? '开启' : '关闭'}，但这次没能记住设置。` : enabled ? getPlaybackState().selectionKnown && !getPlaybackState().selected ? '自动播放已开启，先去片库选一个片头吧。' : '自动播放已开启，下次进入新会话会播放片头。' : '自动播放已关闭，需要时可以去片库预览。')
}
export function setPinned(id: string | null) { const saved = writePreference(PIN, id); publish({ pinned: id }); if (!saved) say('本页已更新重播规则，但这次没能记住设置。') }
export function setPlayback(play: Play) { publish({ play }); if (play.phase === 'failed') say('这段片头没能播放，可以去片库重试。') }
export function advancePlayback(playId: number, phase: Phase) { if (getPlaybackState().play.playId === playId) publish({ play: { ...getPlaybackState().play, phase } }) }
export function selectedFromList(data: any) {
  const item = data.videos?.find((v: any) => v.id === data.activeId)
  publish({ selectionKnown: true, selected: item ? { id: item.id, name: item.name, version: data.activeVersion || item.version || '' } : null })
}
export async function refreshSelection() {
  const generation = ++selectionGeneration
  try { const r = await fetch('/harness-docket/videos.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('Unavailable selection'); const data = await r.json(); if (generation === selectionGeneration) selectedFromList(data) } catch { if (generation === selectionGeneration) publish({ selectionKnown: false }) }
}
const sync = (event: StorageEvent) => {
  if (event.key === null || event.key === preferenceKey(ENABLED) || event.key === preferenceKey(PIN)) publish({ enabled: readPreference(ENABLED) !== 'false', pinned: readPreference(PIN) })
}
function subscribe(fn: () => void) { if (!listeners.size) window.addEventListener('storage', sync); listeners.add(fn); return () => { listeners.delete(fn); if (!listeners.size) window.removeEventListener('storage', sync) } }
export const usePlayback = () => useSyncExternalStore(subscribe, getPlaybackState, getPlaybackState)
export function playbackDescription(value = getPlaybackState()) {
  const labels: Record<Phase, string> = { idle: '未播放', resolving: '正在读取片源', loading: '正在加载', playing: value.play.source === 'preview' ? '正在预览' : '正在播放', buffering: '正在缓冲', completed: '已结束', skipped: '已跳过', failed: '播放失败', disabled: '已停止自动播放', left: '已离开会话' }
  return labels[value.play.phase] + (value.play.name ? `《${value.play.name}》` : '')
}
