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

function sendError(res, error) {
  res.status(Number(error.status) || 400).json({ error: error.message || 'Service account request failed', ...(error.details ? { details: error.details } : {}) })
}

function serviceAccountRegistryPayload(state = {}, account = {}, details = {}) {
  const accounts = Array.isArray(state.accounts) ? state.accounts : []
  const keys = Array.isArray(state.keys) ? state.keys : []
  return {
    accountCount: accounts.length,
    enabledAccountCount: accounts.filter(item => item.enabled !== false).length,
    keyCount: keys.length,
    activeKeyCount: keys.filter(item => item.status === 'active').length,
    enabled: account.enabled !== false,
    hasDescription: Boolean(account.description),
    metadataFieldCount: account.metadata && typeof account.metadata === 'object' ? Object.keys(account.metadata).length : 0,
    created: details.created === true,
    disabled: details.disabled === true,
  }
}

function keyEventPayload(key = {}, details = {}) {
  return {
    status: ['active', 'revoked', 'expired'].includes(key.status) ? key.status : 'active',
    scopeCount: Array.isArray(key.scopes) ? key.scopes.length : 0,
    hasExpiry: Boolean(key.expiresAt),
    hasRateLimit: Boolean(key.rateLimit),
    rotated: Boolean(key.rotatedFromKeyId),
    revoked: key.status === 'revoked',
    issued: details.issued === true,
  }
}

async function publishServiceAccountRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function accountPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name || existing.id || '').trim() !== String(existing.name || '').trim()) return true
  if (Object.hasOwn(input, 'description') && (String(input.description || '').trim().slice(0, 2000) || null) !== (existing.description || null)) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled !== false) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'metadata') && JSON.stringify(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}) !== JSON.stringify(existing.metadata || {})) return true
  return false
}

export function createServiceAccountRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => {
    try { res.json(await getServiceAccountState(req.query)) } catch (error) { sendError(res, error) }
  })

  router.put('/accounts/:accountId', async (req, res) => {
    try {
      const input = req.body || {}
      const state = await getServiceAccountState({ limit: 1 })
      const existing = state.accounts.find(item => item.id === req.params.accountId)
      if (!accountPatchChanges(existing, input)) return res.json(existing)
      const account = await upsertServiceAccount({ ...input, id: req.params.accountId }, null)
      const updatedState = await getServiceAccountState({ limit: 1 })
      await publishServiceAccountRealtimeEvent('service-account.updated', serviceAccountRegistryPayload(updatedState, account, { created: !existing }))
      res.json(account)
    } catch (error) { sendError(res, error) }
  })

  router.post('/accounts/:accountId/disable', async (req, res) => {
    try {
      const state = await getServiceAccountState({ limit: 1 })
      const existing = state.accounts.find(item => item.id === req.params.accountId)
      if (!existing) return res.status(404).json({ error: 'Service account not found' })
      if (existing.enabled === false) return res.json(existing)
      const account = await disableServiceAccount(req.params.accountId, null)
      const updatedState = await getServiceAccountState({ limit: 1 })
      await publishServiceAccountRealtimeEvent('service-account.disabled', serviceAccountRegistryPayload(updatedState, account, { disabled: true }))
      res.json(account)
    } catch (error) { sendError(res, error) }
  })

  router.post('/accounts/:accountId/keys', async (req, res) => {
    try {
      const issued = await issueApiKey(req.params.accountId, req.body || {}, null)
      await publishServiceAccountRealtimeEvent('service-account.key-issued', keyEventPayload(issued.key, { issued: true }))
      res.status(201).json(issued)
    } catch (error) { sendError(res, error) }
  })

  router.post('/keys/:keyId/rotate', async (req, res) => {
    try {
      const state = await getServiceAccountState({ limit: 1 })
      const existing = state.keys.find(item => item.id === req.params.keyId)
      if (!existing) return res.status(404).json({ error: 'API key not found' })
      if (existing.status !== 'active') return res.status(409).json({ error: 'Only active API keys can be rotated' })
      const rotated = await rotateApiKey(req.params.keyId, req.body || {}, null)
      await publishServiceAccountRealtimeEvent('service-account.key-rotated', keyEventPayload(rotated.key))
      res.status(201).json(rotated)
    } catch (error) { sendError(res, error) }
  })

  router.post('/keys/:keyId/revoke', async (req, res) => {
    try {
      const state = await getServiceAccountState({ limit: 1 })
      const existing = state.keys.find(item => item.id === req.params.keyId)
      if (!existing) return res.status(404).json({ error: 'API key not found' })
      if (existing.status === 'revoked') return res.json(existing)
      const key = await revokeApiKey(req.params.keyId, null, req.body?.reason || 'revoked')
      await publishServiceAccountRealtimeEvent('service-account.key-revoked', keyEventPayload(key))
      res.json(key)
    } catch (error) { sendError(res, error) }
  })

  return router
}
