import express from 'express'
import {
  deleteSubscription,
  getEventBusState,
  processEventDeliveries,
  publishEvent,
  replayDeadLetter,
  replayEvent,
  upsertSubscription,
} from './services/eventBusService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}
function publishEventBusEvent(topic, req, payload) {
  publishDomainEvent(topic, { actor: actor(req), payload })
}

export function createEventBusRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getEventBusState(req.query)))
  router.put('/subscriptions/:subscriptionId', (req, res, next) => handle(res, next, async () => {
    const result = await upsertSubscription({ ...req.body, id: req.params.subscriptionId }, actor(req))
    publishEventBusEvent('event-bus.subscription-updated', req, {
      subscriptionId: result.id,
      enabled: result.enabled,
      maximumAttempts: result.retry.maximumAttempts,
    })
    return result
  }))
  router.delete('/subscriptions/:subscriptionId', (req, res, next) => handle(res, next, async () => {
    const result = await deleteSubscription(req.params.subscriptionId, actor(req))
    publishEventBusEvent('event-bus.subscription-deleted', req, { subscriptionId: result.id, deleted: result.deleted })
    return result
  }))
  router.post('/publish', (req, res, next) => handle(res, next, () => publishEvent(req.body?.topic, req.body?.payload, { ...req.body?.options, source: 'administration' }), 201))
  router.post('/process', (req, res, next) => handle(res, next, () => processEventDeliveries(req.body || {})))
  router.post('/events/:eventId/replay', (req, res, next) => handle(res, next, async () => {
    const result = await replayEvent(req.params.eventId, actor(req))
    publishEventBusEvent('event-bus.event-replayed', req, {
      sourceEventId: req.params.eventId,
      replayEventId: result.event.id,
      deliveryCount: result.deliveryCount,
    })
    return result
  }, 201))
  router.post('/dead-letters/:deadLetterId/replay', (req, res, next) => handle(res, next, async () => {
    const result = await replayDeadLetter(req.params.deadLetterId, actor(req))
    publishEventBusEvent('event-bus.dead-letter-replayed', req, {
      deadLetterId: req.params.deadLetterId,
      replayEventId: result.event.id,
      deliveryCount: result.deliveryCount,
    })
    return result
  }, 201))
  return router
}
