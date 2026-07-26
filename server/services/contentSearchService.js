import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { getContentType, listContentTypes } from './contentTypeRegistry.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'

const MAX_RESULTS = 100
const indexMutations = new Map()

export class ContentSearchError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'ContentSearchError'
    this.status = status
    this.details = details
  }
}

function searchPath(websiteId) {
  return path.join(DATA_DIR, 'content-search', `${safeName(websiteId)}.json`)
}

function textValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(' ')
  if (typeof value === 'object') return Object.values(value).map(textValue).filter(Boolean).join(' ')
  return ''
}

function tokens(value) {
  return textValue(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
}

function normaliseFilterValue(value) {
  if (Array.isArray(value)) return value.map(item => String(item).toLowerCase())
  if (value === null || value === undefined) return null
  return String(value).toLowerCase()
}

function actorCanSeeUnpublished(actor) {
  return actor?.role === 'owner' || actor?.canEdit === true || actor?.canApprove === true
}

function mutationKey(websiteId) {
  return safeName(websiteId)
}

async function mutateIndex(websiteId, mutation) {
  const key = mutationKey(websiteId)
  const previous = indexMutations.get(key) || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const documents = await readContentSearchIndex(websiteId)
    const next = await mutation(documents)
    await writeJson(searchPath(websiteId), next)
    return next
  })
  indexMutations.set(key, current)
  try {
    return await current
  } finally {
    if (indexMutations.get(key) === current) indexMutations.delete(key)
  }
}

function searchDocumentEventPayload(document = {}, documentCount = 0, details = {}) {
  return {
    documentCount,
    published: document.published === true,
    weightedFieldCount: Array.isArray(document.weighted) ? document.weighted.length : 0,
    filterCount: document.filters && typeof document.filters === 'object' ? Object.keys(document.filters).length : 0,
    relationshipCount: Array.isArray(document.relationships) ? document.relationships.length : 0,
    ...details,
  }
}

async function publishContentSearchEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export function projectContentSearchDocument(websiteId, typeId, record) {
  const definition = getContentType(typeId)
  if (!definition?.search) return null
  const weighted = definition.search.fields.map(field => ({
    field: field.field,
    weight: field.weight,
    text: textValue(record[field.field]),
    tokens: tokens(record[field.field]),
  }))
  const filters = Object.fromEntries(definition.search.filters.map(field => [field, normaliseFilterValue(record[field])]))
  const workflowState = definition.workflow ? record[definition.workflow.field] || definition.workflow.initialState : null
  const relationships = definition.fields.filter(field => field.type === 'reference' || field.type === 'references').flatMap(field => {
    const value = record[field.id]
    const references = Array.isArray(value) ? value : value ? [value] : []
    return references.map(reference => ({ field: field.id, type: reference.type, id: reference.id }))
  })
  return {
    key: `${typeId}:${record.id}`,
    websiteId,
    type: typeId,
    id: record.id,
    title: definition.search.titleField ? textValue(record[definition.search.titleField]) : record.id,
    summary: definition.search.summaryField ? textValue(record[definition.search.summaryField]) : '',
    workflowState,
    published: workflowState ? workflowState === 'Published' : true,
    filters,
    weighted,
    relationships,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    publishedAt: record.publishedAt || null,
  }
}

export async function readContentSearchIndex(websiteId) {
  const documents = await readJson(searchPath(websiteId), [])
  if (!Array.isArray(documents)) throw new ContentSearchError('Stored content search index is invalid', 500)
  return documents
}

export async function indexContentRecord(websiteId, typeId, record) {
  const document = projectContentSearchDocument(websiteId, typeId, record)
  if (!document) return null
  const next = await mutateIndex(websiteId, documents => [document, ...documents.filter(item => item.key !== document.key)])
  await publishContentSearchEvent('content-search.document-indexed', searchDocumentEventPayload(document, next.length))
  return document
}

export async function removeContentSearchDocument(websiteId, typeId, recordId) {
  let removed = false
  const next = await mutateIndex(websiteId, documents => {
    const filtered = documents.filter(item => item.key !== `${typeId}:${recordId}`)
    removed = filtered.length !== documents.length
    return filtered
  })
  await publishContentSearchEvent('content-search.document-removed', {
    documentCount: next.length,
    removed,
  })
  return next
}

export async function rebuildContentSearchIndex(websiteId, loadRecords) {
  const documents = []
  let searchableTypeCount = 0
  let publishedDocumentCount = 0
  for (const definition of listContentTypes().filter(item => item.search)) {
    searchableTypeCount += 1
    const records = await loadRecords(definition.id)
    for (const record of records) {
      const document = projectContentSearchDocument(websiteId, definition.id, record)
      if (document) {
        documents.push(document)
        if (document.published) publishedDocumentCount += 1
      }
    }
  }
  await mutateIndex(websiteId, () => documents)
  await publishContentSearchEvent('content-search.index-rebuilt', {
    documentCount: documents.length,
    searchableTypeCount,
    publishedDocumentCount,
    unpublishedDocumentCount: documents.length - publishedDocumentCount,
  })
  return documents
}

function matchesFilter(document, field, expected) {
  const actual = document.filters?.[field]
  const values = Array.isArray(expected) ? expected : [expected]
  const wanted = values.map(value => String(value).toLowerCase())
  if (Array.isArray(actual)) return wanted.some(value => actual.includes(value))
  return wanted.includes(String(actual ?? '').toLowerCase())
}

function matchesRelationship(document, relationship) {
  if (!relationship?.id) return true
  return (document.relationships || []).some(reference => (
    reference.id === relationship.id
    && (!relationship.type || reference.type === relationship.type)
    && (!relationship.field || reference.field === relationship.field)
  ))
}

function scoreDocument(document, queryTokens) {
  if (!queryTokens.length) return 0
  let score = 0
  for (const field of document.weighted || []) {
    const fieldTokens = new Set(field.tokens || [])
    for (const queryToken of queryTokens) {
      if (fieldTokens.has(queryToken)) score += field.weight
      else if ((field.text || '').toLowerCase().includes(queryToken)) score += field.weight * 0.35
    }
  }
  return score
}

function validateSearchOptions(options) {
  const requestedTypes = Array.isArray(options.types) ? options.types : options.type ? [options.type] : []
  const definitions = requestedTypes.length
    ? requestedTypes.map(typeId => getContentType(typeId)).filter(Boolean)
    : listContentTypes().filter(definition => definition.search)
  const unknownTypes = requestedTypes.filter(typeId => !getContentType(typeId)?.search)
  if (unknownTypes.length) throw new ContentSearchError('Unknown or unsearchable content type', 422, { types: unknownTypes })
  const permittedFilters = new Set(definitions.flatMap(definition => definition.search?.filters || []))
  const invalidFilters = Object.keys(options.filters || {}).filter(field => !permittedFilters.has(field))
  if (invalidFilters.length) throw new ContentSearchError('Unsupported content search filter', 422, { filters: invalidFilters })
  return requestedTypes
}

export async function searchContent(websiteId, options = {}, actor = null) {
  const documents = await readContentSearchIndex(websiteId)
  const queryTokens = tokens(options.query || options.q || '')
  const types = validateSearchOptions(options)
  const filters = options.filters && typeof options.filters === 'object' ? options.filters : {}
  const relationship = options.relationship && typeof options.relationship === 'object' ? options.relationship : null
  const limit = Math.min(MAX_RESULTS, Math.max(1, Number(options.limit) || 20))
  const offset = Math.max(0, Number(options.offset) || 0)
  const allowUnpublished = actorCanSeeUnpublished(actor)

  let results = documents.filter(document => {
    if (!allowUnpublished && !document.published) return false
    if (types.length && !types.includes(document.type)) return false
    if (Object.entries(filters).some(([field, expected]) => !matchesFilter(document, field, expected))) return false
    if (!matchesRelationship(document, relationship)) return false
    return true
  }).map(document => ({ ...document, score: scoreDocument(document, queryTokens) }))

  if (queryTokens.length) results = results.filter(result => result.score > 0)
  const sort = String(options.sort || 'relevance')
  results.sort((left, right) => {
    if (sort === 'updated-desc') return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0) || left.key.localeCompare(right.key)
    if (sort === 'published-desc') return new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0) || left.key.localeCompare(right.key)
    if (sort === 'title-asc') return left.title.localeCompare(right.title) || left.key.localeCompare(right.key)
    return right.score - left.score || new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0) || left.key.localeCompare(right.key)
  })

  const total = results.length
  const page = results.slice(offset, offset + limit).map(({ weighted, key, ...result }) => result)
  return {
    query: options.query || options.q || '',
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
    results: page,
  }
}
