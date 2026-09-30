// Current-session snapshots only. No conversation text or model calls.
export function createWorkStatus() {
  const sessions = new Map()
  let revision = 0
  function accept(session, event) {
    const id = session?.id
    if (typeof id !== 'string' || !event) return
    const previous = sessions.get(id) || { state: null, goal: false, closing: null }
    const next = { ...previous }, d = event.data || {}
    switch (event.type) {
      case 'turn/start': next.state = 'thinking'; next.goal = false; next.closing = null; break
      case 'user/message': if (d.source?.kind === 'goal') next.goal = true; break
      case 'tool/call':
        next.state = ['ask_user_question', 'request_user_input'].includes(d.name) ? 'waiting' : 'working'
        if (d.name === 'update_goal') { try { const args = typeof d.arguments === 'string' ? JSON.parse(d.arguments) : d.arguments; next.closing = args?.action || args?.status } catch {} }
        break
      case 'tool/result': next.state = 'working'; break
      case 'approval/asked': next.state = 'waiting'; break
      case 'approval/resolved': next.state = 'working'; break
      case 'turn/end':
        next.state = d.reason?.kind === 'completed' ? next.closing === 'blocked' ? 'waiting' : next.goal && next.closing !== 'complete' ? 'working' : 'success'
          : ['error', 'max-tokens', 'timeout'].includes(d.reason?.kind) ? 'error' : d.reason?.kind === 'blocked' ? 'waiting' : null
        break
      default: return
    }
    next.revision = next.state === previous.state ? previous.revision : ++revision
    next.at = Date.now(); sessions.delete(id); sessions.set(id, next)
    if (sessions.size > 200) sessions.delete(sessions.keys().next().value)
  }
  function snapshot(id) {
    const entry = sessions.get(id)
    return { sessionId: id, state: entry?.state || null, revision: entry?.revision || 0 }
  }
  return { accept, snapshot }
}
