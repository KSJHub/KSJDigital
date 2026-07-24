function stringValue(value, fallback = '') {
  return String(value ?? fallback)
}

function normaliseStringList(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => stringValue(item).trim()).filter(Boolean)
}

function normaliseDate(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function normaliseObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value) : {}
}

function normaliseReference(value, context = {}) {
  if (value === null || value === undefined || value === '') return null
  const defaultType = Array.isArray(context.field?.targetTypes) && context.field.targetTypes.length === 1
    ? stringValue(context.field.targetTypes[0]).trim()
    : ''
  if (typeof value === 'string') {
    const id = value.trim()
    return id ? { type: defaultType, id } : null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = stringValue(value.id).trim()
  if (!id) return null
  return { type: stringValue(value.type, defaultType).trim(), id }
}

function normaliseReferences(value, context = {}) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .map(item => normaliseReference(item, context))
    .filter(reference => {
      if (!reference) return false
      const key = `${reference.type}:${reference.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 100)
}

const fieldTypes = new Map()

export function registerFieldType(definition) {
  const id = stringValue(definition?.id).trim()
  if (!id) throw new Error('Field type id is required')
  if (fieldTypes.has(id)) throw new Error(`Field type already registered: ${id}`)
  if (typeof definition.normalise !== 'function') throw new Error(`Field type ${id} requires a normalise function`)

  const registered = Object.freeze({
    id,
    label: stringValue(definition.label, id),
    normalise: definition.normalise,
  })
  fieldTypes.set(id, registered)
  return registered
}

export function getFieldType(id) {
  return fieldTypes.get(stringValue(id).trim()) || null
}

export function listFieldTypes() {
  return [...fieldTypes.values()]
}

export function isRelationshipFieldType(id) {
  return ['reference', 'references'].includes(stringValue(id).trim())
}

registerFieldType({ id: 'text', label: 'Text', normalise: value => stringValue(value) })
registerFieldType({ id: 'richText', label: 'Rich text', normalise: value => stringValue(value) })
registerFieldType({ id: 'boolean', label: 'Boolean', normalise: value => value === true })
registerFieldType({ id: 'date', label: 'Date', normalise: normaliseDate })
registerFieldType({ id: 'image', label: 'Image', normalise: value => stringValue(value) })
registerFieldType({ id: 'stringList', label: 'String list', normalise: normaliseStringList })
registerFieldType({ id: 'object', label: 'Object', normalise: normaliseObject })
registerFieldType({ id: 'blocks', label: 'Content blocks', normalise: value => Array.isArray(value) ? structuredClone(value) : [] })
registerFieldType({ id: 'reference', label: 'Reference', normalise: normaliseReference })
registerFieldType({ id: 'references', label: 'References', normalise: normaliseReferences })