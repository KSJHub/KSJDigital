import express from 'express'
import { starterWebsites } from './defaults.js'
import { getPublishedContent, publishDraftContent } from './publishedContent.js'
import { paths, readJson, readWebsiteAssets, safeName, writeJson } from './storage.js'

const originalGet = express.application.get
const originalPost = express.application.post
const originalUse = express.application.use

function isPublicSiteRoute(path) {
  return path === '/api/public/sites/:websiteId'
}

function isApproveRoute(path) {
  return path === '/api/publish/requests/:id/approve'
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
    return res.json({
      website,
      content,
      assets,
      publishedAt: content.publishedAt || null,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Published website content unavailable' })
  }
}

async function approveRequestHandler(req, res) {
  try {
    if (req.session?.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' })
    }

    const requests = await readJson(paths.requests(), [])
    const request = requests.find(item => item.id === req.params.id)
    if (!request) return res.status(404).json({ error: 'Publish request not found' })
    if (request.status === 'Approved') {
      return res.status(409).json({ error: 'Publish request has already been approved' })
    }

    const published = await publishDraftContent(request.websiteId, {
      publishedBy: req.session.name,
      publishRequestId: request.id,
    })
    const reviewedAt = new Date().toISOString()
    const updatedRequest = {
      ...request,
      status: 'Approved',
      reviewedAt,
      publishedAt: published.publishedAt,
      publishedBy: req.session.name,
    }
    const updatedRequests = requests.map(item => item.id === request.id ? updatedRequest : item)
    await writeJson(paths.requests(), updatedRequests)

    const history = await readJson(paths.history(), [])
    await writeJson(paths.history(), [
      {
        id: crypto.randomUUID(),
        websiteId: request.websiteId,
        requestId: request.id,
        action: 'Published',
        createdAt: reviewedAt,
        publishedAt: published.publishedAt,
        createdBy: req.session.name,
      },
      ...history,
    ])

    return res.json(updatedRequest)
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to publish website draft' })
  }
}

express.application.get = function patchedGet(path, ...handlers) {
  if (isPublicSiteRoute(path)) return originalGet.call(this, path, publicSiteHandler)
  return originalGet.call(this, path, ...handlers)
}

express.application.post = function patchedPost(path, ...handlers) {
  if (isApproveRoute(path)) return originalPost.call(this, path, approveRequestHandler)
  return originalPost.call(this, path, ...handlers)
}

express.application.use = function patchedUse(path, ...handlers) {
  if (isPublicSiteRoute(path)) return originalUse.call(this, path, publicSiteHandler)
  return originalUse.call(this, path, ...handlers)
}
