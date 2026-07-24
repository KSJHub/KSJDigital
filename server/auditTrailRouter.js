import express from 'express'
import {
  appendAuditEvent,
  auditRequestContext,
  exportAuditEvents,
  getAuditConfig,
  pruneAuditEvents,
  searchAuditEvents,
  updateAuditConfig,
} from './services/auditTrailService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function sendError(res, error) {
  const response = { error: error.message || 'Audit trail request failed' }
  if (error.details) response.details = error.details
  res.status(Number(error.status) || 400).json(response)
}

function websiteFromRequest(req) {
  return req.params?.websiteId || req.body?.websiteId || req.query?.websiteId || 'global'
}

export function createAuditCaptureMiddleware() {
  return function auditCapture(req, res, next) {
    if (req.method === 'GET' || req.originalUrl?.startsWith('/api/audit')) return next()
    const startedAt = Date.now()
    res.on('finish', () => {
      const segments = String(req.path || '').split('/').filter(Boolean)
      const websiteId = websiteFromRequest(req) || segments[1] || 'global'
      appendAuditEvent({
        websiteId,
        category: segments[0] || 'api',
        action: `${req.method.toLowerCase()}:${req.route?.path || req.path || '/'}`,
        outcome: res.statusCode < 400 ? 'success' : 'failure',
        actor: {
          id: req.session?.userId || null,
          email: req.session?.email || null,
          name: req.session?.displayName || req.session?.name || null,
          role: req.session?.role || null,
        },
        request: auditRequestContext(req),
        resource: { type: segments[0] || 'api', id: segments.at(-1) || null },
        changes: req.body || null,
        metadata: { statusCode: res.statusCode, durationMs: Date.now() - startedAt },
      }).catch(error => console.error('Could not append audit event', error))
    })
    next()
  }
}

export function createAuditTrailRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    try {
      res.json(await searchAuditEvents(req.params.websiteId, req.query))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/config', async (req, res) => {
    try {
      res.json(await getAuditConfig(req.params.websiteId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/config', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      res.json(await updateAuditConfig(req.params.websiteId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/prune', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      res.json(await pruneAuditEvents(req.params.websiteId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/export', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const exported = await exportAuditEvents(req.params.websiteId, req.query)
      res.setHeader('Content-Type', exported.contentType)
      res.setHeader('Content-Disposition', `attachment; filename="audit-${req.params.websiteId}.${exported.format}"`)
      res.send(exported.data)
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
