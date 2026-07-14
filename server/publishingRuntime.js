import express from 'express'
import { starterWebsites } from './defaults.js'
import { getPublishedContent, publishContentSnapshot } from './publishedContent.js'
import { paths, readJson, readWebsiteAssets, safeName, writeJson } from './storage.js'

const originalGet = express.application.get
const originalPost = express.application.post
const originalUse = express.application.use

function isPublicSiteRoute(path) { return path === '/api/public/sites/:websiteId' }
function isRequestListRoute(path) { return path === '/api/publish/requests' }
function isCreateRequestRoute(path) { return path === '/api/publish/requests' }
function isReviewRoute(path) { return path === '/api/publish/requests/:id/review' }
function isApproveRoute(path) { return path === '/api/publish/requests/:id/approve' }

function sessionWebsiteIds(session) {
  if (session?.role === 'owner') return null
  return session?.websiteIds || (session?.websiteId ? [session.websiteId] : [])
}

function hasWebsiteAccess(session, websiteId) {
  if (session?.role === 'owner') return true
  return new Set(sessionWebsiteIds(session) || []).has(websiteId)
}

function withoutSnapshot(request) {
  const { draftSnapshot, ...safeRequest } = request
  return safeRequest
}

function safePreviewValue(value) {
  if (value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  return value
}

function sameValue(left, right) { return JSON.stringify(left) === JSON.stringify(right) }

function buildDiff(before, after, path = '') {
  if (sameValue(before, after)) return []
  const beforeObject = before && typeof before === 'object'
  const afterObject = after && typeof after === 'object'
  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
    return [{ path: path || 'content', before: safePreviewValue(before), after: safePreviewValue(after) }]
  }
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  return [...keys].flatMap(key => {
    if (['updatedAt', 'publishedAt', 'publishedBy', 'publishRequestId'].includes(key)) return []
    const nextPath = path ? `${path}.${key}` : key
    return buildDiff(before?.[key], after?.[key], nextPath)
  })
}

function summariseDiff(changes = []) {
  const groups = {}
  changes.forEach(change => {
    const group = change.path.split('.')[0] || 'content'
    groups[group] = (groups[group] || 0) + 1
  })
  return Object.entries(groups).map(([section, count]) => ({ section, count }))
}

function nextVersion(history, websiteId) {
  const versions = history
    .filter(item => item.websiteId === websiteId)
    .map(item => Number(String(item.version || '').replace(/^v/i, '')))
    .filter(Number.isFinite)
  return `v${(versions.length ? Math.max(...versions) : 0) + 1}`
}

async function publicSiteHandler(req, res) {
  try {
    const websiteId = safeName(req.params.websiteId)
    const websites = await readJson(paths.websites(), starterWebsites)
    const website = websites.find(site => safeName(site.id) === websiteId)
    if (!website) return res.status(404).json({ error: 'Website not found' })
    const content = await getPublishedContent(websiteId)
    const assets = await readWebsiteAssets(websiteId)
    res.setHeader('Cache-Control', 'no-store')
    return res.json({ website, content, assets, publishedAt: content.publishedAt || null })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Published website content unavailable' })
  }
}

async function listRequestsHandler(req, res) {
  try {
    const requests = await readJson(paths.requests(), [])
    const visible = req.session?.role === 'owner' ? requests : requests.filter(request => hasWebsiteAccess(req.session, request.websiteId))
    return res.json(visible.map(withoutSnapshot))
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to load publish requests' })
  }
}

async function createRequestHandler(req, res) {
  try {
    if (req.session?.role !== 'owner' && !req.session?.canRequestUpdates) return res.status(403).json({ error: 'Publish request permission required' })
    const websiteId = safeName(req.body?.websiteId || req.session?.websiteId)
    if (!websiteId || !hasWebsiteAccess(req.session, websiteId)) return res.status(403).json({ error: 'Website access denied' })
    const draft = await readJson(paths.content(websiteId), null)
    if (!draft) return res.status(404).json({ error: 'Website draft content was not found' })
    const published = await getPublishedContent(websiteId)
    const requests = await readJson(paths.requests(), [])
    const existing = requests.find(request => request.websiteId === websiteId && request.status === 'Waiting Review' && sameValue(request.draftSnapshot, draft))
    if (existing) return res.json({ ...withoutSnapshot(existing), duplicate: true, message: 'This exact draft is already waiting for review.' })
    const request = {
      id: crypto.randomUUID(),
      status: 'Waiting Review',
      createdAt: new Date().toISOString(),
      ...req.body,
      websiteId,
      createdBy: req.session?.name || req.body?.createdBy || 'Client',
      draftSnapshot: structuredClone(draft),
      baselinePublishedAt: published.publishedAt || null,
      snapshotUpdatedAt: draft.updatedAt || null,
    }
    await writeJson(paths.requests(), [request, ...requests])
    return res.json(withoutSnapshot(request))
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to create publish request' })
  }
}

async function reviewRequestHandler(req, res) {
  try {
    if (req.session?.role !== 'owner') return res.status(403).json({ error: 'Owner access required' })
    const requests = await readJson(paths.requests(), [])
    const request = requests.find(item => item.id === req.params.id)
    if (!request) return res.status(404).json({ error: 'Publish request not found' })
    const published = await getPublishedContent(request.websiteId)
    const draft = request.draftSnapshot
    if (!draft) return res.status(409).json({ error: 'This legacy request has no recoverable frozen snapshot. Restart the API to run approval recovery.' })
    const changes = buildDiff(published, draft)
    return res.json({
      request: withoutSnapshot(request),
      published,
      draft,
      changes,
      summary: summariseDiff(changes),
      warning: request.snapshotRecoveryWarning || '',
      totals: {
        changedFields: changes.length,
        changedSections: new Set(changes.map(change => change.path.split('.')[0])).size,
      },
    })
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to review website changes' })
  }
}

async function approveRequestHandler(req, res) {
  try {
    if (req.session?.role !== 'owner') return res.status(403).json({ error: 'Owner access required' })
    const requests = await readJson(paths.requests(), [])
    const request = requests.find(item => item.id === req.params.id)
    if (!request) return res.status(404).json({ error: 'Publish request not found' })
    if (request.status === 'Approved') return res.status(409).json({ error: 'Publish request has already been approved' })
    if (request.status === 'Rejected') return res.status(409).json({ error: 'Rejected requests cannot be approved' })
    const snapshot = request.draftSnapshot
    if (!snapshot) return res.status(404).json({ error: 'Submitted draft snapshot was not found' })
    const history = await readJson(paths.history(), [])
    const currentPublished = await getPublishedContent(request.websiteId)
    const changedFields = buildDiff(currentPublished, snapshot).length
    const version = nextVersion(history, request.websiteId)
    const published = await publishContentSnapshot(request.websiteId, snapshot, { publishedBy: req.session.name, publishRequestId: request.id })
    const reviewedAt = new Date().toISOString()
    const updatedRequest = { ...request, status: 'Approved', reviewedAt, publishedAt: published.publishedAt, publishedBy: req.session.name, version }
    await writeJson(paths.requests(), requests.map(item => item.id === request.id ? updatedRequest : item))
    await writeJson(paths.history(), [{
      id: crypto.randomUUID(),
      websiteId: request.websiteId,
      websiteName: request.websiteName || request.websiteId,
      requestId: request.id,
      action: 'Published',
      status: 'Published',
      version,
      title: request.title || 'Website update',
      createdAt: reviewedAt,
      publishedAt: published.publishedAt,
      createdBy: req.session.name,
      submittedBy: request.createdBy || 'Client',
      changedFields,
    }, ...history])
    return res.json(withoutSnapshot(updatedRequest))
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to publish website snapshot' })
  }
}

express.application.get = function patchedGet(path, ...handlers) {
  if (isPublicSiteRoute(path)) return originalGet.call(this, path, publicSiteHandler)
  if (isRequestListRoute(path)) return originalGet.call(this, path, listRequestsHandler)
  if (isReviewRoute(path)) return originalGet.call(this, path, reviewRequestHandler)
  return originalGet.call(this, path, ...handlers)
}

express.application.post = function patchedPost(path, ...handlers) {
  if (isCreateRequestRoute(path)) return originalPost.call(this, path, createRequestHandler)
  if (isApproveRoute(path)) return originalPost.call(this, path, approveRequestHandler)
  return originalPost.call(this, path, ...handlers)
}

express.application.use = function patchedUse(path, ...handlers) {
  if (isPublicSiteRoute(path)) return originalUse.call(this, path, publicSiteHandler)
  return originalUse.call(this, path, ...handlers)
}
