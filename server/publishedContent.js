import { paths, readJson, writeJson } from './storage.js'
import { getStarterSiteContent } from './siteContentDefaults.js'

export async function getPublishedContent(websiteId) {
  const published = await readJson(paths.publishedContent(websiteId), null)
  if (published) return published

  const draft = await readJson(paths.content(websiteId), null)
  const initial = draft || getStarterSiteContent(websiteId)
  return writeJson(paths.publishedContent(websiteId), {
    ...initial,
    publishedAt: initial.publishedAt || initial.updatedAt || new Date().toISOString(),
  })
}

export async function publishContentSnapshot(websiteId, snapshot, metadata = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Website approval snapshot is invalid')
  }

  const published = {
    ...structuredClone(snapshot),
    publishedAt: new Date().toISOString(),
    publishedBy: metadata.publishedBy || 'KSJ Digital',
    publishRequestId: metadata.publishRequestId || '',
  }
  await writeJson(paths.publishedContent(websiteId), published)
  return published
}

export async function publishDraftContent(websiteId, metadata = {}) {
  const draft = await readJson(paths.content(websiteId), null)
  if (!draft) throw new Error('Website draft content was not found')
  return publishContentSnapshot(websiteId, draft, metadata)
}
