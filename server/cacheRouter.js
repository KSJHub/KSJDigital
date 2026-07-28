import express from 'express'
import { clearCache, deleteCachePolicy, getCacheState, invalidateCache, upsertCachePolicy } from './services/cacheService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}

function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

function cacheRegistryPayload(state = {}, policy = {}, details = {}) {
  const policies = Array.isArray(state.policies) ? state.policies : []
  const entries = Array.isArray(state.entries) ? state.entries : []
  return {
    policyCount: policies.length,
    enabledPolicyCount: policies.filter(item => item.enabled !== false).length,
    entryCount: entries.length,
    memoryPolicyCount: policies.filter(item => item.provider === 'memory').length,
    filePolicyCount: policies.filter(item => item.provider === 'file').length,
    enabled: policy.enabled !== false,
    methodCount: Array.isArray(policy.methods) ? policy.methods.length : 0,
    tagCount: Array.isArray(policy.tags) ? policy.tags.length : 0,
    hasStaleWindow: Number(policy.staleWhileRevalidateMs) > 0,
    created: details.created === true,
    deleted: details.deleted === true,
  }
}

function cacheInvalidationPayload(result = {}, details = {}) {
  return {
    invalidatedCount: Number(result.invalidated) || 0,
    targeted: details.targeted === true,
    namespaceFiltered: details.namespaceFiltered === true,
    tagFilterCount: Number(details.tagFilterCount) || 0,
    cleared: details.cleared === true,
  }
}

async function publishCacheRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function normaliseStringList(value, transform = item => String(item).trim()) {
  return [...new Set((Array.isArray(value) ? value : []).map(transform).filter(Boolean))].sort()
}

function cachePolicyPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name ?? existing.id).trim().slice(0, 200) !== String(existing.name || '')) return true
  if (Object.hasOwn(input, 'namespace') && String(input.namespace || '').trim() !== String(existing.namespace || '')) return true
  if (Object.hasOwn(input, 'route') && String(input.route ?? '*').trim() !== String(existing.route || '*')) return true
  if (Object.hasOwn(input, 'methods') && JSON.stringify(normaliseStringList(input.methods, item => String(item).toUpperCase())) !== JSON.stringify(existing.methods || [])) return true
  if (Object.hasOwn(input, 'provider') && String(input.provider || 'memory') !== String(existing.provider || 'memory')) return true
  if (Object.hasOwn(input, 'ttlMs') && Math.min(604800000, Math.max(1000, Number(input.ttlMs))) !== Number(existing.ttlMs)) return true
  if (Object.hasOwn(input, 'staleWhileRevalidateMs') && Math.min(604800000, Math.max(0, Number(input.staleWhileRevalidateMs))) !== Number(existing.staleWhileRevalidateMs)) return true
  if (Object.hasOwn(input, 'tags') && JSON.stringify(normaliseStringList(input.tags)) !== JSON.stringify(existing.tags || [])) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'priority') && Math.min(10000, Math.max(-10000, Number(input.priority))) !== Number(existing.priority)) return true
  return false
}

export function createCacheRouter() {
  const router = express.Router()
  router.use(requireOwner)

  router.get('/', (req, res, next) => handle(res, next, () => getCacheState(req.query)))

  router.put('/policies/:policyId', (req, res, next) => handle(res, next, async () => {
    const input = req.body || {}
    const state = await getCacheState({ limit: 1000 })
    const existing = state.policies.find(item => item.id === req.params.policyId)
    if (!cachePolicyPatchChanges(existing, input)) return existing
    const result = await upsertCachePolicy({ ...input, id: req.params.policyId }, null)
    const updatedState = await getCacheState({ limit: 1000 })
    await publishCacheRealtimeEvent('cache.policy-updated', cacheRegistryPayload(updatedState, result, { created: !existing }))
    return result
  }))

  router.delete('/policies/:policyId', (req, res, next) => handle(res, next, async () => {
    const state = await getCacheState({ limit: 1000 })
    const existing = state.policies.find(item => item.id === req.params.policyId)
    if (!existing) return { deleted: false, id: req.params.policyId }
    const result = await deleteCachePolicy(req.params.policyId, null)
    const updatedState = await getCacheState({ limit: 1000 })
    await publishCacheRealtimeEvent('cache.policy-deleted', cacheRegistryPayload(updatedState, {}, result))
    return result
  }))

  router.post('/invalidate', (req, res, next) => handle(res, next, async () => {
    const input = req.body || {}
    const result = await invalidateCache(input, null)
    if (result.invalidated === 0) return result
    await publishCacheRealtimeEvent('cache.invalidated', cacheInvalidationPayload(result, {
      targeted: Boolean(input.namespace) || Array.isArray(input.tags),
      namespaceFiltered: Boolean(input.namespace),
      tagFilterCount: Array.isArray(input.tags) ? normaliseStringList(input.tags).length : 0,
    }))
    return result
  }))

  router.delete('/entries', (req, res, next) => handle(res, next, async () => {
    const result = await clearCache(null)
    if (result.invalidated === 0) return result
    await publishCacheRealtimeEvent('cache.cleared', cacheInvalidationPayload(result, { cleared: true }))
    return result
  }))

  return router
}
