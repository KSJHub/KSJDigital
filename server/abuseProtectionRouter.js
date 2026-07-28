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

function sendError(res, error) {
  res.status(Number(error.status) || 400).json({ error: error.message || 'Abuse protection request failed', ...(error.details ? { details: error.details } : {}) })
}

function abuseRegistryPayload(state = {}, subject = {}, details = {}) {
  const policies = Array.isArray(state.policies) ? state.policies : []
  const overrides = Array.isArray(state.overrides) ? state.overrides : []
  const blocks = Array.isArray(state.blocks) ? state.blocks : []
  const trustedProxies = Array.isArray(state.trustedProxies) ? state.trustedProxies : []
  return {
    policyCount: policies.length,
    enabledPolicyCount: policies.filter(item => item.enabled !== false).length,
    overrideCount: overrides.length,
    activeBlockCount: blocks.length,
    trustedProxyCount: trustedProxies.length,
    enabled: subject.enabled !== false,
    methodCount: Array.isArray(subject.methods) ? subject.methods.length : 0,
    subjectTypeCount: Array.isArray(subject.subjectTypes) ? subject.subjectTypes.length : 0,
    blocking: subject.mode === 'block',
    allowing: subject.mode === 'allow',
    hasExpiry: Boolean(subject.expiresAt),
    created: details.created === true,
    deleted: details.deleted === true,
    removed: details.removed === true,
  }
}

async function publishAbuseProtectionRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function normalisedStringList(value, transform = item => String(item).trim()) {
  return [...new Set((Array.isArray(value) ? value : []).map(transform).filter(Boolean))]
}

function policyPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name ?? existing.id).trim().slice(0, 200) !== String(existing.name || '')) return true
  if (Object.hasOwn(input, 'route') && String(input.route ?? '*').trim() !== String(existing.route || '*')) return true
  if (Object.hasOwn(input, 'methods') && JSON.stringify(normalisedStringList(input.methods, item => String(item).trim().toUpperCase())) !== JSON.stringify(existing.methods || [])) return true
  if (Object.hasOwn(input, 'subjectTypes') && JSON.stringify(normalisedStringList(input.subjectTypes)) !== JSON.stringify(existing.subjectTypes || [])) return true
  if (Object.hasOwn(input, 'windowMs') && Math.min(86400000, Math.max(1000, Number(input.windowMs))) !== Number(existing.windowMs)) return true
  if (Object.hasOwn(input, 'maximum') && Math.min(1000000, Math.max(1, Number(input.maximum))) !== Number(existing.maximum)) return true
  if (Object.hasOwn(input, 'blockMs') && Math.min(2592000000, Math.max(1000, Number(input.blockMs))) !== Number(existing.blockMs)) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'priority') && Math.min(10000, Math.max(-10000, Number(input.priority))) !== Number(existing.priority)) return true
  return false
}

function sameOverride(existing, input = {}) {
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : null
  return existing.subjectType === String(input.subjectType || '').trim()
    && existing.subjectId === String(input.subjectId || '').trim()
    && (existing.policyId || null) === (input.policyId || null)
    && existing.mode === String(input.mode || '').trim()
    && (existing.expiresAt || null) === expiresAt
    && (existing.reason || null) === (String(input.reason || '').trim().slice(0, 500) || null)
}

export function createAbuseProtectionRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => {
    try { res.json(await getAbuseProtectionState(req.query)) } catch (error) { sendError(res, error) }
  })

  router.put('/policies/:policyId', async (req, res) => {
    try {
      const input = req.body || {}
      const state = await getAbuseProtectionState({ limit: 1000 })
      const existing = state.policies.find(item => item.id === req.params.policyId)
      if (!policyPatchChanges(existing, input)) return res.json(existing)
      const result = await upsertAbusePolicy({ ...input, id: req.params.policyId }, null)
      const updatedState = await getAbuseProtectionState({ limit: 1000 })
      await publishAbuseProtectionRealtimeEvent('abuse-protection.policy-updated', abuseRegistryPayload(updatedState, result, { created: !existing }))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/policies/:policyId', async (req, res) => {
    try {
      const state = await getAbuseProtectionState({ limit: 1000 })
      const existing = state.policies.find(item => item.id === req.params.policyId)
      if (!existing) return res.json({ deleted: false, id: req.params.policyId })
      const result = await deleteAbusePolicy(req.params.policyId, null)
      const updatedState = await getAbuseProtectionState({ limit: 1000 })
      await publishAbuseProtectionRealtimeEvent('abuse-protection.policy-deleted', abuseRegistryPayload(updatedState, {}, result))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.put('/trusted-proxies', async (req, res) => {
    try {
      const state = await getAbuseProtectionState({ limit: 1 })
      const requested = normalisedStringList(req.body?.trustedProxies)
      if (JSON.stringify(requested) === JSON.stringify(state.trustedProxies || [])) return res.json({ trustedProxies: state.trustedProxies || [] })
      const trustedProxies = await updateTrustedProxies(requested, null)
      const updatedState = await getAbuseProtectionState({ limit: 1 })
      await publishAbuseProtectionRealtimeEvent('abuse-protection.trusted-proxies-updated', abuseRegistryPayload(updatedState))
      res.json({ trustedProxies })
    } catch (error) { sendError(res, error) }
  })

  router.post('/overrides', async (req, res) => {
    try {
      const input = req.body || {}
      const state = await getAbuseProtectionState({ limit: 1000 })
      const existing = state.overrides.find(item => sameOverride(item, input))
      if (existing) return res.json(existing)
      const result = await setAbuseOverride(input, null)
      const updatedState = await getAbuseProtectionState({ limit: 1000 })
      await publishAbuseProtectionRealtimeEvent('abuse-protection.override-created', abuseRegistryPayload(updatedState, result, { created: true }))
      res.status(201).json(result)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/overrides/:overrideId', async (req, res) => {
    try {
      const state = await getAbuseProtectionState({ limit: 1000 })
      const existing = state.overrides.find(item => item.id === req.params.overrideId)
      if (!existing) return res.json({ removed: false, id: req.params.overrideId })
      const result = await removeAbuseOverride(req.params.overrideId, null)
      const updatedState = await getAbuseProtectionState({ limit: 1000 })
      await publishAbuseProtectionRealtimeEvent('abuse-protection.override-removed', abuseRegistryPayload(updatedState, {}, result))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  return router
}
