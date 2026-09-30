// Shader materials (including MToon) keep textures inside uniforms. Shared
// textures and ImageBitmaps must each be released once, including nested values.
export function disposeModelResources(root) {
  const textures = new Set(), materials = new Set(), geometries = new Set(), skeletons = new Set(), visited = new Set(), images = new Set()
  const collect = value => {
    if (!value || typeof value !== 'object' || visited.has(value)) return
    visited.add(value)
    if (value.isTexture) { textures.add(value); return }
    if (Array.isArray(value)) value.forEach(collect)
    else if (Object.getPrototypeOf(value) === Object.prototype) Object.values(value).forEach(collect)
  }
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry)
    if (object.skeleton) skeletons.add(object.skeleton)
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      if (materials.has(material)) continue
      materials.add(material); Object.values(material).forEach(collect)
    }
  })
  for (const texture of textures) { texture.dispose(); if (texture.source?.data) images.add(texture.source.data) }
  for (const image of images) image.close?.()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
  for (const skeleton of skeletons) skeleton.dispose()
}
