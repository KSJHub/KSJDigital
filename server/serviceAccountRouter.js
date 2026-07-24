import express from 'express'
import {
  disableServiceAccount,
  getServiceAccountState,
  issueApiKey,
  revokeApiKey,
  rotateApiKey,
  upsertServiceAccount,
} from './services/serviceAccountService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function actor(req) { return { id: req.session?.userId || null, email: req.session?.email || null } }
function sendError(res, error) {
  res.status(Number(error.status) || 400).json({ error: error.message || 'Service account request failed', ...(error.details ? { details: error.details } : {}) })
}

export function createServiceAccountRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => { try { res.json(await getServiceAccountState(req.query)) } catch (error) { sendError(res, error) } })
  router.put('/accounts/:accountId', async (req, res) => { try { res.json(await upsertServiceAccount({ ...req.body, id: req.params.accountId }, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/accounts/:accountId/disable', async (req, res) => { try { res.json(await disableServiceAccount(req.params.accountId, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/accounts/:accountId/keys', async (req, res) => { try { res.status(201).json(await issueApiKey(req.params.accountId, req.body || {}, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/keys/:keyId/rotate', async (req, res) => { try { res.status(201).json(await rotateApiKey(req.params.keyId, req.body || {}, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/keys/:keyId/revoke', async (req, res) => { try { res.json(await revokeApiKey(req.params.keyId, actor(req), req.body?.reason || 'revoked')) } catch (error) { sendError(res, error) } })

  return router
}
