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
import { requireAssurance } from './services/mfaService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function sendError(res, error) {
  const body = { error: error.message || 'Release request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

function releaseRegistryPayload(state = {}, details = {}) {
  const releases = Array.isArray(state.releases) ? state.releases : []
  const deployments = Array.isArray(state.deployments) ? state.deployments : []
  const environments = state.environments && typeof state.environments === 'object' ? Object.values(state.environments) : []
  const maintenance = state.maintenance && typeof state.maintenance === 'object' ? Object.values(state.maintenance) : []
  const deploymentLocks = state.deploymentLocks && typeof state.deploymentLocks === 'object' ? Object.values(state.deploymentLocks) : []
  const checks = Array.isArray(details.checks) ? details.checks : []
  return {
    releaseCount: releases.length,
    registeredReleaseCount: releases.filter(release => release.status === 'registered').length,
    promotedReleaseCount: releases.filter(release => release.status === 'promoted').length,
    releasedReleaseCount: releases.filter(release => release.status === 'released').length,
    deploymentCount: deployments.length,
    completedDeploymentCount: deployments.filter(deployment => deployment.status === 'completed').length,
    environmentCount: environments.length,
    activeEnvironmentCount: environments.filter(environment => Boolean(environment.currentReleaseId)).length,
    maintenanceEnabledCount: maintenance.filter(item => item.enabled === true).length,
    deploymentLockCount: deploymentLocks.length,
    checkCount: checks.length,
    failedCheckCount: checks.filter(check => check.status === 'failed').length,
    warningCheckCount: checks.filter(check => check.status === 'warning').length,
    ready: details.ready === true,
    created: details.created === true,
    maintenanceChanged: details.maintenanceChanged === true,
    locked: details.locked === true,
    unlocked: details.unlocked === true,
    planned: details.planned === true,
    promoted: details.promoted === true,
    rolledBack: details.rolledBack === true,
  }
}

async function publishReleaseRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export function createReleaseRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (requireOwner(req, res)) next() })
  const requireStepUp = requireAssurance(2)

  router.get('/', async (req, res) => { try { res.json(await listReleaseState(req.query)) } catch (error) { sendError(res, error) } })

  router.post('/', requireStepUp, async (req, res) => {
    try {
      const release = await createRelease(req.body || {}, null)
      const state = await listReleaseState()
      await publishReleaseRealtimeEvent('release.created', releaseRegistryPayload(state, { created: true }))
      res.status(201).json(release)
    } catch (error) { sendError(res, error) }
  })

  router.get('/maintenance/:environment', async (req, res) => { try { res.json(await getMaintenanceMode(req.params.environment)) } catch (error) { sendError(res, error) } })

  router.put('/maintenance/:environment', requireStepUp, async (req, res) => {
    try {
      const before = await getMaintenanceMode(req.params.environment)
      const enabled = req.body?.enabled === true
      const message = enabled ? String(req.body?.message || 'Scheduled maintenance is in progress.').trim().slice(0, 500) : null
      if (before.enabled === enabled && before.message === message) return res.json({ ...before, unchanged: true })
      const maintenance = await setMaintenanceMode(req.params.environment, req.body || {}, null)
      const state = await listReleaseState()
      await publishReleaseRealtimeEvent(maintenance.enabled ? 'release.maintenance-enabled' : 'release.maintenance-disabled', releaseRegistryPayload(state, { maintenanceChanged: true }))
      res.json(maintenance)
    } catch (error) { sendError(res, error) }
  })

  router.post('/locks/:environment', requireStepUp, async (req, res) => {
    try {
      const lock = await acquireDeploymentLock(req.params.environment, req.body || {}, null)
      const state = await listReleaseState()
      await publishReleaseRealtimeEvent('release.deployment-locked', releaseRegistryPayload(state, { locked: true }))
      res.status(201).json(lock)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/locks/:environment', requireStepUp, async (req, res) => {
    try {
      const result = await releaseDeploymentLock(req.params.environment, req.body?.lockToken || req.headers['x-deployment-lock'], null)
      const state = await listReleaseState()
      await publishReleaseRealtimeEvent('release.deployment-unlocked', releaseRegistryPayload(state, { unlocked: result.released }))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.get('/:releaseId/plan/:environment', async (req, res) => {
    try {
      const plan = await deploymentPlan(req.params.releaseId, req.params.environment)
      const state = await listReleaseState()
      await publishReleaseRealtimeEvent('release.deployment-planned', releaseRegistryPayload(state, { planned: true, ready: plan.ready, checks: plan.checks }))
      res.json(plan)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:releaseId/promote/:environment', requireStepUp, async (req, res) => {
    try {
      const deployment = await promoteRelease(req.params.releaseId, req.params.environment, req.body || {}, null)
      const state = await listReleaseState()
      await publishReleaseRealtimeEvent('release.promoted', releaseRegistryPayload(state, { promoted: true }))
      res.json(deployment)
    } catch (error) { sendError(res, error) }
  })

  router.post('/rollback/:environment', requireStepUp, async (req, res) => {
    try {
      const rollback = await rollbackRelease(req.params.environment, req.body || {}, null)
      const state = await listReleaseState()
      await publishReleaseRealtimeEvent('release.rolled-back', releaseRegistryPayload(state, { rolledBack: true }))
      res.json(rollback)
    } catch (error) { sendError(res, error) }
  })

  return router
}
