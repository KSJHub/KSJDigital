import express from 'express'
import {
  deleteIntegration,
  getIntegrationRegistry,
  listIntegrationProviders,
  processIntegrationQueue,
  publishIntegrationEvent,
  retryIntegrationDelivery,
  searchIntegrationDeliveries,
  updateIntegrationSettings,
  upsertIntegration,
} from './services/integrationService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function requireEdit(req, res) {
  if (req.session?.role === 'owner' || req.session?.canEdit) return true
  res.status(403).json({ error: 'Edit permission required' })
  return false
}

function sendError(res, error) {
  const body = { error: error.message || 'Integration request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

function websiteFromRequest(req) {
  const moduleName = String(req.path || '').split('/').filter(Boolean)[0]
  if (['dynamic-content', 'asset-library', 'taxonomies', 'localisation', 'websites', 'integrations'].includes(moduleName)) {
    return req.body?.websiteId || req.query?.websiteId || String(req.path || '').split('/').filter(Boolean)[1] || null
  }
  return req.body?.websiteId || req.query?.websiteId || req.session?.websiteId || null
}

export function createIntegrationEventCaptureMiddleware() {
  return function integrationEventCapture(req, res, next) {
    if (req.method === 'GET' || req.originalUrl?.startsWith('/api/integrations')) return next()
    res.on('finish', () => {
      if (res.statusCode >= 400) return
      const websiteId = websiteFromRequest(req)
      if (!websiteId) return
      const segments = String(req.path || '').split('/').filter(Boolean)
      const category = segments[0] || 'api'
      publishIntegrationEvent(websiteId, `${category}.${req.method.toLowerCase()}`, {
        path: req.originalUrl,
        resourceId: segments.at(-1) || null,
        statusCode: res.statusCode,
      }, {
        actorId: req.session?.userId || null,
        actorEmail: req.session?.email || null,
      }).catch(error => console.error('Could not queue integration event', error))
    })
    next()
  }
}

export function createIntegrationRouter() {
  const router = express.Router()

  router.get('/providers', (_req, res) => res.json(listIntegrationProviders()))

  router.get('/:websiteId', async (req, res) => {
    try { res.json(await getIntegrationRegistry(req.params.websiteId)) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/subscriptions', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.status(201).json(await upsertIntegration(req.params.websiteId, req.body || {})) } catch (error) { sendError(res, error) }
  })

  router.patch('/:websiteId/subscriptions/:integrationId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await upsertIntegration(req.params.websiteId, { ...(req.body || {}), id: req.params.integrationId })) } catch (error) { sendError(res, error) }
  })

  router.delete('/:websiteId/subscriptions/:integrationId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await deleteIntegration(req.params.websiteId, req.params.integrationId)) } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/deliveries', async (req, res) => {
    try { res.json(await searchIntegrationDeliveries(req.params.websiteId, req.query)) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/deliveries/:deliveryId/retry', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await retryIntegrationDelivery(req.params.websiteId, req.params.deliveryId)) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/process', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await processIntegrationQueue(req.params.websiteId, req.body || {})) } catch (error) { sendError(res, error) }
  })

  router.patch('/:websiteId/settings', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await updateIntegrationSettings(req.params.websiteId, req.body || {})) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/events/:eventName', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.status(202).json(await publishIntegrationEvent(req.params.websiteId, req.params.eventName, req.body?.data ?? req.body ?? {}, {
        actorId: req.session?.userId || null,
        actorEmail: req.session?.email || null,
        manual: true,
      }))
    } catch (error) { sendError(res, error) }
  })

  return router
}
