import express from 'express'
import {
  createApiKey,
  getApiKeyState,
  revokeApiKey,
  rotateApiKey,
  updateApiKey,
} from './services/apiKeyService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null, role: req.session?.role || null } }
function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

export function createApiKeyRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getApiKeyState(req.query)))
  router.post('/', (req, res, next) => handle(res, next, () => createApiKey(req.body || {}, actor(req)), 201))
  router.patch('/:keyId', (req, res, next) => handle(res, next, () => updateApiKey(req.params.keyId, req.body || {}, actor(req))))
  router.post('/:keyId/rotate', (req, res, next) => handle(res, next, () => rotateApiKey(req.params.keyId, req.body || {}, actor(req)), 201))
  router.post('/:keyId/revoke', (req, res, next) => handle(res, next, () => revokeApiKey(req.params.keyId, req.body || {}, actor(req))))
  return router
}
