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

// Only voice settings migrate from the removed companion conversation.
export function voicePreferences(raw) {
  try {
    const v = JSON.parse(raw || '{}') || {}
    return { voice: typeof v.voice === 'string' ? v.voice : '', volume: Number.isFinite(v.volume) ? Math.max(0, Math.min(1, v.volume)) : .7, speech: v.speech === true }
  } catch { return { voice: '', volume: .7, speech: false } }
}
