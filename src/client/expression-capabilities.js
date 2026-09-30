export function effectiveExpressions(manager) {
  return Object.entries(manager?.expressionMap || {}).filter(([, expression]) => expression._binds?.some(bind => {
    if (Array.isArray(bind.primitives)) return Number.isFinite(bind.weight) && bind.weight !== 0 && bind.primitives.some(mesh => mesh.morphTargetInfluences?.[bind.index] !== undefined && mesh.geometry?.morphAttributes?.position?.[bind.index])
    // Material/texture expression binds also produce visible changes.
    return !!bind.material
  })).map(([name]) => name)
}
