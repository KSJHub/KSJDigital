import crypto from 'node:crypto'
import express from 'express'
import { getPublishedContent, publishContentSnapshot } from './publishedContent.js'
import { paths, readJson, writeJson } from './storage.js'

const originalPost = express.application.post
const activeDecisions = new Set()

function isApproveRoute(path) {
  return path === '/api/publish/requests/:id/approve'
}

function isRejectRoute(path) {
  return path === '/api/publish/requests/:id/reject'
}

function withoutSnapshot(request) {
  const { draftSnapshot, ...safeRequest } = request
  return safeRequest
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function buildDiff(before, after, path = '') {
  if (sameValue(before, after)) return []
  const beforeObject = before && typeof before === 'object'
  const afterObject = after && typeof after === 'object'
  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
    return [{ path: path || 'content', before, after }]
  }

  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  return [...keys].flatMap(key => {
    if (['updatedAt', 'publishedAt', 'publishedBy', 'publishRequestId'].includes(key)) return []
    const nextPath = path ? `${path}.${key}` : key
    return buildDiff(before?.[key], after?.[key], nextPath)
  })
}

function nextVersion(history, websiteId) {
  const versions = history
    .filter(item => item.websiteId === websiteId)
    .map(item => Number(String(item.version || '').replace(/^v/i, '')))
    .filter(Number.isFinite)
  return `v${(versions.length ? Math.max(...versions) : 0) + 1}`
}

async function withDecisionLock(requestId, res, operation) {
  if (activeDecisions.has(requestId)) {
    return res.status(409).json({ error: 'This request is already being processed' })
  }

  activeDecisions.add(requestId)
  try {
    return await operation()
  } finally {
    activeDecisions.delete(requestId)
  }
}

async function approveRequestHandler(req, res) {
  if (req.session?.role !== 'owner') return res.status(403).json({ error: 'Owner access required' })

  return withDecisionLock(req.params.id, res, async () => {
    try {
      const requests = await readJson(paths.requests(), [])
      const request = requests.find(item => item.id === req.params.id)
      if (!request) return res.status(404).json({ error: 'Publish request not found' })
      if (request.status === 'Approved') return res.status(409).json({ error: 'Publish request has already been approved' })
      if (request.status === 'Rejected') return res.status(409).json({ error: 'Returned requests cannot be approved' })
      if (request.status !== 'Waiting Review') return res.status(409).json({ error: `Request cannot be approved while its status is ${request.status}` })

      const snapshot = request.draftSnapshot
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return res.status(409).json({ error: 'Submitted draft snapshot is missing or invalid' })
      }

      const history = await readJson(paths.history(), [])
      const currentPublished = await getPublishedContent(request.websiteId)
      const changedFields = buildDiff(currentPublished, snapshot).length
      if (!changedFields) return res.status(409).json({ error: 'This submitted snapshot already matches the live website' })

      const version = nextVersion(history, request.websiteId)
      const reviewedAt = new Date().toISOString()
      const publishedBy = req.session.name || 'KSJ Digital'
      const published = await publishContentSnapshot(request.websiteId, snapshot, {
        publishedBy,
        publishRequestId: request.id,
      })

      const historyEntry = {
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
        createdBy: publishedBy,
        submittedBy: request.createdBy || 'Client',
        changedFields,
        snapshot: structuredClone(published),
        previousSnapshot: structuredClone(currentPublished),
      }

      const updatedRequest = {
        ...request,
        status: 'Approved',
        reviewedAt,
        publishedAt: published.publishedAt,
        publishedBy,
        version,
      }

      await writeJson(paths.history(), [historyEntry, ...history])
      await writeJson(paths.requests(), requests.map(item => item.id === request.id ? updatedRequest : item))

      return res.json({
        ...withoutSnapshot(updatedRequest),
        version,
        message: `${version} published successfully`,
      })
    } catch (error) {
      console.error('[publishing] Approval failed:', error)
      return res.status(500).json({ error: error.message || 'Unable to publish website snapshot' })
    }
  })
}

async function rejectRequestHandler(req, res) {
  if (req.session?.role !== 'owner') return res.status(403).json({ error: 'Owner access required' })

  return withDecisionLock(req.params.id, res, async () => {
    try {
      const reason = String(req.body?.reason || '').trim()
      if (!reason) return res.status(400).json({ error: 'A reason is required when returning changes' })

      const requests = await readJson(paths.requests(), [])
      const request = requests.find(item => item.id === req.params.id)
      if (!request) return res.status(404).json({ error: 'Publish request not found' })
      if (request.status !== 'Waiting Review') return res.status(409).json({ error: `Request cannot be returned while its status is ${request.status}` })

      const reviewedAt = new Date().toISOString()
      const updatedRequest = {
        ...request,
        status: 'Rejected',
        reviewedAt,
        reviewedBy: req.session.name || 'KSJ Digital',
        rejectionReason: reason,
      }

      await writeJson(paths.requests(), requests.map(item => item.id === request.id ? updatedRequest : item))
      return res.json({ ...withoutSnapshot(updatedRequest), message: 'Changes returned to the client' })
    } catch (error) {
      console.error('[publishing] Rejection failed:', error)
      return res.status(500).json({ error: error.message || 'Unable to return website changes' })
    }
  })
}

express.application.post = function patchedPublishingDecisionPost(path, ...handlers) {
  if (isApproveRoute(path)) return originalPost.call(this, path, approveRequestHandler)
  if (isRejectRoute(path)) return originalPost.call(this, path, rejectRequestHandler)
  return originalPost.call(this, path, ...handlers)
}
