import { useMemo, useState } from 'react'
import { createComponentBlock } from '../../shared/componentRegistry.js'
import { useComponentRegistry } from '../hooks/useComponentRegistry.js'
import '../styles/registry-block-library.css'

function presetEntries(components) {
  return components.flatMap(component => {
    const presets = Array.isArray(component.presets) && component.presets.length
      ? component.presets
      : [{ id: 'default', name: component.title, description: component.description, values: {} }]
    return presets.map(preset => ({ component, preset }))
  })
}

function groupPresets(entries) {
  return entries.reduce((groups, entry) => {
    const category = entry.component.category || 'Other'
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category).push(entry)
    return groups
  }, new Map())
}

export function RegistryBlockLibrary({ capabilities = [], pathname = '/', nextOrder = 10, onAdd, onClose }) {
  const { components, loading, error } = useComponentRegistry(capabilities)
  const [query, setQuery] = useState('')
  const [addingKey, setAddingKey] = useState('')
  const entries = useMemo(() => presetEntries(components), [components])
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return entries
    return entries.filter(({ component, preset }) => [
      component.title,
      component.description,
      component.category,
      component.type,
      preset.name,
      preset.description,
      preset.id,
    ].some(value => String(value || '').toLowerCase().includes(search)))
  }, [entries, query])
  const grouped = useMemo(() => groupPresets(filtered), [filtered])

  async function addPreset(component, preset) {
    if (addingKey) return
    const key = `${component.type}-${preset.id}`
    setAddingKey(key)
    try {
      const presetId = preset.id === 'default' ? undefined : preset.id
      const block = createComponentBlock(component.type, { order: nextOrder, presetId })
      await onAdd?.(block, component)
    } finally {
      setAddingKey('')
    }
  }

  return (
    <aside className="editorBlockLibrary registryBlockLibrary">
      <div className="selectedFieldTitle">
        <div><span>Add Section</span><code>{pathname}</code></div>
        <button className="inspectorClose" onClick={onClose} aria-label="Close section library">×</button>
      </div>
      <p>Choose a ready-made section preset. Available options match the tools enabled for this website.</p>
      <label className="registryBlockSearch">
        Search sections
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search hero, gallery, contact…" />
      </label>
      {loading && <p className="registryBlockState">Refreshing section library…</p>}
      {error && entries.length > 0 && <p className="registryBlockState">Live registry unavailable. Using the built-in section library.</p>}
      {error && !entries.length && <p className="registryBlockState error">{error}</p>}
      {!loading && !filtered.length && <p className="registryBlockState">No matching section presets.</p>}
      {[...grouped.entries()].map(([category, categoryEntries]) => (
        <section className="registryBlockCategory" key={category}>
          <h3>{category}</h3>
          <div className="blockTemplateGrid">
            {categoryEntries.map(({ component, preset }) => {
              const key = `${component.type}-${preset.id}`
              return (
                <button key={key} disabled={Boolean(addingKey)} onClick={() => addPreset(component, preset)}>
                  <span>{component.icon}</span>
                  <strong>{addingKey === key ? 'Adding…' : preset.name}</strong>
                  <small>{preset.description}</small>
                  <em>{component.title}</em>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </aside>
  )
}
