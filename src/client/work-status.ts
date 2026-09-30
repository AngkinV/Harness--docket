import { useEffect, useState } from 'react'
export function useWorkStatus(sessionId: string | null) {
  const [snapshot, setSnapshot] = useState({ sessionId, state: null as string | null, revision: 0 })
  useEffect(() => {
    let dead = false, timer: ReturnType<typeof setTimeout>, controller: AbortController | null = null
    setSnapshot({ sessionId, state: null, revision: 0 })
    const poll = async () => {
      if (dead || !sessionId) return
      if (!document.hidden) {
        controller = new AbortController()
        const timeout = setTimeout(() => controller?.abort(), 6000)
        try {
          const response = await fetch('/harness-docket/work-status.json?session=' + encodeURIComponent(sessionId), { cache: 'no-store', signal: controller.signal })
          if (response.ok) { const next = await response.json(); if (!dead && next.sessionId === sessionId) setSnapshot(before => before.sessionId === sessionId && before.revision === next.revision ? before : next) }
        } catch {} finally { clearTimeout(timeout) }
      }
      if (!dead) timer = setTimeout(poll, 1500)
    }
    void poll()
    return () => { dead = true; clearTimeout(timer); controller?.abort() }
  }, [sessionId])
  return snapshot.sessionId === sessionId ? snapshot : { sessionId, state: null, revision: 0 }
}
