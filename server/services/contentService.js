import { validateManagedPageBlocks } from '../../shared/componentRegistry.js'
import { getStarterSiteContent } from '../siteContentDefaults.js'
import { paths, readJson, safeName, writeJson } from '../storage.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'

export class ContentServiceError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'ContentServiceError'
    this.status = status
  }
}

function websiteId(value) {
  const id = safeName(value)
  if (!id) throw new ContentServiceError('Website id is required')
  return id
}

function contentDocument(value, label = 'Website content') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContentServiceError(`${label} must be an object`)
  }
  const document = structuredClone(value)
  const componentErrors = validateManagedPageBlocks(document)
  if (componentErrors.length) {
    throw new ContentServiceError(`Managed website sections are invalid: ${componentErrors.join('; ')}`)
  }
  return document
}

function contentState(document = {}) {
  const state = structuredClone(document)
  for (const field of ['createdAt', 'updatedAt', 'updatedBy', 'publishedAt', 'publishedBy', 'publishRequestId', 'initialPublication']) {
    delete state[field]
  }
  return state
}

function contentStateChanged(current, proposed) {
  return JSON.stringify(contentState(current)) !== JSON.stringify(contentState(proposed))
}

function contentEventPayload(document, details = {}) {
  const values = Object.values(document || {})
  return {
    topLevelFieldCount: Object.keys(document || {}).filter(key => !['createdAt', 'updatedAt', 'updatedBy', 'publishedAt', 'publishedBy', 'publishRequestId', 'initialPublication'].includes(key)).length,
    collectionCount: values.filter(Array.isArray).length,
    populatedCollectionCount: values.filter(value => Array.isArray(value) && value.length > 0).length,
    initialised: details.initialised === true,
    published: details.published === true,
    initialPublication: details.initialPublication === true,
  }
}

async function publishContentEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export async function getDraftContent(value) {
  const id = websiteId(value)
  const stored = await readJson(paths.content(id), null)
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored

  const starter = {
    ...contentDocument(getStarterSiteContent(id), 'Starter website content'),
    updatedAt: new Date().toISOString(),
  }
  await writeJson(paths.content(id), starter)
  await publishContentEvent('content.draft-initialised', contentEventPayload(starter, { initialised: true }))
  return starter
}

export async function saveDraftContent(value, input, metadata = {}) {
  const id = websiteId(value)
  const current = await getDraftContent(id)
  const supplied = contentDocument(input)
  if (!contentStateChanged(current, supplied)) return current
  const saved = {
    ...supplied,
    createdAt: supplied.createdAt || current.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: metadata.updatedBy || supplied.updatedBy || '',
  }
  await writeJson(paths.content(id), saved)
  await publishContentEvent('content.draft-saved', contentEventPayload(saved))
  return saved
}

export async function getPublishedContentRecord(value) {
  const id = websiteId(value)
  const published = await readJson(paths.publishedContent(id), null)
  if (published && typeof published === 'object' && !Array.isArray(published)) return published

  const draft = await getDraftContent(id)
  return publishContentSnapshot(id, draft, {
    publishedBy: 'KSJ Digital',
    initialPublication: true,
  })
}

export async function publishContentSnapshot(value, snapshot, metadata = {}) {
  const id = websiteId(value)
  const source = contentDocument(snapshot, 'Website approval snapshot')
  const published = {
    ...source,
    publishedAt: new Date().toISOString(),
    publishedBy: metadata.publishedBy || 'KSJ Digital',
    publishRequestId: metadata.publishRequestId || '',
    initialPublication: metadata.initialPublication === true,
  }
  await writeJson(paths.publishedContent(id), published)
  await publishContentEvent('content.snapshot-published', contentEventPayload(published, {
    published: true,
    initialPublication: published.initialPublication,
  }))
  return published
}

export async function publishDraftContent(value, metadata = {}) {
  const id = websiteId(value)
  const draft = await getDraftContent(id)
  return publishContentSnapshot(id, draft, metadata)
}
