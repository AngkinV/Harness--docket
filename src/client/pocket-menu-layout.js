import { overlapsMask } from './attached-menu-layout.js'

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
export const ease = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x) }
export const SETTLE = .44, CYCLE = .86, RELEASE = .52
export const DURATION = SETTLE + 3 * CYCLE
export function pocketPhase(time) {
  const cycle = Math.max(0, time - SETTLE)
  return { index: Math.min(2, Math.floor(cycle / CYCLE)), local: cycle % CYCLE, settled: time >= SETTLE, done: time >= DURATION }
}

// All three centers share a circle and equal angular spacing. Rotate the
// semicircle as a whole near viewport edges; never clamp individual buttons.
export function pocketMenuLayout({ measurement, width, height, origin, viewport, touch = false, side = 'auto' }) {
  const body = measurement?.mask?.body || { left: width * .32, right: width * .68, top: height * .46, bottom: height * .94 }
  const reference = measurement?.referenceHeight || body.bottom - body.top
  const diameter = clamp(reference * .22, 22, 30), hit = touch ? 44 : Math.max(34, diameter + 8)
  const center = { x: (body.left + body.right) / 2, y: measurement?.anchor?.y || (body.top + body.bottom) / 2 }
  const preferred = side === 'left' ? Math.PI : side === 'right' ? 0 : origin.x + center.x > viewport.width / 2 ? Math.PI : 0
  const angles = [preferred, preferred + Math.PI, -Math.PI / 2, Math.PI / 2, ...Array.from({ length: 24 }, (_, i) => i * Math.PI / 12)]
  let best = null
  for (let r = Math.max(48, reference * .55, hit * 1.12); r <= Math.max(170, reference * 1.3); r += 4) {
    for (let order = 0; order < angles.length; order++) {
      const axis = angles[order]
      const points = [-Math.PI / 3, 0, Math.PI / 3].map(a => ({ x: center.x + r * Math.cos(axis + a), y: center.y + r * Math.sin(axis + a) }))
      const safe = points.every(p => {
        const rect = { x: p.x - hit / 2, y: p.y - hit / 2, width: hit, height: hit }
        return origin.x + rect.x >= (viewport.left || 0) + 6 && origin.x + rect.x + hit <= (viewport.left || 0) + viewport.width - 6 && origin.y + rect.y >= (viewport.top || 0) + 6 && origin.y + rect.y + hit <= (viewport.top || 0) + viewport.height - 6 && (!measurement?.mask || !overlapsMask(measurement.mask, rect, 3))
      })
      if (!safe) continue
      const score = r + order * 3
      if (!best || score < best.score) best = { points, center, radius: r, axis, diameter, hit, score, side: Math.cos(axis) < 0 ? -1 : 1 }
    }
  }
  // Extremely short viewports still expose the controls, with the circle
  // centered in the available free space, rather than overlapping hit areas.
  if (!best) {
    const r = hit * 1.12, axis = -Math.PI / 2
    const c = { x: clamp(origin.x + center.x, hit + 6, viewport.width - hit - 6) - origin.x, y: clamp(origin.y + center.y, r + hit / 2 + 6, viewport.height - hit / 2 - 6) - origin.y }
    best = { center: c, radius: r, axis, diameter, hit, side: 1, fallback: true, points: [-Math.PI / 3, 0, Math.PI / 3].map(a => ({ x: c.x + r * Math.cos(axis + a), y: c.y + r * Math.sin(axis + a) })) }
  }
  best.points.sort((a, b) => Math.abs(Math.cos(best.axis)) > .5 ? a.y - b.y : a.x - b.x)
  return best
}

// Hermite-equivalent cubic: zero speed at both endpoints prevents a visible
// velocity jump when the hand stops, releases, and the token lands.
export function tokenFlight(start, end, progress) {
  const t = ease(progress), lift = Math.sin(Math.PI * t) * Math.min(12, Math.hypot(end.x - start.x, end.y - start.y) * .15)
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t - lift }
}
