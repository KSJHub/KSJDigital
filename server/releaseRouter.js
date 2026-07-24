import express from 'express'
import {
  acquireDeploymentLock,
  createRelease,
  deploymentPlan,
  getMaintenanceMode,
  listReleaseState,
  promoteRelease,
  releaseDeploymentLock,
  rollbackRelease,
  setMaintenanceMode,
} from './services/releaseService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function actor(req) { return { id: req.session?.userId || null, email: req.session?.email || null } }
function sendError(res, error) {
  const body = { error: error.message || 'Release request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createReleaseRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (requireOwner(req, res)) next() })

  router.get('/', async (req, res) => { try { res.json(await listReleaseState(req.query)) } catch (error) { sendError(res, error) } })
  router.post('/', async (req, res) => { try { res.status(201).json(await createRelease(req.body || {}, actor(req))) } catch (error) { sendError(res, error) } })
  router.get('/maintenance/:environment', async (req, res) => { try { res.json(await getMaintenanceMode(req.params.environment)) } catch (error) { sendError(res, error) } })
  router.put('/maintenance/:environment', async (req, res) => { try { res.json(await setMaintenanceMode(req.params.environment, req.body || {}, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/locks/:environment', async (req, res) => { try { res.status(201).json(await acquireDeploymentLock(req.params.environment, req.body || {}, actor(req))) } catch (error) { sendError(res, error) } })
  router.delete('/locks/:environment', async (req, res) => { try { res.json(await releaseDeploymentLock(req.params.environment, req.body?.lockToken || req.headers['x-deployment-lock'], actor(req))) } catch (error) { sendError(res, error) } })
  router.get('/:releaseId/plan/:environment', async (req, res) => { try { res.json(await deploymentPlan(req.params.releaseId, req.params.environment)) } catch (error) { sendError(res, error) } })
  router.post('/:releaseId/promote/:environment', async (req, res) => { try { res.json(await promoteRelease(req.params.releaseId, req.params.environment, req.body || {}, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/rollback/:environment', async (req, res) => { try { res.json(await rollbackRelease(req.params.environment, req.body || {}, actor(req))) } catch (error) { sendError(res, error) } })
  return router
}
