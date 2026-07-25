import express from 'express'
import {
  deleteAbusePolicy,
  getAbuseProtectionState,
  removeAbuseOverride,
  setAbuseOverride,
  updateTrustedProxies,
  upsertAbusePolicy,
} from './services/abuseProtectionService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null, role: req.session?.role || null } }
function sendError(res, error) { res.status(Number(error.status) || 400).json({ error: error.message || 'Abuse protection request failed', ...(error.details ? { details: error.details } : {}) }) }
function publishAbuseEvent(topic, req, payload) {
  publishDomainEvent(topic, payload, actor(req))
}

export function createAbuseProtectionRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })
  router.get('/', async (req, res) => { try { res.json(await getAbuseProtectionState(req.query)) } catch (error) { sendError(res, error) } })
  router.put('/policies/:policyId', async (req, res) => {
    try {
      const result = await upsertAbusePolicy({ ...req.body, id: req.params.policyId }, actor(req))
      publishAbuseEvent('abuse-protection.policy-updated', req, {
        policyId: result.id,
        enabled: result.enabled,
        priority: result.priority,
        methodCount: result.methods.length,
        subjectTypeCount: result.subjectTypes.length,
      })
      res.json(result)
    } catch (error) { sendError(res, error) }
  })
  router.delete('/policies/:policyId', async (req, res) => {
    try {
      const result = await deleteAbusePolicy(req.params.policyId, actor(req))
      publishAbuseEvent('abuse-protection.policy-deleted', req, { policyId: result.id, deleted: result.deleted })
      res.json(result)
    } catch (error) { sendError(res, error) }
  })
  router.put('/trusted-proxies', async (req, res) => {
    try {
      const trustedProxies = await updateTrustedProxies(req.body?.trustedProxies || [], actor(req))
      publishAbuseEvent('abuse-protection.trusted-proxies-updated', req, { trustedProxyCount: trustedProxies.length })
      res.json({ trustedProxies })
    } catch (error) { sendError(res, error) }
  })
  router.post('/overrides', async (req, res) => {
    try {
      const result = await setAbuseOverride(req.body || {}, actor(req))
      publishAbuseEvent('abuse-protection.override-created', req, {
        overrideId: result.id,
        subjectType: result.subjectType,
        policyId: result.policyId,
        mode: result.mode,
        expiresAt: result.expiresAt,
      })
      res.status(201).json(result)
    } catch (error) { sendError(res, error) }
  })
  router.delete('/overrides/:overrideId', async (req, res) => {
    try {
      const result = await removeAbuseOverride(req.params.overrideId, actor(req))
      publishAbuseEvent('abuse-protection.override-removed', req, { overrideId: result.id, removed: result.removed })
      res.json(result)
    } catch (error) { sendError(res, error) }
  })
  return router
}
