import { getContentType, getRelationshipFields, listContentTypes } from './contentTypeRegistry.js'

function referencesForField(field, value) {
  if (field.type === 'reference') return value ? [value] : []
  return Array.isArray(value) ? value : []
}

function displayLabel(record = {}) {
  return String(record.title || record.name || record.label || record.slug || record.id || '').trim()
}

export class ContentRelationshipError extends Error {
  constructor(message, status = 422, details = null) {
    super(message)
    this.name = 'ContentRelationshipError'
    this.status = status
    this.details = details
  }
}

export async function validateContentRelationships(typeId, fields, resolveRecord) {
  const errors = []
  for (const field of getRelationshipFields(typeId)) {
    const references = referencesForField(field, fields[field.id])
    for (const reference of references) {
      if (!reference?.type || !reference?.id) {
        errors.push({ field: field.id, code: 'invalid_reference', message: `${field.label || field.id} contains an invalid reference` })
        continue
      }
      if (!field.targetTypes.includes(reference.type)) {
        errors.push({
          field: field.id,
          code: 'invalid_target_type',
          message: `${field.label || field.id} cannot reference ${reference.type}`,
          reference,
        })
        continue
      }
      if (!getContentType(reference.type)) {
        errors.push({
          field: field.id,
          code: 'unknown_target_type',
          message: `${field.label || field.id} references an unknown content type`,
          reference,
        })
        continue
      }
      const target = await resolveRecord(reference.type, reference.id)
      if (!target) {
        errors.push({
          field: field.id,
          code: 'missing_target',
          message: `${field.label || field.id} references a record that does not exist`,
          reference,
        })
      }
    }
  }

  if (errors.length) throw new ContentRelationshipError('Content relationships are invalid', 422, errors)
  return fields
}

export async function resolveContentRelationships(typeId, fields, resolveRecord) {
  const resolved = {}
  for (const field of getRelationshipFields(typeId)) {
    const references = referencesForField(field, fields[field.id])
    const items = []
    for (const reference of references) {
      const target = await resolveRecord(reference.type, reference.id)
      items.push({
        ...reference,
        exists: Boolean(target),
        label: target ? displayLabel(target) : '',
        record: target ? {
          id: target.id,
          type: target.type,
          title: target.title,
          name: target.name,
          label: target.label,
          slug: target.slug,
          status: target.status,
        } : null,
      })
    }
    resolved[field.id] = field.type === 'reference' ? items[0] || null : items
  }
  return resolved
}

export async function findIncomingContentRelationships(targetTypeId, targetRecordId, listRecords) {
  const incoming = []
  for (const sourceType of listContentTypes()) {
    const fields = getRelationshipFields(sourceType.id)
    if (!fields.length) continue
    const records = await listRecords(sourceType.id)
    for (const record of records) {
      for (const field of fields) {
        const references = referencesForField(field, record[field.id])
        if (!references.some(reference => reference.type === targetTypeId && reference.id === targetRecordId)) continue
        incoming.push({
          sourceType: sourceType.id,
          sourceRecordId: record.id,
          sourceLabel: displayLabel(record),
          field: field.id,
          fieldLabel: field.label || field.id,
          onDelete: field.onDelete,
        })
      }
    }
  }
  return incoming
}

export function nullifyRelationshipValue(field, value, targetTypeId, targetRecordId) {
  if (field.type === 'reference') {
    return value?.type === targetTypeId && value?.id === targetRecordId ? null : value
  }
  if (!Array.isArray(value)) return []
  return value.filter(reference => reference?.type !== targetTypeId || reference?.id !== targetRecordId)
}