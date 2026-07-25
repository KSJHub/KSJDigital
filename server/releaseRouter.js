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
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

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

  router.post('/', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const release = await createRelease(req.body || {}, requestedBy)
      await publishDomainEvent('release.created', {
        releaseId: release.id,
        version: release.version,
        status: release.status,
        commitSha: release.source?.commitSha || null,
        branch: release.source?.branch || null,
        artifactName: release.artifact?.name || null,
        artifactSize: release.artifact?.size || null,
      }, requestedBy)
      res.status(201).json(release)
    } catch (error) { sendError(res, error) }
  })

  router.get('/maintenance/:environment', async (req, res) => { try { res.json(await getMaintenanceMode(req.params.environment)) } catch (error) { sendError(res, error) } })

  router.put('/maintenance/:environment', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const state = await setMaintenanceMode(req.params.environment, req.body || {}, requestedBy)
      await publishDomainEvent(state.enabled ? 'release.maintenance-enabled' : 'release.maintenance-disabled', {
        environment: state.environment,
        enabled: state.enabled,
        message: state.message,
        enabledAt: state.enabledAt,
      }, requestedBy)
      res.json(state)
    } catch (error) { sendError(res, error) }
  })

  router.post('/locks/:environment', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const lock = await acquireDeploymentLock(req.params.environment, req.body || {}, requestedBy)
      await publishDomainEvent('release.deployment-locked', {
        environment: lock.environment,
        owner: lock.owner,
        acquiredAt: lock.acquiredAt,
        expiresAt: lock.expiresAt,
      }, requestedBy)
      res.status(201).json(lock)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/locks/:environment', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const result = await releaseDeploymentLock(req.params.environment, req.body?.lockToken || req.headers['x-deployment-lock'], requestedBy)
      await publishDomainEvent('release.deployment-unlocked', {
        environment: result.environment,
        released: result.released,
      }, requestedBy)
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.get('/:releaseId/plan/:environment', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const plan = await deploymentPlan(req.params.releaseId, req.params.environment)
      await publishDomainEvent('release.deployment-planned', {
        releaseId: plan.release.id,
        version: plan.release.version,
        environment: plan.environment,
        currentReleaseId: plan.currentReleaseId,
        ready: plan.ready,
        checks: plan.checks,
        plannedAt: plan.plannedAt,
      }, requestedBy)
      res.json(plan)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:releaseId/promote/:environment', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const deployment = await promoteRelease(req.params.releaseId, req.params.environment, req.body || {}, requestedBy)
      await publishDomainEvent('release.promoted', {
        deploymentId: deployment.id,
        releaseId: deployment.releaseId,
        version: deployment.version,
        environment: deployment.environment,
        previousReleaseId: deployment.previousReleaseId,
        backupId: deployment.backupId,
        status: deployment.status,
        completedAt: deployment.completedAt,
      }, requestedBy)
      res.json(deployment)
    } catch (error) { sendError(res, error) }
  })

  router.post('/rollback/:environment', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const rollback = await rollbackRelease(req.params.environment, req.body || {}, requestedBy)
      await publishDomainEvent('release.rolled-back', {
        rollbackId: rollback.id,
        environment: rollback.environment,
        fromReleaseId: rollback.fromReleaseId,
        toReleaseId: rollback.toReleaseId,
        backupId: rollback.backupId,
        restoreId: rollback.restoreId,
        status: rollback.status,
        rolledBackAt: rollback.rolledBackAt,
      }, requestedBy)
      res.json(rollback)
    } catch (error) { sendError(res, error) }
  })

  return router
}
