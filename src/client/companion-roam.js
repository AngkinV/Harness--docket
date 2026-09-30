export function advanceRoam(position, target, delta, speed, maxX, maxY) {
  const dx = (target.x - position.x) * maxX, dy = (target.y - position.y) * maxY, distance = Math.hypot(dx, dy)
  const step = Math.min(distance, speed * Math.min(.1, Math.max(0, delta)))
  return { x: Math.max(0, Math.min(1, position.x + (distance && maxX ? dx / distance * step / maxX : 0))), y: Math.max(0, Math.min(1, position.y + (distance && maxY ? dy / distance * step / maxY : 0))), arrived: distance <= 2, angle: Math.atan2(dx, dy) }
}
