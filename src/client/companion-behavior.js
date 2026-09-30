export const workStates = ['thinking', 'working', 'waiting', 'success', 'error']
export function behaviorPriority({ paused, reaction, work, daily, walking }) {
  if (paused) return 'paused'
  if (reaction) return 'interacting'
  if (work) return work
  if (daily) return 'daily'
  return walking ? 'walking' : 'idle'
}
// Called with active seconds, so hover / menus / background do not consume cooldowns.
export function createDailyPicker(random = Math.random) {
  let last = '', due = 8
  const played = new Map()
  return (seconds, profile) => {
    if (profile.dailyEnabled === false || seconds < due) return null
    due = seconds + 10 + random() * 10
    const entries = (profile.daily || []).filter(e => e.weight > 0 && seconds - (played.get(e.id) ?? -Infinity) >= e.cooldown)
      .map(e => ({ ...e, interaction: profile.interactions.find(i => i.id === e.id && i.enabled) })).filter(e => e.interaction)
    const pool = entries.some(e => e.id !== last) ? entries.filter(e => e.id !== last) : entries
    if (!pool.length) return { id: 'daily:look', action: 'head', motion: null, expression: '', intensity: 0, duration: 3, text: '', sticker: 'none', size: 32 }
    let weight = random() * pool.reduce((sum, e) => sum + e.weight, 0)
    const chosen = pool.find(e => (weight -= e.weight) < 0) || pool.at(-1)
    last = chosen.id; played.set(last, seconds)
    return { ...chosen.interaction, text: '', sticker: 'none' }
  }
}
