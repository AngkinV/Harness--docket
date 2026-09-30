// Each enabled combination is visited once per shuffle; never repeat at a boundary.
export function createInteractionPicker(random = Math.random) {
  let remaining = [], previous = '', signature = ''
  return choices => {
    const nextSignature = JSON.stringify(choices.map(i => i.id))
    if (signature !== nextSignature) { remaining = []; signature = nextSignature }
    if (!remaining.length) {
      remaining = choices.map(i => i.id)
      for (let i = remaining.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [remaining[i], remaining[j]] = [remaining[j], remaining[i]] }
      if (remaining.length > 1 && remaining.at(-1) === previous) [remaining[0], remaining[remaining.length - 1]] = [remaining.at(-1), remaining[0]]
    }
    previous = remaining.pop() || ''
    return choices.find(i => i.id === previous)
  }
}

export function interactionChoices(profile, defaults) {
  const distinct = items => {
    const seen = new Set()
    return items.filter(i => {
      const key = JSON.stringify([i.motion || i.action, i.expression, i.intensity, i.sticker, i.text])
      if (seen.has(key)) return false
      seen.add(key); return true
    })
  }
  let choices = distinct(profile.interactions.filter(i => i.enabled))
  if (choices.length < 2) choices = distinct([...choices, ...defaults.map(i => ({ ...i, id: 'fallback:' + i.id }))])
  return choices
}
