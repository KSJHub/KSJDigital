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

function sendError(res, error) {
  const body = { error: error.message || 'Notification request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

function notificationRegistryPayload(state = {}, subject = {}, details = {}) {
  const templates = Array.isArray(state.templates) ? state.templates : []
  const recipients = Array.isArray(state.recipients) ? state.recipients : []
  const deliveries = Array.isArray(state.deliveries) ? state.deliveries : []
  return {
    templateCount: templates.length,
    enabledTemplateCount: templates.filter(item => item.enabled !== false).length,
    recipientCount: recipients.length,
    enabledRecipientCount: recipients.filter(item => item.enabled !== false).length,
    deliveryCount: deliveries.length,
    enabled: subject.enabled !== false,
    hasMetadata: subject.metadata && typeof subject.metadata === 'object' ? Object.keys(subject.metadata).length > 0 : false,
    hasTemplateData: subject.data && typeof subject.data === 'object' ? Object.keys(subject.data).length > 0 : false,
    created: details.created === true,
  }
}

function rateLimitEventPayload(policy = {}) {
  return {
    windowMs: Number(policy.windowMs) || 0,
    maximum: Number(policy.maximum) || 0,
  }
}

function queuedEventPayload(queued = {}, input = {}) {
  return {
    queuedCount: Number(queued.queued) || 0,
    scheduled: Boolean(input.scheduledFor),
    priority: Number(input.priority) || 0,
  }
}

async function publishNotificationRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function templatePatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name || existing.id || '').trim() !== String(existing.name || '').trim()) return true
  if (Object.hasOwn(input, 'subject') && String(input.subject || '').trim().slice(0, 500) !== String(existing.subject || '')) return true
  if (Object.hasOwn(input, 'body') && String(input.body || '').trim() !== String(existing.body || '')) return true
  if (Object.hasOwn(input, 'data') && JSON.stringify(input.data && typeof input.data === 'object' ? input.data : {}) !== JSON.stringify(existing.data || {})) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled !== false) !== (existing.enabled !== false)) return true
  return false
}

function recipientPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name || existing.id || '').trim().slice(0, 200) !== String(existing.name || '')) return true
  if (Object.hasOwn(input, 'provider') && String(input.provider || '').trim() !== String(existing.provider || '')) return true
  if (Object.hasOwn(input, 'address') && String(input.address || '').trim() !== String(existing.address || '')) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled !== false) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'metadata') && JSON.stringify(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}) !== JSON.stringify(existing.metadata || {})) return true
  return false
}

function rateLimitPatchChanges(existing = {}, input = {}) {
  const windowMs = Math.min(86400000, Math.max(1000, Number(input.windowMs ?? existing.windowMs ?? 60000)))
  const maximum = Math.min(10000, Math.max(1, Number(input.maximum ?? existing.maximum ?? 60)))
  return windowMs !== Number(existing.windowMs ?? 60000) || maximum !== Number(existing.maximum ?? 60)
}

export function createNotificationRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => {
    try { res.json(await getNotificationState(req.query)) } catch (error) { sendError(res, error) }
  })

  router.put('/templates/:templateId', async (req, res) => {
    try {
      const input = req.body || {}
      const state = await getNotificationState({ limit: 1 })
      const existing = state.templates.find(item => item.id === req.params.templateId)
      if (!templatePatchChanges(existing, input)) return res.json(existing)
      const template = await upsertNotificationTemplate({ ...input, id: req.params.templateId }, null)
      const updatedState = await getNotificationState({ limit: 1 })
      await publishNotificationRealtimeEvent('notification.template-updated', notificationRegistryPayload(updatedState, template, { created: !existing }))
      res.json(template)
    } catch (error) { sendError(res, error) }
  })

  router.put('/recipients/:recipientId', async (req, res) => {
    try {
      const input = req.body || {}
      const state = await getNotificationState({ limit: 1 })
      const existing = state.recipients.find(item => item.id === req.params.recipientId)
      if (!recipientPatchChanges(existing, input)) return res.json(existing)
      const recipient = await upsertNotificationRecipient({ ...input, id: req.params.recipientId }, null)
      const updatedState = await getNotificationState({ limit: 1 })
      await publishNotificationRealtimeEvent('notification.recipient-updated', notificationRegistryPayload(updatedState, recipient, { created: !existing }))
      res.json(recipient)
    } catch (error) { sendError(res, error) }
  })

  router.put('/rate-limits/:provider', async (req, res) => {
    try {
      const input = req.body || {}
      const state = await getNotificationState({ limit: 1 })
      const existing = state.rateLimits?.[req.params.provider] || { windowMs: 60000, maximum: 60 }
      if (!rateLimitPatchChanges(existing, input)) return res.json(existing)
      const policy = await updateNotificationRateLimit(req.params.provider, input, null)
      await publishNotificationRealtimeEvent('notification.rate-limit-updated', rateLimitEventPayload(policy))
      res.json(policy)
    } catch (error) { sendError(res, error) }
  })

  router.post('/deliveries', async (req, res) => {
    try {
      const input = req.body || {}
      const before = await getNotificationState({ limit: 1 })
      const queued = await queueNotification(input, null)
      const knownJobIds = new Set((before.jobs || []).map(item => item.id))
      const newlyQueued = Array.isArray(queued.jobs) ? queued.jobs.filter(item => !knownJobIds.has(item.id)).length : Number(queued.queued) || 0
      if (newlyQueued > 0) await publishNotificationRealtimeEvent('notification.queued', queuedEventPayload({ ...queued, queued: newlyQueued }, input))
      res.status(202).json(queued)
    } catch (error) { sendError(res, error) }
  })

  return router
}
