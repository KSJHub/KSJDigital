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

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

export function createEventBusRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getEventBusState(req.query)))
  router.put('/subscriptions/:subscriptionId', (req, res, next) => handle(res, next, () => upsertSubscription({ ...req.body, id: req.params.subscriptionId }, actor(req))))
  router.delete('/subscriptions/:subscriptionId', (req, res, next) => handle(res, next, () => deleteSubscription(req.params.subscriptionId, actor(req))))
  router.post('/publish', (req, res, next) => handle(res, next, () => publishEvent(req.body?.topic, req.body?.payload, { ...req.body?.options, source: 'administration' }), 201))
  router.post('/process', (req, res, next) => handle(res, next, () => processEventDeliveries(req.body || {})))
  router.post('/events/:eventId/replay', (req, res, next) => handle(res, next, () => replayEvent(req.params.eventId, actor(req)), 201))
  router.post('/dead-letters/:deadLetterId/replay', (req, res, next) => handle(res, next, () => replayDeadLetter(req.params.deadLetterId, actor(req)), 201))
  return router
}
