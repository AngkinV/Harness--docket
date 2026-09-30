import React, { useCallback, useEffect, useRef, useState } from 'react'
import { readPreference, writePreference } from './preferences.js'
import { usePlayback, consumeNotice } from './playback-state'
import { CompanionSpeech, voicePreferences } from './companion-speech.js'

const KEY = 'harness-docket:voice:v1'
function initial() {
  // Preserve existing voice choices without carrying forward chat opt-in.
  return voicePreferences(readPreference(KEY) ?? readPreference('harness-docket:conversation:v1'))
}

export function useCompanionVoice(scope: string, suspended: boolean, onSpeaking: (value: boolean) => void) {
  const [settings, setSettings] = useState(initial), [note, setNote] = useState('')
  const speech = useRef<CompanionSpeech | null>(null)
  const cancel = useCallback(() => speech.current?.cancel(), [])
  useEffect(() => {
    cancel()
    const hidden = () => { if (document.hidden) cancel() }
    document.addEventListener('visibilitychange', hidden)
    return () => { document.removeEventListener('visibilitychange', hidden); cancel() }
  }, [scope, suspended, cancel])
  const speak = useCallback((text: string, preview = false) => {
    if (document.hidden || suspended || !preview && !settings.speech) return
    if (!speech.current) speech.current = new CompanionSpeech(window.speechSynthesis, (text: string) => new SpeechSynthesisUtterance(text), (value = false) => onSpeaking(value), () => setNote('语音暂不可用，文字提示仍正常显示。'))
    setNote('')
    if (!speech.current.speak(text, { ...settings, enabled: true })) setNote('没有可用的中文声音，文字提示仍正常显示。')
  }, [settings, suspended, onSpeaking])
  const edit = (next: typeof settings) => {
    cancel(); setSettings(next)
    setNote(writePreference(KEY, JSON.stringify(next)) ? '' : '设置仅在本页有效，未能保存。')
  }
  return { settings, note, edit, speak, cancel }
}

export type CompanionVoice = ReturnType<typeof useCompanionVoice>

export function CompanionVoiceSettings({ voice }: { voice: CompanionVoice }) {
  const [open, setOpen] = useState(false), [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  // Closing the manager can precede the asynchronous <details> toggle event.
  // Always cancel a preview on unmount, even before voices were subscribed.
  useEffect(() => voice.cancel, [voice.cancel])
  useEffect(() => {
    if (!open) return
    const engine = window.speechSynthesis, update = () => setVoices(engine?.getVoices() || [])
    update(); engine?.addEventListener('voiceschanged', update)
    return () => { engine?.removeEventListener('voiceschanged', update); voice.cancel() }
  }, [open, voice.cancel])
  const { settings, edit } = voice
  return <details className="hda-voice-settings" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>播放提示与声音</summary>
    <p className="hda-help">切换片头自动播放时显示短提示。朗读默认关闭，设置即时生效。</p>
    <label><input type="checkbox" checked={settings.speech} onChange={e => edit({ ...settings, speech: e.target.checked })}/>朗读播放提示</label>
    <label>声音<select value={settings.voice} onChange={e => edit({ ...settings, voice: e.target.value })}><option value="">自动选择中文声音</option>{voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}</select></label>
    <label>音量<input type="range" min="0" max="1" step=".1" value={settings.volume} onChange={e => edit({ ...settings, volume: Number(e.target.value) })}/></label>
    <button type="button" className="hda-secondary" onClick={() => voice.speak('你好，我会在这里陪着你。', true)}>试听声音</button>
    {voice.note && <p className="hda-help" role="status">{voice.note}</p>}
  </details>
}

export function CompanionNotice({ suspended, settling, voice }: { suspended: boolean; settling: boolean; voice: CompanionVoice }) {
  const { notice } = usePlayback(), shown = useRef(0), [bubble, setBubble] = useState('')
  useEffect(() => {
    if (suspended) { setBubble(''); voice.cancel() }
  }, [suspended, voice.cancel])
  useEffect(() => {
    const hidden = () => { if (document.hidden) { setBubble(''); shown.current = notice?.id || 0 } }
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [notice?.id])
  useEffect(() => {
    if (!notice || shown.current === notice.id || suspended || settling) return
    shown.current = notice.id
    if (document.hidden || Date.now() - notice.at > 4500 || !consumeNotice(notice.id)) return
    setBubble(notice.text); voice.speak(notice.text)
  }, [notice, suspended, settling, voice.speak])
  useEffect(() => {
    if (!bubble) return
    const timer = setTimeout(() => setBubble(''), 3500)
    return () => clearTimeout(timer)
  }, [bubble, notice?.id])
  return bubble && !suspended && !settling ? <div className="hda-speech-bubble hdk-ui" role="status">{bubble}</div> : null
}
