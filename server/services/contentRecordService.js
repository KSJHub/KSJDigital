import crypto from 'node:crypto'
import path from 'node:path'
import {
  getContentType,
  getRelationshipFields,
  listContentTypes,
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
import {
  appendWorkflowHistory,
  applyWorkflowTransition,
  listAvailableWorkflowTransitions,
  listWorkflowHistory,
  scheduledPublicationIsDue,
} from './contentWorkflowService.js'
import {
  indexContentRecord,
  rebuildContentSearchIndex,
  removeContentSearchDocument,
} from './contentSearchService.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'
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

function workflowProtectedInput(definition, input = {}) {
  if (!definition.workflow) return input
  const protectedFields = new Set([definition.workflow.field, 'scheduledAt', 'publishedAt'])
  return Object.fromEntries(Object.entries(input).filter(([key]) => !protectedFields.has(key)))
}

function normalisedFields(typeId, input, existing = {}) {
  return validateContentFields(typeId, normaliseContentFields(typeId, input, existing))
}

function initialWorkflowFields(definition, fields) {
  if (!definition.workflow) return fields
  return { ...fields, [definition.workflow.field]: definition.workflow.initialState, scheduledAt: null, publishedAt: null }
}

function contentRecordState(record = {}) {
  const state = { ...record }
  for (const field of ['id', 'type', 'websiteId', 'createdAt', 'updatedAt']) delete state[field]
  return state
}

function contentRecordStateChanged(current, proposed) {
  return JSON.stringify(contentRecordState(current)) !== JSON.stringify(contentRecordState(proposed))
}

function contentRecordEventPayload(definition, record = {}, details = {}) {
  const structuralFields = new Set(['id', 'type', 'websiteId', 'createdAt', 'updatedAt'])
  return {
    fieldCount: Object.keys(record).filter(key => !structuralFields.has(key)).length,
    relationshipFieldCount: getRelationshipFields(definition.id).length,
    workflowEnabled: Boolean(definition.workflow),
    published: Boolean(record.publishedAt),
    scheduled: Boolean(record.scheduledAt),
    ...details,
  }
}

async function publishContentRecordEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
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
  const definition = typeDefinition('article')
  const validStates = new Set(definition.workflow?.states.map(state => state.id) || [])
  const migrated = []
  for (const article of legacy) {
    const { revisions, ...record } = article
    const fields = normalisedFields('article', record, record)
    if (definition.workflow && !validStates.has(fields[definition.workflow.field])) fields[definition.workflow.field] = definition.workflow.initialState
    const normalised = {
      id: article.id || crypto.randomUUID(), type: 'article', websiteId, ...fields,
      createdAt: article.createdAt || new Date().toISOString(), updatedAt: article.updatedAt || new Date().toISOString(),
    }
    migrated.push(normalised)
    await importContentRevisions(websiteId, 'article', normalised.id, revisions)
  }
  await writeJson(target, migrated)
  for (const record of migrated) await indexContentRecord(websiteId, 'article', record)
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
  return validateContentRelationships(typeId, fields, (targetType, targetId) => resolveStoredRecord(websiteId, targetType, targetId))
}

async function hydrateRecord(websiteId, typeId, record, actor = null) {
  const definition = typeDefinition(typeId)
  const revisions = await listContentRevisions(websiteId, typeId, record.id)
  const hydrated = { ...record, revisions: revisions.map(revision => ({ id: revision.id, createdAt: revision.createdAt, ...revision.snapshot })) }
  if (definition.workflow) {
    hydrated.workflow = {
      state: record[definition.workflow.field] || definition.workflow.initialState,
      availableTransitions: actor ? listAvailableWorkflowTransitions(typeId, record, actor) : [],
      history: await listWorkflowHistory(websiteId, typeId, record.id),
    }
  }
  if (!getRelationshipFields(typeId).length) return hydrated
  const relationships = await resolveContentRelationships(typeId, record, (targetType, targetId) => resolveStoredRecord(websiteId, targetType, targetId))
  const hasReferences = Object.values(relationships).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value))
  return hasReferences ? { ...hydrated, relationships } : hydrated
}

export async function listContentRecords(websiteValue, typeValue, actor = null) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const records = await getStoredRecords(websiteId, typeId)
  const hydrated = await Promise.all(records.map(record => hydrateRecord(websiteId, typeId, record, actor)))
  return hydrated.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
}

export async function getContentRecord(websiteValue, typeValue, recordId, actor = null) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const id = identity(recordId, 'Content record id')
  const records = await getStoredRecords(websiteId, typeId)
  const record = records.find(item => item.id === recordId || safeName(item.id) === id)
  if (!record) throw new ContentRecordError('Content record not found', 404)
  return hydrateRecord(websiteId, typeId, record, actor)
}

export async function createContentRecord(websiteValue, typeValue, input = {}, actor = null) {
  const websiteId = identity(websiteValue, 'Website id')
  const definition = typeDefinition(typeValue)
  const typeId = definition.id
  const timestamp = new Date().toISOString()
  const fields = initialWorkflowFields(definition, normalisedFields(typeId, workflowProtectedInput(definition, input)))
  await validateRelationships(websiteId, typeId, fields)
  const record = { id: input.id || crypto.randomUUID(), type: typeId, websiteId, ...fields, createdAt: input.createdAt || timestamp, updatedAt: timestamp }
  const records = await getStoredRecords(websiteId, typeId)
  await writeJson(recordsPath(websiteId, typeId), [record, ...records])
  await indexContentRecord(websiteId, typeId, record)
  await publishContentRecordEvent('content-record.created', contentRecordEventPayload(definition, record))
  return hydrateRecord(websiteId, typeId, record, actor)
}

export async function updateContentRecord(websiteValue, typeValue, recordId, input = {}, actor = null) {
  const websiteId = identity(websiteValue, 'Website id')
  const definition = typeDefinition(typeValue)
  const typeId = definition.id
  const records = await getStoredRecords(websiteId, typeId)
  const index = records.findIndex(record => record.id === recordId)
  if (index < 0) throw new ContentRecordError('Content record not found', 404)
  const existing = records[index]
  const fields = normalisedFields(typeId, workflowProtectedInput(definition, input), existing)
  await validateRelationships(websiteId, typeId, fields)
  const proposed = { ...existing, ...fields, id: existing.id, type: typeId, websiteId, createdAt: existing.createdAt }
  if (!contentRecordStateChanged(existing, proposed)) return hydrateRecord(websiteId, typeId, existing, actor)
  const updated = { ...proposed, updatedAt: new Date().toISOString() }
  await saveContentRevision(websiteId, typeId, existing)
  records[index] = updated
  await writeJson(recordsPath(websiteId, typeId), records)
  await indexContentRecord(websiteId, typeId, updated)
  await publishContentRecordEvent('content-record.updated', contentRecordEventPayload(definition, updated, {
    revisionCreated: true,
  }))
  return hydrateRecord(websiteId, typeId, updated, actor)
}

export async function transitionContentRecord(websiteValue, typeValue, recordId, transitionId, actor = {}, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const definition = typeDefinition(typeValue)
  const typeId = definition.id
  const records = await getStoredRecords(websiteId, typeId)
  const index = records.findIndex(record => record.id === recordId)
  if (index < 0) throw new ContentRecordError('Content record not found', 404)
  const existing = records[index]
  const transition = applyWorkflowTransition(typeId, existing, transitionId, actor, input)
  const updated = { ...transition.record, id: existing.id, type: typeId, websiteId, createdAt: existing.createdAt, updatedAt: transition.event.createdAt }
  await saveContentRevision(websiteId, typeId, existing)
  records[index] = updated
  await writeJson(recordsPath(websiteId, typeId), records)
  await appendWorkflowHistory(websiteId, typeId, recordId, transition.event)
  await indexContentRecord(websiteId, typeId, updated)
  await publishContentRecordEvent('content-record.workflow-transitioned', contentRecordEventPayload(definition, updated, {
    stateChanged: definition.workflow
      ? existing[definition.workflow.field] !== updated[definition.workflow.field]
      : false,
    scheduledPublication: transitionId === 'schedule-publication',
    automaticPublication: transitionId === 'publish-scheduled',
  }))
  return hydrateRecord(websiteId, typeId, updated, actor)
}

export async function restoreContentRecord(websiteValue, typeValue, recordId, revisionId, actor = null) {
  const websiteId = identity(websiteValue, 'Website id')
  const definition = typeDefinition(typeValue)
  const typeId = definition.id
  const revision = await getContentRevision(websiteId, typeId, recordId, revisionId)
  if (!revision) throw new ContentRecordError('Revision not found', 404)
  const restored = await updateContentRecord(websiteId, typeId, recordId, revision.snapshot, actor)
  await publishContentRecordEvent('content-record.revision-restored', contentRecordEventPayload(definition, restored, {
    revisionCreated: true,
  }))
  return restored
}

export async function processScheduledContentRecords(websiteValue, now = new Date()) {
  const websiteId = identity(websiteValue, 'Website id')
  const actor = { id: 'system', name: 'Scheduled publication', role: 'owner' }
  const published = []
  for (const definition of listContentTypes().filter(item => item.workflow)) {
    const records = await getStoredRecords(websiteId, definition.id)
    for (const record of records) {
      if (!scheduledPublicationIsDue(definition.id, record, now)) continue
      published.push(await transitionContentRecord(websiteId, definition.id, record.id, 'publish-scheduled', actor, { note: 'Published automatically at the scheduled time' }))
    }
  }
  return published
}

export async function rebuildContentSearchIndexForWebsite(websiteValue) {
  const websiteId = identity(websiteValue, 'Website id')
  return rebuildContentSearchIndex(websiteId, typeId => getStoredRecords(websiteId, typeId))
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
      if (field) updated[field.id] = nullifyRelationshipValue(field, updated[field.id], targetTypeId, targetRecordId)
    }
    await saveContentRevision(websiteId, sourceType, existing)
    records[index] = updated
    await writeJson(recordsPath(websiteId, sourceType), records)
    await indexContentRecord(websiteId, sourceType, updated)
  }
}

export async function deleteContentRecord(websiteValue, typeValue, recordId) {
  const websiteId = identity(websiteValue, 'Website id')
  const definition = typeDefinition(typeValue)
  const typeId = definition.id
  const records = await getStoredRecords(websiteId, typeId)
  if (!records.some(record => record.id === recordId)) throw new ContentRecordError('Content record not found', 404)
  const incoming = await findIncomingContentRelationships(typeId, recordId, sourceType => getStoredRecords(websiteId, sourceType))
  const restricted = incoming.filter(relationship => relationship.onDelete === 'restrict')
  if (restricted.length) throw new ContentRelationshipError('Content record is still referenced', 409, restricted)
  await applyNullifyPolicies(websiteId, incoming, typeId, recordId)
  const next = records.filter(record => record.id !== recordId)
  await writeJson(recordsPath(websiteId, typeId), next)
  await removeContentSearchDocument(websiteId, typeId, recordId)
  await publishContentRecordEvent('content-record.deleted', {
    remainingRecordCount: next.length,
    nullifiedRelationshipCount: incoming.filter(relationship => relationship.onDelete === 'nullify').length,
    workflowEnabled: Boolean(definition.workflow),
  })
  return next
}
