import React, { useMemo, useRef } from 'react'
import { layoutAttachedMenu, menuDefaults } from './attached-menu-layout.js'
export type MenuPreferences = { side: string; height: number; gap: number }
export function useAttachedMenu(measurement: any, width: number, height: number, origin: any, viewport: any, preferences: MenuPreferences | undefined, touch: boolean, expanded: boolean) {
  const previous = useRef<any>(null), identity = [measurement?.id, measurement?.version, width, height, touch, JSON.stringify(preferences)].join(':')
  const key = useRef(identity)
  return useMemo(() => {
    if (key.current !== identity) { previous.current = null; key.current = identity }
    const start = performance.now()
    const layout = layoutAttachedMenu({ measurement, width, height, origin, viewport, preferences: preferences || menuDefaults(), touch, expanded, previous: previous.current })
    layout.cpuMs = performance.now() - start
    previous.current = layout
    return layout
  }, [measurement, width, height, origin.x, origin.y, viewport.left, viewport.top, viewport.width, viewport.height, identity, expanded])
}
export function MenuToggle({ layout, expanded = false, buttonRef, ...props }: any) {
  return <button ref={buttonRef} type="button" className="hda-menu-toggle" data-side={layout.side} aria-expanded={expanded} {...props} style={{ left: layout.toggle.x, top: layout.toggle.y, width: layout.toggle.width, height: layout.toggle.height, '--menu-diameter': layout.diameter + 'px' } as any}>
    <span key={layout.side} className="hda-menu-pearl"><svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="5" cy="9" r=".75"/><circle cx="9" cy="9" r=".75"/><circle cx="13" cy="9" r=".75"/></svg></span>
  </button>
}
export function LayoutDebug({ measurement, layout }: any) {
  if (!new URLSearchParams(location.search).has('hda-layout-debug') || !measurement?.mask) return null
  const m = measurement.mask, b = m.body
  return <svg className="hda-layout-debug" width={m.cssWidth} height={m.cssHeight} aria-hidden="true" style={{ overflow: 'visible', position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <rect x={b.left} y={b.top} width={b.right-b.left} height={b.bottom-b.top} fill="none" stroke="#36a89d" strokeWidth=".5"/>
    {Array.from({ length: m.height }, (_, y) => { const xs = []; for (let x=0;x<m.width;x++) if (m.pixels[y*m.width+x]) xs.push(x); return xs.length ? <path key={y} d={xs.map(x=>`M${x*m.cssWidth/m.width} ${y*m.cssHeight/m.height}h${m.cssWidth/m.width}`).join('')} stroke="#ef996a" opacity=".35" strokeWidth={m.cssHeight/m.height}/> : null })}
    {[layout.toggle, ...layout.actions.flatMap((a:any)=>[a.hit,a.label])].map((r:any,i:number)=><rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill="none" stroke="#616ccb" strokeWidth=".5"/>)}
  </svg>
}
