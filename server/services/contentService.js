import { validateManagedPageBlocks } from '../../shared/componentRegistry.js'
import { getStarterSiteContent } from '../siteContentDefaults.js'
import { paths, readJson, safeName, writeJson } from '../storage.js'

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

export async function getDraftContent(value) {
  const id = websiteId(value)
  const stored = await readJson(paths.content(id), null)
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored

  const starter = {
    ...contentDocument(getStarterSiteContent(id), 'Starter website content'),
    updatedAt: new Date().toISOString(),
  }
  await writeJson(paths.content(id), starter)
  return starter
}

export async function saveDraftContent(value, input, metadata = {}) {
  const id = websiteId(value)
  const current = await getDraftContent(id)
  const supplied = contentDocument(input)
  const saved = {
    ...supplied,
    createdAt: supplied.createdAt || current.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: metadata.updatedBy || supplied.updatedBy || '',
  }
  await writeJson(paths.content(id), saved)
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
  return published
}

export async function publishDraftContent(value, metadata = {}) {
  const id = websiteId(value)
  const draft = await getDraftContent(id)
  return publishContentSnapshot(id, draft, metadata)
}
