import { useEffect, useMemo, useState } from 'react'
import { componentLibrary } from '../../shared/componentRegistry.js'
import { api } from '../services/api.js'

export function useComponentRegistry(capabilities = []) {
  const [components, setComponents] = useState(() => componentLibrary(capabilities))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    api.getComponents()
      .then(result => {
        if (cancelled) return
        const records = Array.isArray(result) ? result : []
        setComponents(records.length ? records : componentLibrary(null))
      })
      .catch(requestError => {
        if (cancelled) return
        setComponents(componentLibrary(null))
        setError(requestError.message || 'Live component library could not be loaded; using the built-in registry')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const availableComponents = useMemo(() => {
    if (capabilities == null) return components
    const enabled = new Set(Array.isArray(capabilities) ? capabilities : [])
    return components.filter(component => !component.capability || enabled.has(component.capability))
  }, [capabilities, components])

  const componentsByType = useMemo(
    () => new Map(availableComponents.map(component => [component.type, component])),
    [availableComponents],
  )

  return {
    components: availableComponents,
    componentsByType,
    loading,
    error,
  }
}
