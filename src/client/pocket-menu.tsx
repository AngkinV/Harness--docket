import React, { useEffect, useRef } from 'react'
import { ease, SETTLE, CYCLE, RELEASE, DURATION, tokenFlight } from './pocket-menu-layout.js'

export function PocketMenu({ expanded, layout, frame, children, menuRef }: any) {
  const previous = useRef<any[]>([]), focused = useRef(false)
  useEffect(() => { if (expanded) { previous.current = []; focused.current = false } }, [expanded])
  const time = frame?.time || 0, instant = frame?.instant, closing = frame?.closing
  const entries = React.Children.toArray(children).map((child: any, i) => {
    const local = time - SETTLE - i * CYCLE, end = layout.points[i]
    let visible = expanded && (instant || local >= RELEASE - .16), point = end, scale = 1, landed = instant || local >= RELEASE + .32, reveal = instant ? 1 : ease((local - RELEASE + .16) / .12)
    if (!instant && !landed) {
      const start = frame?.release?.[i] || frame?.palm || end
      if (local <= RELEASE) { point = frame?.palm || end; scale = .08 + .34 * ease((local - RELEASE + .16) / .16) }
      else { const progress = (local - RELEASE) / .32; point = tokenFlight(start, end, progress); scale = .42 + .58 * ease(progress) }
    }
    if (closing && previous.current[i]) { ({ visible, point, scale, landed, reveal } = previous.current[i]) }
    else previous.current[i] = { visible, point, scale, landed, reveal }
    const labelAbove = (menuRef.current?.getBoundingClientRect().top || 0) + end.y + layout.diameter / 2 + 25 > window.innerHeight - 6
    return React.cloneElement(child, { 'data-index': i, 'data-landed': landed, 'data-visible': visible, 'data-label-above': labelAbove,
      tabIndex: visible && landed ? 0 : -1, 'aria-hidden': !visible,
      style: { left: point.x - layout.hit / 2, top: point.y - layout.hit / 2, width: layout.hit, height: layout.hit, opacity: visible ? reveal * (closing ? frame.opacity : 1) : 0, visibility: visible ? 'visible' : 'hidden', pointerEvents: expanded && visible && landed ? 'auto' : 'none', '--token-scale': scale, '--token-diameter': layout.diameter + 'px' },
    })
  })
  useEffect(() => {
    if (!expanded || focused.current || !(instant || time >= DURATION)) return
    // Keep focus on the opener during retrieval, then enter the available menu.
    menuRef.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true }); focused.current = true
  }, [expanded, instant, time])
  return <div ref={menuRef} className="hda-menu hda-pocket-menu dba-dock-panel" id="hda-actions" role="menu" aria-label="桌宠快捷功能" aria-busy={expanded && !instant && time < DURATION} hidden={!expanded && (!closing || !frame?.active)} data-arc={JSON.stringify(layout)} data-time={time} onKeyDown={event => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = [...menuRef.current.querySelectorAll('button:not(:disabled)[data-landed=true]')] as HTMLButtonElement[]
    if (!buttons.length) return
    event.preventDefault(); const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }}>{entries}</div>
}
