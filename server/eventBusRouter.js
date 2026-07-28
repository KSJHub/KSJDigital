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

function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

function eventBusRegistryPayload(state = {}, subject = {}, details = {}) {
  const subscriptions = Array.isArray(state.subscriptions) ? state.subscriptions : []
  const events = Array.isArray(state.events) ? state.events : []
  const deliveries = Array.isArray(state.deliveries) ? state.deliveries : []
  const deadLetters = Array.isArray(state.deadLetters) ? state.deadLetters : []
  return {
    subscriptionCount: subscriptions.length,
    enabledSubscriptionCount: subscriptions.filter(item => item.enabled !== false).length,
    eventCount: events.length,
    pendingDeliveryCount: deliveries.filter(item => item.status === 'pending').length,
    processingDeliveryCount: deliveries.filter(item => item.status === 'processing').length,
    deadLetterCount: deadLetters.length,
    enabled: subject.enabled !== false,
    maximumAttempts: Number(subject.retry?.maximumAttempts) || 0,
    metadataFieldCount: subject.metadata && typeof subject.metadata === 'object' ? Object.keys(subject.metadata).length : 0,
    deliveryCount: Number(details.deliveryCount) || 0,
    created: details.created === true,
    deleted: details.deleted === true,
    replayed: details.replayed === true,
    deadLetterReplay: details.deadLetterReplay === true,
  }
}

async function publishEventBusRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function normaliseRetry(input = {}, existing = {}) {
  return {
    maximumAttempts: Math.min(100, Math.max(1, Number(input.maximumAttempts ?? existing.maximumAttempts ?? 5))),
    baseDelayMs: Math.min(3600000, Math.max(100, Number(input.baseDelayMs ?? existing.baseDelayMs ?? 1000))),
    maximumDelayMs: Math.min(86400000, Math.max(1000, Number(input.maximumDelayMs ?? existing.maximumDelayMs ?? 300000))),
  }
}

function subscriptionPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name ?? existing.id).trim().slice(0, 200) !== String(existing.name || '')) return true
  if (Object.hasOwn(input, 'topicPattern') && String(input.topicPattern || '').trim().toLowerCase() !== String(existing.topicPattern || '')) return true
  if (Object.hasOwn(input, 'handler') && String(input.handler || '').trim() !== String(existing.handler || '')) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'retry') && JSON.stringify(normaliseRetry(input.retry, existing.retry || {})) !== JSON.stringify(existing.retry || {})) return true
  if (Object.hasOwn(input, 'metadata')) {
    const requested = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {}
    if (JSON.stringify(requested) !== JSON.stringify(existing.metadata || {})) return true
  }
  return false
}

export function createEventBusRouter() {
  const router = express.Router()
  router.use(requireOwner)

  router.get('/', (req, res, next) => handle(res, next, () => getEventBusState(req.query)))

  router.put('/subscriptions/:subscriptionId', (req, res, next) => handle(res, next, async () => {
    const input = req.body || {}
    const state = await getEventBusState({ limit: 1000 })
    const existing = state.subscriptions.find(item => item.id === req.params.subscriptionId)
    if (!subscriptionPatchChanges(existing, input)) return existing
    const result = await upsertSubscription({ ...input, id: req.params.subscriptionId }, null)
    const updatedState = await getEventBusState({ limit: 1000 })
    await publishEventBusRealtimeEvent('event-bus.subscription-updated', eventBusRegistryPayload(updatedState, result, { created: !existing }))
    return result
  }))

  router.delete('/subscriptions/:subscriptionId', (req, res, next) => handle(res, next, async () => {
    const state = await getEventBusState({ limit: 1000 })
    const existing = state.subscriptions.find(item => item.id === req.params.subscriptionId)
    if (!existing) return { deleted: false, id: req.params.subscriptionId }
    const result = await deleteSubscription(req.params.subscriptionId, null)
    const updatedState = await getEventBusState({ limit: 1000 })
    await publishEventBusRealtimeEvent('event-bus.subscription-deleted', eventBusRegistryPayload(updatedState, {}, result))
    return result
  }))

  router.post('/publish', (req, res, next) => handle(res, next, () => publishEvent(req.body?.topic, req.body?.payload, { ...req.body?.options, source: 'administration' }), 201))
  router.post('/process', (req, res, next) => handle(res, next, () => processEventDeliveries(req.body || {})))

  router.post('/events/:eventId/replay', (req, res, next) => handle(res, next, async () => {
    const result = await replayEvent(req.params.eventId, null)
    const updatedState = await getEventBusState({ limit: 1000 })
    await publishEventBusRealtimeEvent('event-bus.event-replayed', eventBusRegistryPayload(updatedState, {}, { replayed: true, deliveryCount: result.deliveryCount }))
    return result
  }, 201))

  router.post('/dead-letters/:deadLetterId/replay', (req, res, next) => handle(res, next, async () => {
    const state = await getEventBusState({ limit: 1000 })
    const existing = state.deadLetters.find(item => item.id === req.params.deadLetterId)
    if (existing?.replayedAt) return { replayed: false, alreadyReplayed: true }
    const result = await replayDeadLetter(req.params.deadLetterId, null)
    const updatedState = await getEventBusState({ limit: 1000 })
    await publishEventBusRealtimeEvent('event-bus.dead-letter-replayed', eventBusRegistryPayload(updatedState, {}, { replayed: true, deadLetterReplay: true, deliveryCount: result.deliveryCount }))
    return result
  }, 201))

  return router
}
