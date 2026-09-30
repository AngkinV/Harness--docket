import { UIIcon } from './ui'
import React, { useEffect, useRef, useState } from 'react'
import { readPreference, writePreference } from './preferences.js'
import { usePlayback, getPlaybackState, setAutoplay, refreshSelection, consumeNotice } from './playback-state'
import { CompanionSpeech, localCompanionReply } from './companion-speech.js'

type Message = { role: 'user' | 'assistant'; text: string; action?: boolean; local?: boolean; failed?: boolean }
const KEY = 'harness-docket:conversation:v1'
function initial() { try { const v = JSON.parse(readPreference(KEY) || '{}'); return { enabled: v.enabled === true, voice: typeof v.voice === 'string' ? v.voice : '', volume: Number.isFinite(v.volume) ? Math.max(0, Math.min(1, v.volume)) : .7, speech: v.speech === true } } catch { return { enabled: false, voice: '', volume: .7, speech: false } } }
export function CompanionConversation({ open, onClose, name, characterId, suspended, settling, body, viewport, onSpeaking }: { open: boolean; onClose: () => void; name: string; characterId: string; suspended: boolean; settling: boolean; body: { left: number; right: number; top: number; bottom: number }; viewport: { width: number; height: number }; onSpeaking: (v: boolean) => void }) {
  const playback = usePlayback(), [settings, setSettings] = useState(initial), config = useRef(settings); config.current = settings
  const [settingsOpen, setSettingsOpen] = useState(() => !settings.enabled)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]), [speechNote, setSpeechNote] = useState(''), [status, setStatus] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([]), [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [bubble, setBubble] = useState('')
  const pending = useRef<AbortController | null>(null), generation = useRef(0), speech = useRef<CompanionSpeech | null>(null), shown = useRef(0), retry = useRef<Message[] | null>(null), output = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDivElement>(null), bubbleNode = useRef<HTMLDivElement>(null), returnFocus = useRef<HTMLElement | null>(null)
  const stop = () => { if (pending.current) { setError('已停止，可重试。'); setMessages(list => list.map((m, i) => i === list.length - 1 && m.role === 'assistant' ? { ...m, failed: true } : m)) }; generation.current++; pending.current?.abort(); pending.current = null; setBusy(false); speech.current?.cancel() }
  useEffect(() => {
    const engine = window.speechSynthesis
    speech.current = new CompanionSpeech(engine, (text: string) => new SpeechSynthesisUtterance(text), (value = false) => onSpeaking(value), () => setSpeechNote('语音暂不可用，文字提示仍正常显示。'))
    const update = () => setVoices(engine?.getVoices() || [])
    update(); engine?.addEventListener('voiceschanged', update)
    const hidden = () => { if (document.hidden) { speech.current?.cancel(); setBubble(''); shown.current = getPlaybackState().notice?.id || 0 } }
    document.addEventListener('visibilitychange', hidden)
    return () => { pending.current?.abort(); generation.current++; speech.current?.cancel(); engine?.removeEventListener('voiceschanged', update); document.removeEventListener('visibilitychange', hidden) }
  }, [])
  const speak = (text: string) => { const ok = speech.current?.speak(text, { enabled: config.current.speech && !document.hidden && !suspended, voice: config.current.voice, volume: config.current.volume }); if (config.current.speech && !ok) setSpeechNote('语音暂不可用，文字提示仍正常显示。') }
  useEffect(() => { if (!open || suspended) { stop(); return }; returnFocus.current = document.activeElement as HTMLElement; dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(); const abort = new AbortController(); fetch('/harness-docket/companion/chat-status', { signal: abort.signal }).then(r => r.json()).then(setStatus).catch(() => setStatus({ available: false, message: '暂时无法读取模型配置。' })); return () => { abort.abort(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }) } }, [open, suspended])
  useEffect(() => { if (suspended) { setBubble(''); speech.current?.cancel() } }, [suspended])
  useEffect(() => {
    const notice = playback.notice
    if (!notice || shown.current === notice.id || suspended || settling) return
    shown.current = notice.id
    if (document.hidden || Date.now() - notice.at > 4500 || !consumeNotice(notice.id)) return
    setBubble(notice.text); speak(notice.text)
  }, [playback.notice, suspended, settling])
  useEffect(() => {
    if (!bubble) return
    const timer = setTimeout(() => { if (!bubbleNode.current?.matches(':focus-within')) setBubble('') }, 3500)
    return () => clearTimeout(timer)
  }, [bubble, playback.notice?.id])
  useEffect(() => { output.current?.scrollTo({ top: output.current.scrollHeight }) }, [messages, busy])
  const edit = (next: typeof settings) => { setSettings(next); config.current = next; speech.current?.cancel(); if (!next.enabled) stop(); if (!writePreference(KEY, JSON.stringify(next))) setSpeechNote('设置仅在本页有效，未能保存。') }
  async function send(history?: Message[]) {
    if (busy || !settings.enabled || !history && !draft.trim()) return
    stop(); setError(''); const token = ++generation.current
    const message = draft.trim(), list = (history || [...messages.filter(m => !m.failed), { role: 'user' as const, text: message }]).slice(-21)
    if (!history) setDraft('')
    setMessages(list); retry.current = list; setBusy(true)
    if (/(片头|视频|片源)/.test(list.at(-1)?.text || '')) await refreshSelection()
    if (token !== generation.current) return
    const answer = localCompanionReply(list.at(-1)?.text || '', getPlaybackState())
    if (answer) { setMessages([...list.slice(0, -1), { ...list.at(-1)!, local: true }, { role: 'assistant', ...answer, local: true }]); setBusy(false); speak(answer.text); return }
    const controller = new AbortController(); pending.current = controller
    const deadline = setTimeout(() => controller.abort(), 65000)
    let reply = '', done = false
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    setMessages([...list, { role: 'assistant', text: '' }])
    try {
      // Only bounded, completed conversation turns leave the browser.
      let context = list.filter(m => !m.failed && !m.local).slice(-21), length = context.reduce((n, m) => n + m.text.length, 0)
      while (length > 7500 && context.length > 1) { length -= context[0].text.length; context.shift() }
      const response = await fetch('/harness-docket/companion/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ enabled: settings.enabled, characterId, messages: context.map(m => ({ role: m.role, text: m.text })) }) })
      if (!response.ok) throw new Error((await response.json()).error || '暂时无法对话')
      reader = response.body!.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let buffer = ''
      const consume = (line: string) => {
        if (!line.trim() || token !== generation.current) return
        const event = JSON.parse(line)
        if (event.type === 'error') throw new Error(event.error)
        if (event.type === 'delta') { reply += event.text; if (reply.length > 2000) throw new Error('回复过长，请重试'); setMessages([...list, { role: 'assistant', text: reply }]) }
        if (event.type === 'done') done = true
      }
      while (true) { const chunk = await reader.read(); if (token !== generation.current) return; if (chunk.done) { buffer += decoder.decode(); break }; buffer += decoder.decode(chunk.value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.forEach(consume) }
      if (buffer.trim()) consume(buffer)
      if (!done || !reply.trim()) throw new Error('回复中断，可以重试。')
      if (token === generation.current) { setMessages([...list, { role: 'assistant', text: reply }]); speak(reply) }
    } catch (e: any) {
      if (token !== generation.current) return
      setError(e.name === 'AbortError' ? '回复超时或已停止，可重试。' : e.message); setMessages([...list, ...(reply ? [{ role: 'assistant' as const, text: reply, failed: true }] : [])])
      if (!reply) setDraft(list.at(-1)?.text || '')
    } finally { clearTimeout(deadline); controller.abort(); void reader?.cancel().catch(() => {}); reader?.releaseLock(); if (token === generation.current) { setBusy(false); pending.current = null } }
  }
  const width = Math.min(300, viewport.width - 16), maxHeight = Math.min(360, viewport.height - 24)
  const roomLeft = body.left - 16 >= width, roomRight = viewport.width - body.right - 16 >= width
  const above = body.top - 16, below = viewport.height - body.bottom - 16
  const height = roomLeft || roomRight ? maxHeight : Math.min(maxHeight, Math.max(240, above, below))
  const x = Math.max(8, Math.min(viewport.width - width - 8, roomRight ? body.right + 8 : roomLeft ? body.left - width - 8 : (viewport.width - width) / 2))
  const y = Math.max(8, Math.min(viewport.height - height - 8, roomLeft || roomRight ? body.top : above >= below ? body.top - height - 8 : body.bottom + 8))
  const bubbleWidth = Math.min(230, viewport.width - 16), bx = Math.max(8, Math.min(viewport.width - bubbleWidth - 8, (body.left + body.right - bubbleWidth) / 2)), by = Math.max(8, body.top - 96)
  return <>
    {bubble && !suspended && !settling && !open && <div ref={bubbleNode} className="hda-speech-bubble hdk-ui" role="status" tabIndex={0} onBlur={() => setBubble('')} style={{ left: bx, top: by, width: bubbleWidth }}>{bubble}</div>}
    {open && !suspended && <div ref={dialog} className="hda-chat hdk-ui" role="dialog" aria-label={'和' + name + '聊聊'} style={{ left: x, top: y, width, height }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <header><strong title={name}>{name}<small className="hdk-identity">Harness- docket · 插件对话</small></strong><button type="button" onClick={() => { stop(); setMessages([]); setError(''); retry.current = null }}>清空</button><button type="button" aria-label="关闭人物对话" onClick={onClose}><UIIcon kind="close"/></button></header>
      <details className="hda-chat-settings" open={settingsOpen} onToggle={e => setSettingsOpen(e.currentTarget.open)}><summary>对话与声音</summary>
        <label><input type="checkbox" checked={settings.enabled} onChange={e => { edit({ ...settings, enabled: e.target.checked }); setSettingsOpen(!e.target.checked) }}/>启用智能对话</label>
        <small>{status?.available ? `使用 Harness 模型：${status.model}` : status?.message || '正在读取模型设置…'}仅发送这里的对话，刷新后清空。</small>
        <label><input type="checkbox" checked={settings.speech} onChange={e => edit({ ...settings, speech: e.target.checked })}/>朗读人物的话</label>
        <label>声音<select value={settings.voice} onChange={e => edit({ ...settings, voice: e.target.value })}><option value="">自动选择中文声音</option>{voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}</select></label>
        <label>音量<input type="range" min="0" max="1" step=".1" value={settings.volume} onChange={e => edit({ ...settings, volume: Number(e.target.value) })}/></label>
        <button type="button" onClick={() => { if (!speech.current?.speak('你好，我会在这里陪着你。', { enabled: true, voice: settings.voice, volume: settings.volume })) setSpeechNote('没有可用的中文声音，文字提示仍正常显示。') }}>试听</button><small role="status">{speechNote}</small>
      </details>
      {bubble && <div className="hda-chat-notice" role="status">{bubble}</div>}
      <div ref={output} className="hda-chat-messages" role="log" aria-live="polite">{!messages.length && <p className="hda-chat-empty">想聊点什么？也可以问我片头是否开启。</p>}{messages.map((m, i) => <div key={i} data-role={m.role}><small>{m.role === 'user' ? '你' : name}</small><p>{m.text || (busy ? '正在想…' : '已停止')}</p>{m.failed && <small>回复未完成</small>}{m.action !== undefined && <button type="button" disabled={playback.enabled === m.action} onClick={() => setAutoplay(m.action!)}>{m.action ? '开启' : '关闭'}自动播放{playback.enabled === m.action ? ' · 已生效' : ''}</button>}</div>)}</div>
      {error && <div className="hda-chat-error" role="status">{error}<button type="button" disabled={busy} onClick={() => { if (retry.current) void send(retry.current) }}>重试</button></div>}
      <form onSubmit={e => { e.preventDefault(); void send() }}><textarea aria-label="对人物说的话" placeholder={settings.enabled ? '输入消息…' : '请先启用智能对话'} disabled={!settings.enabled} value={draft} maxLength={500} rows={2} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}/>{busy ? <button type="button" onClick={stop}>停止</button> : <button type="submit" disabled={!settings.enabled || !draft.trim()}>发送</button>}</form>
    </div>}
  </>
}
