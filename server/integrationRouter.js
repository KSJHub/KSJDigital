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

function integrationRegistryPayload(registry = {}, integration = {}, details = {}) {
  const subscriptions = Array.isArray(registry.subscriptions) ? registry.subscriptions : []
  const deliveries = Array.isArray(registry.deliveries) ? registry.deliveries : []
  return {
    subscriptionCount: subscriptions.length,
    enabledSubscriptionCount: subscriptions.filter(item => item.enabled !== false).length,
    deliveryCount: deliveries.length,
    enabled: integration.enabled !== false,
    eventSubscriptionCount: Array.isArray(integration.events) ? integration.events.length : 0,
    hasCustomHeaders: integration.headers && Object.keys(integration.headers).length > 0,
    deleted: details.deleted === true,
  }
}

function deliveryEventPayload(delivery = {}) {
  return {
    status: ['pending', 'processing', 'retrying', 'delivered', 'failed', 'cancelled'].includes(delivery.status) ? delivery.status : 'pending',
    attemptCount: Number(delivery.attempts) || 0,
    hasError: Boolean(delivery.lastError),
    delivered: delivery.status === 'delivered',
  }
}

function queueEventPayload(result = {}) {
  const results = Array.isArray(result.results) ? result.results : []
  return {
    processedCount: Number(result.processed) || 0,
    deliveredCount: results.filter(item => item.status === 'delivered').length,
    retryingCount: results.filter(item => item.status === 'retrying').length,
    failedCount: results.filter(item => item.status === 'failed').length,
    cancelledCount: results.filter(item => item.status === 'cancelled').length,
  }
}

function settingsEventPayload(settings = {}) {
  return {
    enabled: settings.enabled !== false,
    workerIntervalMs: Number(settings.workerIntervalMs) || 0,
    deliveryRetentionDays: Number(settings.deliveryRetentionDays) || 0,
  }
}

function eventPublicationPayload(result = {}) {
  return { queuedCount: Number(result.queued) || 0 }
}

async function publishIntegrationRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function arrayState(value) {
  return JSON.stringify(Array.isArray(value) ? value : [])
}

function subscriptionPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name || '').trim() !== String(existing.name || '').trim()) return true
  if (Object.hasOwn(input, 'provider') && String(input.provider || 'webhook') !== String(existing.provider || 'webhook')) return true
  if (Object.hasOwn(input, 'url') && String(input.url || '').trim() !== String(existing.url || '').trim()) return true
  if (Object.hasOwn(input, 'events') && arrayState([...new Set((Array.isArray(input.events) ? input.events : []).map(item => String(item).trim()).filter(Boolean))]) !== arrayState(existing.events)) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'maxAttempts') && Number(input.maxAttempts) !== Number(existing.maxAttempts)) return true
  if (Object.hasOwn(input, 'timeoutMs') && Number(input.timeoutMs) !== Number(existing.timeoutMs)) return true
  if (Object.hasOwn(input, 'secret') || Object.hasOwn(input, 'headers')) return true
  return false
}

function settingsPatchChanges(existing = {}, input = {}) {
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'workerIntervalMs') && Math.min(300000, Math.max(5000, Number(input.workerIntervalMs))) !== Number(existing.workerIntervalMs)) return true
  if (Object.hasOwn(input, 'deliveryRetentionDays') && Math.min(3650, Math.max(1, Number(input.deliveryRetentionDays))) !== Number(existing.deliveryRetentionDays)) return true
  return false
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
      const integration = await upsertIntegration(req.params.websiteId, req.body || {})
      const registry = await getIntegrationRegistry(req.params.websiteId)
      await publishIntegrationRealtimeEvent('integration.subscription-created', integrationRegistryPayload(registry, integration))
      res.status(201).json(integration)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/subscriptions/:integrationId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const input = req.body || {}
      const registry = await getIntegrationRegistry(req.params.websiteId)
      const existing = registry.subscriptions.find(item => item.id === req.params.integrationId)
      if (!existing) return res.status(404).json({ error: 'Integration not found' })
      if (!subscriptionPatchChanges(existing, input)) return res.json(existing)
      const integration = await upsertIntegration(req.params.websiteId, { ...input, id: req.params.integrationId })
      const updatedRegistry = await getIntegrationRegistry(req.params.websiteId)
      await publishIntegrationRealtimeEvent('integration.subscription-updated', integrationRegistryPayload(updatedRegistry, integration))
      res.json(integration)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/subscriptions/:integrationId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const result = await deleteIntegration(req.params.websiteId, req.params.integrationId)
      const registry = await getIntegrationRegistry(req.params.websiteId)
      await publishIntegrationRealtimeEvent('integration.subscription-deleted', integrationRegistryPayload(registry, {}, result))
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
      const delivery = await retryIntegrationDelivery(req.params.websiteId, req.params.deliveryId)
      await publishIntegrationRealtimeEvent('integration.delivery-retried', deliveryEventPayload(delivery))
      res.json(delivery)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/process', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const result = await processIntegrationQueue(req.params.websiteId, req.body || {})
      if (result.processed > 0) await publishIntegrationRealtimeEvent('integration.queue-processed', queueEventPayload(result))
      res.json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/settings', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const input = req.body || {}
      const registry = await getIntegrationRegistry(req.params.websiteId)
      if (!settingsPatchChanges(registry.settings, input)) return res.json(registry.settings)
      const settings = await updateIntegrationSettings(req.params.websiteId, input)
      await publishIntegrationRealtimeEvent('integration.settings-updated', settingsEventPayload(settings))
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
      if (result.queued > 0) await publishIntegrationRealtimeEvent('integration.event-published', eventPublicationPayload(result))
      res.status(202).json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
