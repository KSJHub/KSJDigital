import express from 'express'
import { clearCache, deleteCachePolicy, getCacheState, invalidateCache, upsertCachePolicy } from './services/cacheService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

export function createCacheRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getCacheState(req.query)))
  router.put('/policies/:policyId', (req, res, next) => handle(res, next, () => upsertCachePolicy({ ...req.body, id: req.params.policyId }, actor(req))))
  router.delete('/policies/:policyId', (req, res, next) => handle(res, next, () => deleteCachePolicy(req.params.policyId, actor(req))))
  router.post('/invalidate', (req, res, next) => handle(res, next, () => invalidateCache(req.body || {}, actor(req))))
  router.delete('/entries', (req, res, next) => handle(res, next, () => clearCache(actor(req))))
  return router
}
