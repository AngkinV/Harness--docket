let namespace = 'page-' + Math.random().toString(36).slice(2)
const memory = new Map()
export const preferenceKey = key => key + ':' + namespace
export function configurePreferences(id, storage = globalThis.localStorage) {
  namespace = id
  // Legacy preferences belong only to the first instance that claims them.
  try {
    const ownerKey = 'harness-docket:legacy-owner', owner = storage.getItem(ownerKey)
    if (owner && owner !== id) return
    storage.setItem(ownerKey, id)
    for (const key of ['dsh-boot-animation:seen', 'dsh-boot-animation:pinned', 'dsh-boot-animation:fit', 'harness-docket:avatar-position:v1']) {
      const value = storage.getItem(key)
      if (value !== null && storage.getItem(preferenceKey(key)) === null) storage.setItem(preferenceKey(key), value)
    }
  } catch { /* The in-page map remains usable when persistence is disabled. */ }
}
export function readPreference(key) {
  key = preferenceKey(key)
  try { const value = globalThis.localStorage.getItem(key); if (value !== null) memory.set(key, value); else memory.delete(key) } catch {}
  return memory.get(key) ?? null
}
export function writePreference(key, value) {
  key = preferenceKey(key)
  if (value === null) memory.delete(key); else memory.set(key, value)
  try { if (value === null) globalThis.localStorage.removeItem(key); else globalThis.localStorage.setItem(key, value); return true } catch { return false }
}
