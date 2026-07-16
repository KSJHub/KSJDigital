import express from 'express'
import { COMPONENT_REGISTRY, validateComponentRegistry } from '../shared/componentRegistry.js'
import { ContentServiceError, getDraftContent, saveDraftContent } from './services/contentService.js'
import { safeName } from './storage.js'

function canAccessWebsite(session = {}, websiteId) {
  if (session.role === 'owner') return true
  const assigned = Array.isArray(session.websiteIds)
    ? session.websiteIds
    : session.websiteId
      ? [session.websiteId]
      : []
  return assigned.map(safeName).includes(safeName(websiteId))
}

function sendError(res, error) {
  const status = error instanceof ContentServiceError ? error.status : 500
  if (status >= 500) console.error('Content service request failed:', error)
  res.status(status).json({ error: error.message || 'Website content could not be processed' })
}

function serialisableComponents() {
  return COMPONENT_REGISTRY.map(definition => {
    const serialisable = { ...definition }
    delete serialisable.createDefaults
    return serialisable
  })
}

export function createContentRouter() {
  const router = express.Router()

  router.get('/components', (_req, res) => {
    const errors = validateComponentRegistry()
    if (errors.length) return res.status(500).json({ error: 'Managed website components are not configured correctly' })
    res.json(serialisableComponents())
  })

  router.get('/:websiteId', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) {
      return res.status(403).json({ error: 'Website access denied' })
    }

    try {
      res.json(await getDraftContent(req.params.websiteId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.put('/:websiteId', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) {
      return res.status(403).json({ error: 'Website access denied' })
    }
    if (req.session.role !== 'owner' && !req.session.canEdit) {
      return res.status(403).json({ error: 'Edit permission required' })
    }

    try {
      res.json(await saveDraftContent(req.params.websiteId, req.body, {
        updatedBy: req.session.displayName || req.session.name || '',
      }))
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
