import { VisualImageControl } from './VisualImageControl.jsx'
import '../styles/component-property-inspector.css'

function fieldValue(component, field) {
  const value = component?.[field.key]
  if (field.type === 'boolean') return value === true
  if (field.type === 'number') return Number.isFinite(Number(value)) ? Number(value) : ''
  return value ?? ''
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
    <aside className="componentPropertyInspector">
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
              ? <div className="componentInspectorNotice">Repeating items are managed in the website preview.</div>
              : (
                <FieldControl
                  component={component}
                  field={field}
                  disabled={disabled}
                  onChange={onChange}
                  onUpload={onUpload}
                />
              )}
          </label>
        ))}
      </div>
    </aside>
  )
}
