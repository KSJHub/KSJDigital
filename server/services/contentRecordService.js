import crypto from 'node:crypto'
import path from 'node:path'
import {
  getContentType,
  normaliseContentFields,
  validateContentFields,
} from './contentTypeRegistry.js'
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

async function hydrateRevisions(websiteId, typeId, record) {
  const revisions = await listContentRevisions(websiteId, typeId, record.id)
  return {
    ...record,
    revisions: revisions.map(revision => ({ id: revision.id, createdAt: revision.createdAt, ...revision.snapshot })),
  }
}

export async function listContentRecords(websiteValue, typeValue) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const records = await getStoredRecords(websiteId, typeId)
  const hydrated = await Promise.all(records.map(record => hydrateRevisions(websiteId, typeId, record)))
  return hydrated.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
}

export async function getContentRecord(websiteValue, typeValue, recordId) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const id = identity(recordId, 'Content record id')
  const records = await getStoredRecords(websiteId, typeId)
  const record = records.find(item => item.id === recordId || safeName(item.id) === id)
  if (!record) throw new ContentRecordError('Content record not found', 404)
  return hydrateRevisions(websiteId, typeId, record)
}

export async function createContentRecord(websiteValue, typeValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const timestamp = new Date().toISOString()
  const record = {
    id: input.id || crypto.randomUUID(),
    type: typeId,
    websiteId,
    ...normalisedFields(typeId, input),
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  }
  const records = await getStoredRecords(websiteId, typeId)
  await writeJson(recordsPath(websiteId, typeId), [record, ...records])
  return hydrateRevisions(websiteId, typeId, record)
}

export async function updateContentRecord(websiteValue, typeValue, recordId, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const records = await getStoredRecords(websiteId, typeId)
  const index = records.findIndex(record => record.id === recordId)
  if (index < 0) throw new ContentRecordError('Content record not found', 404)

  const existing = records[index]
  const updated = {
    ...existing,
    ...normalisedFields(typeId, input, existing),
    id: existing.id,
    type: typeId,
    websiteId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  }
  await saveContentRevision(websiteId, typeId, existing)
  const next = records.map((record, recordIndex) => recordIndex === index ? updated : record)
  await writeJson(recordsPath(websiteId, typeId), next)
  return hydrateRevisions(websiteId, typeId, updated)
}

export async function restoreContentRecord(websiteValue, typeValue, recordId, revisionId) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const revision = await getContentRevision(websiteId, typeId, recordId, revisionId)
  if (!revision) throw new ContentRecordError('Revision not found', 404)
  return updateContentRecord(websiteId, typeId, recordId, { ...revision.snapshot, status: 'Draft' })
}

export async function deleteContentRecord(websiteValue, typeValue, recordId) {
  const websiteId = identity(websiteValue, 'Website id')
  const typeId = typeDefinition(typeValue).id
  const records = await getStoredRecords(websiteId, typeId)
  if (!records.some(record => record.id === recordId)) throw new ContentRecordError('Content record not found', 404)
  const next = records.filter(record => record.id !== recordId)
  await writeJson(recordsPath(websiteId, typeId), next)
  return next
}