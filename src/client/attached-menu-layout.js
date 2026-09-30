// CSS-pixel layout only. The renderer owns projection and the model-only mask.
export const menuDefaults = () => ({ side: 'auto', height: 0, gap: 3 })
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export function maskFromPixels(rgba, width, height, cssWidth, cssHeight, threshold = 32) {
  const pixels = new Uint8Array(width * height), integral = new Uint32Array((width + 1) * (height + 1))
  const labels = new Uint16Array(pixels.length), queue = new Int32Array(pixels.length), regions = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = +(rgba[((height - 1 - y) * width + x) * 4 + 3] >= threshold)
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) { row += pixels[y * width + x]; integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row }
  }
  for (let i = 0; i < pixels.length; i++) {
    if (!pixels[i] || labels[i]) continue
    const id = regions.length + 1, region = { id, area: 0, left: width, right: 0, top: height, bottom: 0 }
    let start = 0, end = 1; queue[0] = i; labels[i] = id
    while (start < end) {
      const n = queue[start++], x = n % width, y = Math.floor(n / width)
      region.area++; region.left = Math.min(region.left, x); region.right = Math.max(region.right, x + 1); region.top = Math.min(region.top, y); region.bottom = Math.max(region.bottom, y + 1)
      for (const next of [x ? n - 1 : -1, x < width - 1 ? n + 1 : -1, n - width, n + width]) if (next >= 0 && next < pixels.length && pixels[next] && !labels[next]) { labels[next] = id; queue[end++] = next }
    }
    regions.push(region)
  }
  regions.sort((a, b) => b.area - a.area)
  if (!regions.length) return null
  const major = regions.filter(r => r.area >= regions[0].area * .6)
  const bounds = rs => ({ left: Math.min(...rs.map(r => r.left)) * cssWidth / width, right: Math.max(...rs.map(r => r.right)) * cssWidth / width, top: Math.min(...rs.map(r => r.top)) * cssHeight / height, bottom: Math.max(...rs.map(r => r.bottom)) * cssHeight / height })
  const primary = major.map(r => r.id), columns = new Uint32Array(width)
  let total = 0
  for (let i = 0; i < labels.length; i++) if (primary.includes(labels[i])) { columns[i % width]++; total++ }
  let median = 0, count = 0
  while (median < width - 1 && count + columns[median] < total / 2) count += columns[median++]
  return { width, height, cssWidth, cssHeight, pixels, integral, labels, primary, subjectX: (median + .5) * cssWidth / width, body: bounds(major), bounds: bounds(regions), confidence: major.length === 1 ? 'primary' : 'multiple' }
}
export function overlapsMask(mask, rect, pad = 0) {
  if (!mask) return false
  const { width: w, height: h, cssWidth, cssHeight, integral } = mask
  const x0 = clamp(Math.floor((rect.x - pad) * w / cssWidth), 0, w), x1 = clamp(Math.ceil((rect.x + rect.width + pad) * w / cssWidth), 0, w)
  const y0 = clamp(Math.floor((rect.y - pad) * h / cssHeight), 0, h), y1 = clamp(Math.ceil((rect.y + rect.height + pad) * h / cssHeight), 0, h), stride = w + 1
  return integral[y1 * stride + x1] - integral[y1 * stride + x0] - integral[y0 * stride + x1] + integral[y0 * stride + x0] > 0
}
const intersects = (a, b, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
function edgeAt(mask, y, side) {
  const row = clamp(Math.floor(y * mask.height / mask.cssHeight), 0, mask.height - 1)
  let edge = side === 'right' ? -Infinity : Infinity
  for (let dy = -1; dy <= 1; dy++) for (let x = 0; x < mask.width; x++) {
    const n = (row + dy) * mask.width + x
    if (mask.primary.includes(mask.labels[n])) edge = side === 'right' ? Math.max(edge, (x + 1) * mask.cssWidth / mask.width) : Math.min(edge, x * mask.cssWidth / mask.width)
  }
  return edge
}
export function layoutAttachedMenu({ measurement, width, height, origin = { x: 0, y: 0 }, viewport, preferences = menuDefaults(), touch = false, expanded = false, previous = null }) {
  const mask = measurement?.mask, ref = measurement?.referenceHeight || height * .48
  const diameter = clamp(ref * .1, 14, 18), target = touch ? 44 : 32, actionTarget = touch ? 44 : 36, actionDiameter = touch ? 34 : 30
  const body = mask?.body || { left: width * .15, right: width * .85, top: height * .1, bottom: height * .9 }
  const anchor = measurement?.anchor || { x: mask?.subjectX ?? (body.left + body.right) / 2, y: body.top + (body.bottom - body.top) * .6 }
  const safe = rect => rect.x + origin.x >= viewport.left + 8 && rect.y + origin.y >= viewport.top + 8 && rect.x + rect.width + origin.x <= viewport.left + viewport.width - 8 && rect.y + rect.height + origin.y <= viewport.top + viewport.height - 8 && !overlapsMask(mask, rect)
  const fallbackBody = { x: body.left, y: body.top, width: body.right - body.left, height: body.bottom - body.top }
  const clear = rect => safe(rect) && (mask || !intersects(rect, fallbackBody))
  const preferred = preferences.side !== 'auto' ? preferences.side : previous?.side || 'right'
  const sides = [preferred, preferred === 'right' ? 'left' : 'right'], candidates = []
  const baseY = anchor.y + preferences.height * ref
  const offsets = [0, -.04, .04, -.08, .08, -.12, .12, -.18, .18, -.25, .25]
  for (const side of sides) for (const offset of offsets) {
    const y = clamp(baseY + offset * ref, body.top + 2, body.bottom - 2), edge = mask ? edgeAt(mask, y, side) : body[side]
    if (!Number.isFinite(edge)) continue
    // The visible circle touches the inner end of an outward-only hit area.
    for (const extra of [0, 2, 5, 10, 18]) {
      const inner = edge + (side === 'right' ? 1 : -1) * (preferences.gap + extra)
      const toggle = { x: side === 'right' ? inner : inner - target, y: y - target / 2, width: target, height: target }
      if (!clear(toggle)) continue
      const center = { x: inner + (side === 'right' ? 1 : -1) * diameter / 2, y }
      candidates.push({ side, toggle, center, diameter, actionDiameter, score: Math.abs(y - baseY) * .8 + Math.abs(inner - anchor.x) + extra * 2, actions: [], kind: 'closed', notice: '', safe: true })
      break
    }
  }
  const actionLayouts = c => {
    const direction = c.side === 'right' ? 1 : -1, step = actionTarget + 22
    const positions = []
    for (const shift of [0, -step * .45, step * .45]) positions.push({ kind: 'arc', points: [[target + 22, -step], [target + 38, 0], [target + 22, step]].map(([x,y]) => [x, y + shift]) })
    for (const shift of [0, -step, step]) positions.push({ kind: 'column', points: [[target + 26, -step], [target + 26, 0], [target + 26, step]].map(([x,y]) => [x, y + shift]) })
    for (const p of positions) {
      const actions = p.points.map(([x,y]) => {
        const hit = { x: c.center.x + direction * x - actionTarget / 2, y: c.center.y + y - actionTarget / 2, width: actionTarget, height: actionTarget }
        const label = { x: hit.x + actionTarget / 2 - 23, y: hit.y + actionTarget + 1, width: 46, height: 16 }
        return { hit, label }
      })
      if (actions.every(a => clear(a.hit) && clear(a.label) && !intersects(c.toggle, a.hit, 4) && !intersects(c.toggle, a.label, 4)) && actions.every((a,i) => actions.every((b,j) => i === j || !intersects(a.hit, b.hit, 4) && !intersects(a.hit, b.label, 4) && !intersects(a.label, b.label, 4)))) return { ...c, actions, kind: p.kind }
    }
    return null
  }
  // Keep a safe resting anchor exactly still; an unsafe anchor is never interpolated.
  if (previous && previous.diameter === diameter && previous.touch === touch && Math.abs(previous.baseY - baseY) < ref * .08 && clear(previous.toggle) && (!mask || Math.abs((previous.side === 'right' ? previous.toggle.x : previous.toggle.x + target) - edgeAt(mask, previous.center.y, previous.side)) <= preferences.gap + 5) && Math.abs(previous.center.y - baseY) < ref * .3) {
    const dy = expanded || Math.abs(baseY - previous.baseY) < 1.5 ? 0 : (baseY - previous.baseY) * .55
    const follow = { ...previous.toggle, y: previous.toggle.y + dy }
    const c = { ...previous, ...(clear(follow) ? { toggle: follow, center: { ...previous.center, y: previous.center.y + dy } } : {}), actions: [], notice: preferences.side !== 'auto' && previous.side !== preferences.side ? '已临时换侧避让，保存的首选侧不变。' : '', kind: 'closed' }
    if (!expanded || previous.actions?.length && previous.actions.every(a => clear(a.hit) && clear(a.label))) return { ...c, ...(expanded ? { actions: previous.actions, kind: previous.kind } : {}), baseY, touch }
  }
  const sidePenalty = preferences.side === 'auto' ? 8 : 1000
  candidates.sort((a,b) => a.score + (a.side === preferred ? 0 : sidePenalty) - b.score - (b.side === preferred ? 0 : sidePenalty))
  let chosen = expanded ? candidates.map(actionLayouts).find(Boolean) : candidates[0]
  if (!chosen) {
    chosen = candidates[0]
    if (!chosen) {
      // Off-screen/extreme geometry: keep a viewport-safe emergency control, never draw a menu over the model.
      const x = clamp(width + 3, viewport.left + 8 - origin.x, viewport.left + viewport.width - target - 8 - origin.x)
      const y = clamp(baseY - target / 2, viewport.top + 8 - origin.y, viewport.top + viewport.height - target - 8 - origin.y)
      chosen = { side: 'right', toggle: { x, y, width: target, height: target }, center: { x: x + diameter / 2, y: y + target / 2 }, diameter, actionDiameter, actions: [], kind: 'unavailable', safe: false }
    }
    if (expanded) chosen.notice = '空间不足，请移动人物或调整窗口后展开。'
  }
  if (preferences.side !== 'auto' && chosen.side !== preferences.side) chosen.notice = '已临时换侧避让，保存的首选侧不变。'
  return { ...chosen, baseY, touch }
}
