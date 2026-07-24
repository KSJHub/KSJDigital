import express from 'express'
import {
  activateEnvironment,
  configurationHistory,
  deleteSecret,
  deploymentReadiness,
  getConfiguration,
  setSecret,
  updateConfiguration,
  validateConfiguration,
} from './services/configurationService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function actor(req) {
  return { id: req.session?.userId || null, email: req.session?.email || null }
}

function sendError(res, error) {
  const body = { error: error.message || 'Configuration request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createConfigurationRouter() {
  const router = express.Router()

  router.use((req, res, next) => {
    if (!requireOwner(req, res)) return
    next()
  })

  router.get('/', async (req, res) => {
    try { res.json(await getConfiguration(req.query.environment)) } catch (error) { sendError(res, error) }
  })

  router.get('/history', async (req, res) => {
    try { res.json(await configurationHistory(req.query)) } catch (error) { sendError(res, error) }
  })

  router.get('/validate', async (req, res) => {
    try { res.json(await validateConfiguration(req.query.environment)) } catch (error) { sendError(res, error) }
  })

  router.get('/deployment-readiness', async (req, res) => {
    try { res.json(await deploymentReadiness(req.query.environment || 'production')) } catch (error) { sendError(res, error) }
  })

  router.patch('/environments/:environment', async (req, res) => {
    try { res.json(await updateConfiguration(req.params.environment, req.body || {}, actor(req))) } catch (error) { sendError(res, error) }
  })

  router.post('/environments/:environment/activate', async (req, res) => {
    try { res.json(await activateEnvironment(req.params.environment, actor(req))) } catch (error) { sendError(res, error) }
  })

  router.put('/secrets/:name', async (req, res) => {
    try { res.json(await setSecret(req.params.name, req.body || {}, actor(req))) } catch (error) { sendError(res, error) }
  })

  router.delete('/secrets/:name', async (req, res) => {
    try { res.json(await deleteSecret(req.params.name, actor(req))) } catch (error) { sendError(res, error) }
  })

  return router
}
