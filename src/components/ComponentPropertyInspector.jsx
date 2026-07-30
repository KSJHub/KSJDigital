import { useState } from 'react'
import { useComponentRegistry } from '../hooks/useComponentRegistry.js'
import { api } from '../services/api.js'
import { VisualImageControl } from './VisualImageControl.jsx'
import '../styles/component-property-inspector.css'

function fieldValue(component, field) {
  const value = component?.[field.key]
  if (field.type === 'boolean') return value === true
  if (field.type === 'number') return Number.isFinite(Number(value)) ? Number(value) : ''
  return value ?? ''
}

function itemLabel(key) {
  return String(key || 'value')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, character => character.toUpperCase())
}

function emptyRepeaterItem(field) {
  return Object.fromEntries((field.itemFields || []).map(key => [key, '']))
}

function moveItem(items, index, direction) {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

function normaliseSiteUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).origin.toLowerCase()
  } catch {
    return raw.replace(/\/$/, '').toLowerCase()
  }
}

async function resolveActiveWebsite() {
  const websites = await api.getWebsites()
  const available = Array.isArray(websites) ? websites : []
  if (available.length === 1) return available[0]

  const frameUrl = normaliseSiteUrl(document.querySelector('.editorCanvas iframe')?.src)
  if (!frameUrl) return null

  return available.find(website => [
    website.developmentEditorUrl,
    website.editorUrl,
    website.previewUrl,
    website.domain,
  ].some(candidate => normaliseSiteUrl(candidate) === frameUrl)) || null
}

function RepeaterField({ component, field, disabled, onChange }) {
  const items = Array.isArray(component?.[field.key]) ? component[field.key] : []
  const [uploadError, setUploadError] = useState('')
  const [uploadingKey, setUploadingKey] = useState('')
  const busy = Boolean(uploadingKey)

  function updateItems(nextItems) {
    if (disabled || busy) return
    onChange(field.key, nextItems)
  }

  function updateItem(index, key, value) {
    if (disabled || busy) return
    updateItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  }

  function removeItem(index) {
    if (disabled || busy) return
    const label = items[index]?.question || items[index]?.caption || `${field.label} ${index + 1}`
    if (!window.confirm(`Remove “${label}” from this section?`)) return
    updateItems(items.filter((_, itemIndex) => itemIndex !== index))
  }

  async function uploadItemImage(index, key, file) {
    if (!file || disabled || busy) return
    const requestKey = `${index}-${key}`
    setUploadError('')
    setUploadingKey(requestKey)
    try {
      const website = await resolveActiveWebsite()
      if (!website?.id) throw new Error('The active website could not be identified for this upload.')
      const slotId = `pageBlocks.${component.id}.${field.key}.${index}.${key}`
      const asset = await api.uploadAsset(website.owner || website.id, website.id, slotId, file)
      if (!asset?.url) throw new Error('The media upload did not return an asset URL.')
      onChange(field.key, items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: asset.url } : item))
    } catch (error) {
      setUploadError(error.message || 'Image upload failed')
    } finally {
      setUploadingKey('')
    }
  }

  return (
    <div className="componentRepeaterEditor">
      {!items.length && <div className="componentInspectorNotice">No items added yet.</div>}
      {items.map((item, index) => (
        <section className="componentRepeaterItem" key={`${field.key}-${index}`}>
          <header>
            <strong>{item?.question || item?.caption || `${field.label} ${index + 1}`}</strong>
            <div>
              <button type="button" disabled={disabled || busy || index === 0} onClick={() => updateItems(moveItem(items, index, 'up'))} aria-label="Move item up">↑</button>
              <button type="button" disabled={disabled || busy || index === items.length - 1} onClick={() => updateItems(moveItem(items, index, 'down'))} aria-label="Move item down">↓</button>
              <button type="button" className="danger" disabled={disabled || busy} onClick={() => removeItem(index)}>Remove</button>
            </div>
          </header>
          <div className="componentRepeaterFields">
            {(field.itemFields || Object.keys(item || {})).map(key => (
              <label key={key}>
                <span>{itemLabel(key)}</span>
                {key === 'src'
                  ? (
                    <>
                      <VisualImageControl
                        value={item?.[key] || ''}
                        disabled={disabled || busy}
                        onUpload={file => uploadItemImage(index, key, file)}
                        onUrlChange={value => updateItem(index, key, value)}
                      />
                      {uploadingKey === `${index}-${key}` && <small role="status">Uploading image…</small>}
                    </>
                  )
                  : key === 'answer'
                    ? <textarea value={item?.[key] || ''} disabled={disabled || busy} onChange={event => updateItem(index, key, event.target.value)} />
                    : <input value={item?.[key] || ''} disabled={disabled || busy} onChange={event => updateItem(index, key, event.target.value)} />}
              </label>
            ))}
          </div>
        </section>
      ))}
      {uploadError && <div className="componentInspectorNotice error" role="alert">{uploadError}</div>}
      <button type="button" className="componentRepeaterAdd" disabled={disabled || busy} onClick={() => updateItems([...items, emptyRepeaterItem(field)])}>＋ Add Item</button>
    </div>
  )
}

function FieldControl({ component, field, disabled, onChange, onUpload }) {
  const value = fieldValue(component, field)
  const update = nextValue => onChange(field.key, nextValue)

  if (field.type === 'textarea') {
    return <textarea value={value} disabled={disabled} onChange={event => update(event.target.value)} />
  }

  if (field.type === 'image') {
    return (
      <VisualImageControl
        value={value}
        disabled={disabled}
        onUpload={file => onUpload?.(field.key, file)}
        onUrlChange={nextValue => update(nextValue)}
      />
    )
  }

  if (field.type === 'boolean') {
    return (
      <label className="componentInspectorToggle">
        <input type="checkbox" checked={value} disabled={disabled} onChange={event => update(event.target.checked)} />
        <span>{value ? 'Enabled' : 'Disabled'}</span>
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <select value={value} disabled={disabled} onChange={event => update(event.target.value)}>
        {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  }

  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={value}
        min={field.minimum}
        max={field.maximum}
        disabled={disabled}
        onChange={event => update(event.target.value === '' ? '' : Number(event.target.value))}
      />
    )
  }

  return (
    <input
      type={field.type === 'url' ? 'url' : 'text'}
      value={value}
      disabled={disabled}
      required={field.required === true}
      onChange={event => update(event.target.value)}
    />
  )
}

export function ComponentPropertyInspector({ definition, component, disabled = false, onChange, onUpload, onClose }) {
  const { componentsByType, loading, error } = useComponentRegistry(null)
  const resolvedDefinition = componentsByType.get(component?.type) || definition
  if (!resolvedDefinition || !component) return null

  return (
    <div className="componentPropertyInspector">
      <header>
        <div>
          <span>{resolvedDefinition.category}</span>
          <h2>{resolvedDefinition.title}</h2>
          <p>{resolvedDefinition.description}</p>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close component properties">×</button>}
      </header>

      {loading && !definition && <div className="componentInspectorNotice">Loading component definition…</div>}
      {error && definition && <div className="componentInspectorNotice">Using the built-in component definition because the live registry is unavailable.</div>}

      <div className="componentInspectorFields">
        {(resolvedDefinition.fields || []).map(field => (
          <label key={field.key} className={field.type === 'boolean' ? 'componentInspectorBooleanField' : ''}>
            <span>{field.label}{field.required && <b>Required</b>}</span>
            {field.type === 'repeater'
              ? <RepeaterField component={component} field={field} disabled={disabled} onChange={onChange} />
              : <FieldControl component={component} field={field} disabled={disabled} onChange={onChange} onUpload={onUpload} />}
          </label>
        ))}
      </div>
    </div>
  )
}
