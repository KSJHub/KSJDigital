import express from 'express'
import {
  disableServiceAccount,
  getServiceAccountState,
  issueApiKey,
  revokeApiKey,
  rotateApiKey,
  upsertServiceAccount,
} from './services/serviceAccountService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function actor(req) { return { id: req.session?.userId || null, email: req.session?.email || null, role: req.session?.role || null } }
function sendError(res, error) {
  res.status(Number(error.status) || 400).json({ error: error.message || 'Service account request failed', ...(error.details ? { details: error.details } : {}) })
}

export function createServiceAccountRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => { try { res.json(await getServiceAccountState(req.query)) } catch (error) { sendError(res, error) } })
  router.put('/accounts/:accountId', async (req, res) => {
    try {
      const currentActor = actor(req)
      const account = await upsertServiceAccount({ ...req.body, id: req.params.accountId }, currentActor)
      await publishDomainEvent('service-account.updated', {
        accountId: account.id,
        enabled: account.enabled,
        hasDescription: Boolean(account.description),
        metadataKeyCount: Object.keys(account.metadata || {}).length,
        updatedAt: account.updatedAt,
        actorAccountId: currentActor.id,
      }, currentActor)
      res.json(account)
    } catch (error) { sendError(res, error) }
  })
  router.post('/accounts/:accountId/disable', async (req, res) => {
    try {
      const currentActor = actor(req)
      const account = await disableServiceAccount(req.params.accountId, currentActor)
      await publishDomainEvent('service-account.disabled', {
        accountId: account.id,
        enabled: account.enabled,
        updatedAt: account.updatedAt,
        actorAccountId: currentActor.id,
      }, currentActor)
      res.json(account)
    } catch (error) { sendError(res, error) }
  })
  router.post('/accounts/:accountId/keys', async (req, res) => {
    try {
      const currentActor = actor(req)
      const issued = await issueApiKey(req.params.accountId, req.body || {}, currentActor)
      await publishDomainEvent('service-account.key-issued', {
        accountId: issued.key.accountId,
        keyId: issued.key.id,
        status: issued.key.status,
        scopeCount: issued.key.scopes.length,
        expiresAt: issued.key.expiresAt,
        rateLimitWindowMs: issued.key.rateLimit.windowMs,
        rateLimitMaximum: issued.key.rateLimit.maximum,
        actorAccountId: currentActor.id,
      }, currentActor)
      res.status(201).json(issued)
    } catch (error) { sendError(res, error) }
  })
  router.post('/keys/:keyId/rotate', async (req, res) => {
    try {
      const currentActor = actor(req)
      const rotated = await rotateApiKey(req.params.keyId, req.body || {}, currentActor)
      await publishDomainEvent('service-account.key-rotated', {
        accountId: rotated.key.accountId,
        keyId: rotated.key.id,
        rotatedFromKeyId: rotated.key.rotatedFromKeyId,
        status: rotated.key.status,
        scopeCount: rotated.key.scopes.length,
        expiresAt: rotated.key.expiresAt,
        actorAccountId: currentActor.id,
      }, currentActor)
      res.status(201).json(rotated)
    } catch (error) { sendError(res, error) }
  })
  router.post('/keys/:keyId/revoke', async (req, res) => {
    try {
      const currentActor = actor(req)
      const key = await revokeApiKey(req.params.keyId, currentActor, req.body?.reason || 'revoked')
      await publishDomainEvent('service-account.key-revoked', {
        accountId: key.accountId,
        keyId: key.id,
        status: key.status,
        revokedAt: key.revokedAt,
        actorAccountId: currentActor.id,
      }, currentActor)
      res.json(key)
    } catch (error) { sendError(res, error) }
  })

  return router
}
