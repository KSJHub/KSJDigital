import express from 'express'
import {
  deleteAbusePolicy,
  getAbuseProtectionState,
  removeAbuseOverride,
  setAbuseOverride,
  updateTrustedProxies,
  upsertAbusePolicy,
} from './services/abuseProtectionService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function actor(req) { return { id: req.session?.userId || null, email: req.session?.email || null } }
function sendError(res, error) { res.status(Number(error.status) || 400).json({ error: error.message || 'Abuse protection request failed', ...(error.details ? { details: error.details } : {}) }) }

export function createAbuseProtectionRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })
  router.get('/', async (req, res) => { try { res.json(await getAbuseProtectionState(req.query)) } catch (error) { sendError(res, error) } })
  router.put('/policies/:policyId', async (req, res) => { try { res.json(await upsertAbusePolicy({ ...req.body, id: req.params.policyId }, actor(req))) } catch (error) { sendError(res, error) } })
  router.delete('/policies/:policyId', async (req, res) => { try { res.json(await deleteAbusePolicy(req.params.policyId, actor(req))) } catch (error) { sendError(res, error) } })
  router.put('/trusted-proxies', async (req, res) => { try { res.json({ trustedProxies: await updateTrustedProxies(req.body?.trustedProxies || [], actor(req)) }) } catch (error) { sendError(res, error) } })
  router.post('/overrides', async (req, res) => { try { res.status(201).json(await setAbuseOverride(req.body || {}, actor(req))) } catch (error) { sendError(res, error) } })
  router.delete('/overrides/:overrideId', async (req, res) => { try { res.json(await removeAbuseOverride(req.params.overrideId, actor(req))) } catch (error) { sendError(res, error) } })
  return router
}
