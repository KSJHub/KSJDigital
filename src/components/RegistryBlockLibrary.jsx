import { useMemo, useState } from 'react'
import { createComponentBlock } from '../../shared/componentRegistry.js'
import { useComponentRegistry } from '../hooks/useComponentRegistry.js'
import '../styles/registry-block-library.css'

function groupComponents(components) {
  return components.reduce((groups, component) => {
    const category = component.category || 'Other'
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category).push(component)
    return groups
  }, new Map())
}

export function RegistryBlockLibrary({ capabilities = [], pathname = '/', nextOrder = 10, onAdd, onClose }) {
  const { components, loading, error } = useComponentRegistry(capabilities)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return components
    return components.filter(component => [component.title, component.description, component.category, component.type]
      .some(value => String(value || '').toLowerCase().includes(search)))
  }, [components, query])
  const grouped = useMemo(() => groupComponents(filtered), [filtered])

  function addComponent(definition) {
    const block = createComponentBlock(definition.type, { order: nextOrder })
    onAdd?.(block, definition)
  }

  return (
    <aside className="editorBlockLibrary registryBlockLibrary">
      <div className="selectedFieldTitle">
        <div><span>Add Section</span><code>{pathname}</code></div>
        <button className="inspectorClose" onClick={onClose} aria-label="Close section library">×</button>
      </div>
      <p>Choose a reusable section. Available options match the tools enabled for this website.</p>
      <label className="registryBlockSearch">
        Search sections
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search text, gallery, products…" />
      </label>
      {loading && <p className="registryBlockState">Loading section library…</p>}
      {error && <p className="registryBlockState error">{error}</p>}
      {!loading && !error && !filtered.length && <p className="registryBlockState">No matching sections.</p>}
      {[...grouped.entries()].map(([category, entries]) => (
        <section className="registryBlockCategory" key={category}>
          <h3>{category}</h3>
          <div className="blockTemplateGrid">
            {entries.map(component => (
              <button key={component.type} onClick={() => addComponent(component)}>
                <span>{component.icon}</span>
                <strong>{component.title}</strong>
                <small>{component.description}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </aside>
  )
}
