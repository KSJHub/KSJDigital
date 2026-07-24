import express from 'express'
import {
  getNotificationState,
  queueNotification,
  updateNotificationRateLimit,
  upsertNotificationRecipient,
  upsertNotificationTemplate,
} from './services/notificationService.js'

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
    try { res.json(await upsertNotificationTemplate({ ...req.body, id: req.params.templateId }, actor(req))) } catch (error) { sendError(res, error) }
  })
  router.put('/recipients/:recipientId', async (req, res) => {
    try { res.json(await upsertNotificationRecipient({ ...req.body, id: req.params.recipientId }, actor(req))) } catch (error) { sendError(res, error) }
  })
  router.put('/rate-limits/:provider', async (req, res) => {
    try { res.json(await updateNotificationRateLimit(req.params.provider, req.body || {}, actor(req))) } catch (error) { sendError(res, error) }
  })
  router.post('/deliveries', async (req, res) => {
    try { res.status(202).json(await queueNotification(req.body || {}, actor(req))) } catch (error) { sendError(res, error) }
  })

  return router
}
