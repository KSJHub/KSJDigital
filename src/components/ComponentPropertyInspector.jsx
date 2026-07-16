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

function RepeaterField({ component, field, disabled, onChange }) {
  const items = Array.isArray(component?.[field.key]) ? component[field.key] : []

  function updateItems(nextItems) {
    onChange(field.key, nextItems)
  }

  function updateItem(index, key, value) {
    updateItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  }

  return (
    <div className="componentRepeaterEditor">
      {!items.length && <div className="componentInspectorNotice">No items added yet.</div>}
      {items.map((item, index) => (
        <section className="componentRepeaterItem" key={`${field.key}-${index}`}>
          <header>
            <strong>{item?.question || item?.caption || `${field.label} ${index + 1}`}</strong>
            <div>
              <button type="button" disabled={disabled || index === 0} onClick={() => updateItems(moveItem(items, index, 'up'))} aria-label="Move item up">↑</button>
              <button type="button" disabled={disabled || index === items.length - 1} onClick={() => updateItems(moveItem(items, index, 'down'))} aria-label="Move item down">↓</button>
              <button type="button" className="danger" disabled={disabled} onClick={() => updateItems(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
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
                        disabled={disabled}
                        onUrlChange={value => updateItem(index, key, value)}
                      />
                      <small>Paste or choose an existing Media Library URL. Direct nested uploads are added in the next media slice.</small>
                    </>
                  )
                  : key === 'answer'
                    ? <textarea value={item?.[key] || ''} disabled={disabled} onChange={event => updateItem(index, key, event.target.value)} />
                    : <input value={item?.[key] || ''} disabled={disabled} onChange={event => updateItem(index, key, event.target.value)} />}
              </label>
            ))}
          </div>
        </section>
      ))}
      <button type="button" className="componentRepeaterAdd" disabled={disabled} onClick={() => updateItems([...items, emptyRepeaterItem(field)])}>＋ Add Item</button>
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
  if (!definition || !component) return null

  return (
    <div className="componentPropertyInspector">
      <header>
        <div>
          <span>{definition.category}</span>
          <h2>{definition.title}</h2>
          <p>{definition.description}</p>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close component properties">×</button>}
      </header>

      <div className="componentInspectorFields">
        {(definition.fields || []).map(field => (
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
