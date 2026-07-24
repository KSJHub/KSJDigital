import crypto from 'node:crypto'
import path from 'node:path'
import {
  getContentType,
  getRelationshipFields,
  normaliseContentFields,
  validateContentFields,
} from './contentTypeRegistry.js'
import {
  ContentRelationshipError,
  findIncomingContentRelationships,
  nullifyRelationshipValue,
  resolveContentRelationships,
  validateContentRelationships,
} from './contentRelationshipService.js'
import {
  getContentRevision,
  importContentRevisions,
  listContentRevisions,
  saveContentRevision,
} from './contentRevisionService.js'
import { DATA_DIR, paths, readJson, safeName, writeJson } from '../storage.js'

export class ContentRecordError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'ContentRecordError'
    this.status = status
    this.details = details
  }
}

function identity(value, label) {
  const id = safeName(value)
  if (!id) throw new ContentRecordError(`${label} is required`)
  return id
}

function typeDefinition(value) {
  const id = identity(value, 'Content type')
  const definition = getContentType(id)
  if (!definition) throw new ContentRecordError(`Unknown content type: ${id}`, 404)
  return definition
}

function recordsPath(websiteId, typeId) {
  return path.join(DATA_DIR, 'content-records', safeName(websiteId), `${safeName(typeId)}.json`)
}

function normalisedFields(typeId, input, existing = {}) {
  return validateContentFields(typeId, normaliseContentFields(typeId, input, existing))
}

async function migrateLegacyArticles(websiteId) {
  const target = recordsPath(websiteId, 'article')
  const existing = await readJson(target, null)
  if (Array.isArray(existing)) return existing

  const legacy = await readJson(paths.articles(websiteId), [])
  if (!Array.isArray(legacy) || legacy.length === 0) {
    await writeJson(target, [])
    return []
  }

  const migrated = []
  for (const article of legacy) {
    const { revisions, ...record } = article
    const normalised = {
      id: article.id || crypto.randomUUID(),
      type: 'article',
      websiteId,
      ...normalisedFields('article', record, record),
      createdAt: article.createdAt || new Date().toISOString(),
      updatedAt: article.updatedAt || new Date().toISOString(),
    }
    migrated.push(normalised)
    await importContentRevisions(websiteId, 'article', normalised.id, revisions)
  }

  await writeJson(target, migrated)
  return migrated
}

async function getStoredRecords(websiteId, typeId) {
  if (typeId === 'article') return migrateLegacyArticles(websiteId)
  const records = await readJson(recordsPath(websiteId, typeId), [])
  if (!Array.isArray(records)) throw new ContentRecordError('Stored content records are invalid', 500)
  return records
}

async function resolveStoredRecord(websiteId, typeId, recordId) {
  if (!getContentType(typeId)) return null
  const records = await getStoredRecords(websiteId, typeId)
  return records.find(record => record.id === recordId) || null
}

async function validateRelationships(websiteId, typeId, fields) {
  return validateContentRelationships(typeId, fields, (targetType, targetId) => (
    resolveStoredRecord(websiteId, targetType, targetId)
  ))
}

async function hydrateRecord(websiteId, typeId, record) {
  const revisions = await listContentRevisions(websiteId, typeId, record.id)
  const hydrated = {
    ...record,
    revisions: revisions.map(revision => ({ id: revision.id, createdAt: revision.createdAt, ...revision.snapshot })),
  }
  if (!getRelationshipFields(typeId).length) return hydrated
  const relationships = await resolveContentRelationships(typeId, record, (targetType, targetId) => (
    resolveStoredRecord(websiteId, targetType, targetId)
  ))
  const hasReferences = Object.values(relationships).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value))
  return hasReferences ? { ...hydrated, relationships } : hydrated
}

export async function listContentRecords(websiteValue, typeValue) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const records = await getStoredRecords(websiteId, typeId)
  const hydrated = await Promise.all(records.map(record => hydrateRecord(websiteId, typeId, record)))
  return hydrated.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
}

export async function getContentRecord(websiteValue, typeValue, recordId) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const id = identity(recordId, 'Content record id')
  const records = await getStoredRecords(websiteId, typeId)
  const record = records.find(item => item.id === recordId || safeName(item.id) === id)
  if (!record) throw new ContentRecordError('Content record not found', 404)
  return hydrateRecord(websiteId, typeId, record)
}

export async function createContentRecord(websiteValue, typeValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const timestamp = new Date().toISOString()
  const fields = normalisedFields(typeId, input)
  await validateRelationships(websiteId, typeId, fields)
  const record = {
    id: input.id || crypto.randomUUID(),
    type: typeId,
    websiteId,
    ...fields,
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  }
  const records = await getStoredRecords(websiteId, typeId)
  await writeJson(recordsPath(websiteId, typeId), [record, ...records])
  return hydrateRecord(websiteId, typeId, record)
}

export async function updateContentRecord(websiteValue, typeValue, recordId, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const records = await getStoredRecords(websiteId, typeId)
  const index = records.findIndex(record => record.id === recordId)
  if (index < 0) throw new ContentRecordError('Content record not found', 404)

  const existing = records[index]
  const fields = normalisedFields(typeId, input, existing)
  await validateRelationships(websiteId, typeId, fields)
  const updated = {
    ...existing,
    ...fields,
    id: existing.id,
    type: typeId,
    websiteId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  }
  await saveContentRevision(websiteId, typeId, existing)
  const next = records.map((record, recordIndex) => recordIndex === index ? updated : record)
  await writeJson(recordsPath(websiteId, typeId), next)
  return hydrateRecord(websiteId, typeId, updated)
}

export async function restoreContentRecord(websiteValue, typeValue, recordId, revisionId) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const revision = await getContentRevision(websiteId, typeId, recordId, revisionId)
  if (!revision) throw new ContentRecordError('Revision not found', 404)
  return updateContentRecord(websiteId, typeId, recordId, { ...revision.snapshot, status: 'Draft' })
}

async function applyNullifyPolicies(websiteId, incoming, targetTypeId, targetRecordId) {
  const grouped = new Map()
  for (const relationship of incoming.filter(item => item.onDelete === 'nullify')) {
    const key = `${relationship.sourceType}:${relationship.sourceRecordId}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(relationship)
  }

  for (const relationships of grouped.values()) {
    const { sourceType, sourceRecordId } = relationships[0]
    const records = await getStoredRecords(websiteId, sourceType)
    const index = records.findIndex(record => record.id === sourceRecordId)
    if (index < 0) continue
    const existing = records[index]
    const fieldsById = new Map(getRelationshipFields(sourceType).map(field => [field.id, field]))
    const updated = { ...existing, updatedAt: new Date().toISOString() }
    for (const relationship of relationships) {
      const field = fieldsById.get(relationship.field)
      if (!field) continue
      updated[field.id] = nullifyRelationshipValue(field, updated[field.id], targetTypeId, targetRecordId)
    }
    await saveContentRevision(websiteId, sourceType, existing)
    records[index] = updated
    await writeJson(recordsPath(websiteId, sourceType), records)
  }
}

export async function deleteContentRecord(websiteValue, typeValue, recordId) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const records = await getStoredRecords(websiteId, typeId)
  if (!records.some(record => record.id === recordId)) throw new ContentRecordError('Content record not found', 404)

  const incoming = await findIncomingContentRelationships(typeId, recordId, sourceType => getStoredRecords(websiteId, sourceType))
  const restricted = incoming.filter(relationship => relationship.onDelete === 'restrict')
  if (restricted.length) {
    throw new ContentRelationshipError('Content record is still referenced', 409, restricted)
  }
  await applyNullifyPolicies(websiteId, incoming, typeId, recordId)

  const next = records.filter(record => record.id !== recordId)
  await writeJson(recordsPath(websiteId, typeId), next)
  return next
}