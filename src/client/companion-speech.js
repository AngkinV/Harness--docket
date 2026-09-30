export class CompanionSpeech {
  constructor(engine, createUtterance, changed = (_value = false) => {}, failed = () => {}) { this.failed = failed; this.engine = engine; this.create = createUtterance; this.changed = changed; this.generation = 0; this.active = false }
  cancel() { this.generation++; if (this.active) this.engine?.cancel(); this.active = false; this.changed(false) }
  speak(text, { enabled = false, volume = .7, voice = '' } = {}) {
    this.cancel()
    if (!enabled || !this.engine || !text) return false
    const utterance = this.create(text), token = this.generation
    const voices = this.engine.getVoices(), selected = voices.find(v => v.voiceURI === voice) || voices.find(v => /^zh/i.test(v.lang))
    if (!selected) return false
    utterance.voice = selected; utterance.lang = selected.lang; utterance.volume = Math.max(0, Math.min(1, volume)); utterance.rate = 1
    const done = () => { if (token === this.generation) { this.active = false; this.changed(false) } }
    utterance.onstart = () => { if (token === this.generation) this.changed(true) }
    utterance.onend = done; utterance.onerror = () => { if (token === this.generation) this.failed(); done() }
    this.active = true
    try { this.engine.speak(utterance); return true } catch { done(); return false }
  }
}

export function localCompanionReply(text, state) {
  const compact = text.replace(/\s/g, '')
  if (/(自动播放|自动片头)/.test(compact)) {
    const turnOff = /(关闭|关掉|停止|禁用)/.test(compact), turnOn = /(开启|打开|启用)/.test(compact)
    if ((turnOff || turnOn) && !/[吗？?]|是否|怎么|如何/.test(compact)) return { text: `点击下面的按钮${turnOff ? '关闭' : '开启'}自动播放。`, action: !turnOff }
    return { text: state.enabled ? '自动播放已开启：新会话播放一次，固定会话按重播规则播放；手动预览独立可用。' : '自动播放已关闭；新会话和固定会话都不会自动弹出视频，手动预览仍可使用。' }
  }
  if (/(片头|视频|片源)/.test(compact) && /(哪个|哪段|选|片名|正在|现在)/.test(compact)) {
    if (state.play.phase === 'resolving') return { text: '正在读取本次片源，还没有开始播放。' }
    const current = ['loading', 'playing', 'buffering'].includes(state.play.phase) && state.play.name
    return { text: current ? `${state.play.phase === 'loading' ? '正在加载' : state.play.phase === 'buffering' ? '正在缓冲' : '本次'}${state.play.source === 'preview' ? '预览' : '播放'}《${state.play.name}》。${state.selectionKnown && (state.selected?.id !== state.play.id || state.selected?.version !== state.play.version) ? `下次使用${state.selected ? `《${state.selected.name}》` : '的片头尚未选择'}。` : ''}` : state.selectionKnown ? state.selected ? `当前选中《${state.selected.name}》，现在没有播放视频。` : '目前没有可播放的片头，可以去片库选择或上传。' : '暂时无法确认片源，请在片库刷新后再试。' }
  }
  return null
}
