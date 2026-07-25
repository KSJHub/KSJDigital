import express from 'express'
import { clearCache, deleteCachePolicy, getCacheState, invalidateCache, upsertCachePolicy } from './services/cacheService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}
function publishCacheEvent(topic, req, payload) {
  publishDomainEvent(topic, {
    actor: actor(req),
    payload,
  })
}

export function createCacheRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getCacheState(req.query)))
  router.put('/policies/:policyId', (req, res, next) => handle(res, next, async () => {
    const result = await upsertCachePolicy({ ...req.body, id: req.params.policyId }, actor(req))
    publishCacheEvent('cache.policy-updated', req, {
      policyId: result.id,
      provider: result.provider,
      enabled: result.enabled,
      methodCount: result.methods.length,
      tagCount: result.tags.length,
    })
    return result
  }))
  router.delete('/policies/:policyId', (req, res, next) => handle(res, next, async () => {
    const result = await deleteCachePolicy(req.params.policyId, actor(req))
    publishCacheEvent('cache.policy-deleted', req, { policyId: result.id, deleted: result.deleted })
    return result
  }))
  router.post('/invalidate', (req, res, next) => handle(res, next, async () => {
    const result = await invalidateCache(req.body || {}, actor(req))
    publishCacheEvent('cache.invalidated', req, {
      invalidatedCount: result.invalidated,
      namespaceFiltered: Boolean(req.body?.namespace),
      tagFilterCount: Array.isArray(req.body?.tags) ? req.body.tags.length : 0,
    })
    return result
  }))
  router.delete('/entries', (req, res, next) => handle(res, next, async () => {
    const result = await clearCache(actor(req))
    publishCacheEvent('cache.cleared', req, { invalidatedCount: result.invalidated })
    return result
  }))
  return router
}
