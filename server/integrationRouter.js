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
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function requireWebsiteAccess(req, res, websiteId) {
  if (req.session?.role === 'owner') return true
  const assigned = new Set(req.session?.websiteIds || (req.session?.websiteId ? [req.session.websiteId] : []))
  if (assigned.has(websiteId)) return true
  res.status(403).json({ error: 'Website access denied' })
  return false
}

function requireEdit(req, res) {
  if (req.session?.role === 'owner' || req.session?.canEdit) return true
  res.status(403).json({ error: 'Edit permission required' })
  return false
}

function actor(req) {
  return {
    id: req.session?.userId || null,
    email: req.session?.email || null,
  }
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
    if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
    try {
      res.json(await getIntegrationRegistry(req.params.websiteId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/subscriptions', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const requestedBy = actor(req)
      const integration = await upsertIntegration(req.params.websiteId, req.body || {})
      await publishDomainEvent('integration.subscription-created', {
        websiteId: req.params.websiteId,
        integrationId: integration.id,
        provider: integration.provider,
        enabled: integration.enabled,
        events: integration.events,
      }, requestedBy)
      res.status(201).json(integration)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/subscriptions/:integrationId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const requestedBy = actor(req)
      const integration = await upsertIntegration(req.params.websiteId, { ...(req.body || {}), id: req.params.integrationId })
      await publishDomainEvent('integration.subscription-updated', {
        websiteId: req.params.websiteId,
        integrationId: integration.id,
        provider: integration.provider,
        enabled: integration.enabled,
        events: integration.events,
      }, requestedBy)
      res.json(integration)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/subscriptions/:integrationId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const requestedBy = actor(req)
      const result = await deleteIntegration(req.params.websiteId, req.params.integrationId)
      await publishDomainEvent('integration.subscription-deleted', {
        websiteId: req.params.websiteId,
        integrationId: req.params.integrationId,
        deleted: result.deleted === true,
      }, requestedBy)
      res.json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/deliveries', async (req, res) => {
    if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
    try {
      res.json(await searchIntegrationDeliveries(req.params.websiteId, req.query))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/deliveries/:deliveryId/retry', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const requestedBy = actor(req)
      const delivery = await retryIntegrationDelivery(req.params.websiteId, req.params.deliveryId)
      await publishDomainEvent('integration.delivery-retried', {
        websiteId: req.params.websiteId,
        integrationId: delivery.integrationId,
        deliveryId: delivery.id,
        eventName: delivery.eventName,
        status: delivery.status,
      }, requestedBy)
      res.json(delivery)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/process', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const requestedBy = actor(req)
      const result = await processIntegrationQueue(req.params.websiteId, req.body || {})
      await publishDomainEvent('integration.queue-processed', {
        websiteId: req.params.websiteId,
        processed: result.processed,
        deliveredCount: result.results.filter(item => item.status === 'delivered').length,
        retryingCount: result.results.filter(item => item.status === 'retrying').length,
        failedCount: result.results.filter(item => item.status === 'failed').length,
        cancelledCount: result.results.filter(item => item.status === 'cancelled').length,
        deliveryIds: result.results.map(item => item.id),
      }, requestedBy)
      res.json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/settings', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const requestedBy = actor(req)
      const settings = await updateIntegrationSettings(req.params.websiteId, req.body || {})
      await publishDomainEvent('integration.settings-updated', {
        websiteId: req.params.websiteId,
        enabled: settings.enabled,
        workerIntervalMs: settings.workerIntervalMs,
        deliveryRetentionDays: settings.deliveryRetentionDays,
      }, requestedBy)
      res.json(settings)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/events/:eventName', async (req, res) => {
    if (!requireWebsiteAccess(req, res, req.params.websiteId) || !requireEdit(req, res)) return
    try {
      const requestedBy = actor(req)
      const result = await publishIntegrationEvent(req.params.websiteId, req.params.eventName, req.body?.data ?? req.body ?? {}, {
        actorId: requestedBy.id,
        actorEmail: requestedBy.email,
        manual: true,
      })
      await publishDomainEvent('integration.event-published', {
        websiteId: req.params.websiteId,
        eventName: req.params.eventName,
        queued: result.queued,
        deliveryIds: result.deliveryIds,
      }, requestedBy)
      res.status(202).json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
