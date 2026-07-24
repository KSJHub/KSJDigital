import express from 'express'
import {
  deleteFeatureFlag,
  evaluateFeatureFlag,
  evaluateFeatureFlags,
  getFeatureFlagState,
  setFeatureFlagKillSwitch,
  upsertFeatureFlag,
} from './services/featureFlagService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function actor(req) { return { id: req.session?.userId || null, email: req.session?.email || null } }
function sendError(res, error) {
  const body = { error: error.message || 'Feature flag request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createFeatureFlagRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => { try { res.json(await getFeatureFlagState(req.query)) } catch (error) { sendError(res, error) } })
  router.put('/:flagKey', async (req, res) => { try { res.json(await upsertFeatureFlag({ ...req.body, key: req.params.flagKey }, actor(req))) } catch (error) { sendError(res, error) } })
  router.delete('/:flagKey', async (req, res) => { try { res.json(await deleteFeatureFlag(req.params.flagKey, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/:flagKey/kill-switch', async (req, res) => { try { res.json(await setFeatureFlagKillSwitch(req.params.flagKey, req.body?.enabled === true, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/:flagKey/evaluate', async (req, res) => { try { res.json(await evaluateFeatureFlag(req.params.flagKey, req.body || {})) } catch (error) { sendError(res, error) } })
  router.post('/evaluate/batch', async (req, res) => { try { res.json(await evaluateFeatureFlags(req.body?.keys || [], req.body?.context || {})) } catch (error) { sendError(res, error) } })

  return router
}
