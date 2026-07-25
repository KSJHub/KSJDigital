import express from 'express'
import {
  getNotificationState,
  queueNotification,
  updateNotificationRateLimit,
  upsertNotificationRecipient,
  upsertNotificationTemplate,
} from './services/notificationService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function actor(req) {
  return {
    id: req.session?.userId || null,
    email: req.session?.email || null,
    name: req.session?.displayName || req.session?.name || null,
  }
}
function sendError(res, error) {
  const body = { error: error.message || 'Notification request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createNotificationRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => {
    try { res.json(await getNotificationState(req.query)) } catch (error) { sendError(res, error) }
  })
  router.put('/templates/:templateId', async (req, res) => {
    try {
      const currentActor = actor(req)
      const template = await upsertNotificationTemplate({ ...req.body, id: req.params.templateId }, currentActor)
      await publishDomainEvent('notification.template-updated', {
        accountId: currentActor.id,
        templateId: template.id,
        enabled: template.enabled,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      }, currentActor)
      res.json(template)
    } catch (error) { sendError(res, error) }
  })
  router.put('/recipients/:recipientId', async (req, res) => {
    try {
      const currentActor = actor(req)
      const recipient = await upsertNotificationRecipient({ ...req.body, id: req.params.recipientId }, currentActor)
      await publishDomainEvent('notification.recipient-updated', {
        accountId: currentActor.id,
        recipientId: recipient.id,
        provider: recipient.provider,
        websiteId: recipient.metadata?.websiteId || null,
        enabled: recipient.enabled,
        createdAt: recipient.createdAt,
        updatedAt: recipient.updatedAt,
      }, currentActor)
      res.json(recipient)
    } catch (error) { sendError(res, error) }
  })
  router.put('/rate-limits/:provider', async (req, res) => {
    try {
      const currentActor = actor(req)
      const policy = await updateNotificationRateLimit(req.params.provider, req.body || {}, currentActor)
      await publishDomainEvent('notification.rate-limit-updated', {
        accountId: currentActor.id,
        provider: req.params.provider,
        windowMs: policy.windowMs,
        maximum: policy.maximum,
      }, currentActor)
      res.json(policy)
    } catch (error) { sendError(res, error) }
  })
  router.post('/deliveries', async (req, res) => {
    try {
      const currentActor = actor(req)
      const queued = await queueNotification(req.body || {}, currentActor)
      await publishDomainEvent('notification.queued', {
        accountId: currentActor.id,
        templateId: req.body?.templateId || null,
        queuedCount: queued.queued,
        scheduled: Boolean(req.body?.scheduledFor),
        priority: req.body?.priority ?? null,
      }, currentActor)
      res.status(202).json(queued)
    } catch (error) { sendError(res, error) }
  })

  return router
}
