import { useEffect, useState } from 'react'

// Shared across module reloads and repeated shell slots; release promotes the
// next mounted root, so StrictMode cleanup cannot permanently hide the pet.
export function useSingleCompanion() {
  const [owned, setOwned] = useState(false)
  useEffect(() => {
    const scope = window as any
    const registry: Map<object, (owned: boolean) => void> = scope[Symbol.for('harness-docket:single-companion')] ||= new Map()
    const token = {}, notify = () => { const first = registry.keys().next().value; registry.forEach((update, key) => update(key === first)) }
    registry.set(token, setOwned); notify()
    return () => { registry.delete(token); notify() }
  }, [])
  return owned
}
