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
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

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
    try {
      const requestedBy = actor(req)
      const validation = await validateConfiguration(req.query.environment)
      await publishDomainEvent('configuration.validated', {
        environment: validation.environment,
        valid: validation.valid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        checkedAt: validation.checkedAt,
      }, requestedBy)
      res.json(validation)
    } catch (error) { sendError(res, error) }
  })

  router.get('/deployment-readiness', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const readiness = await deploymentReadiness(req.query.environment || 'production')
      await publishDomainEvent('configuration.deployment-readiness-checked', {
        environment: readiness.environment,
        ready: readiness.ready,
        failedChecks: readiness.checks.filter(check => check.status === 'failed').map(check => check.id),
        warningChecks: readiness.checks.filter(check => check.status === 'warning').map(check => check.id),
        checkedAt: readiness.checkedAt,
      }, requestedBy)
      res.json(readiness)
    } catch (error) { sendError(res, error) }
  })

  router.patch('/environments/:environment', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const configuration = await updateConfiguration(req.params.environment, req.body || {}, requestedBy)
      await publishDomainEvent('configuration.updated', {
        environment: configuration.environment,
        changedKeys: Object.keys(req.body?.values && typeof req.body.values === 'object' ? req.body.values : req.body || {}),
        restartRequired: configuration.restartRequired,
        version: configuration.version,
      }, requestedBy)
      res.json(configuration)
    } catch (error) { sendError(res, error) }
  })

  router.post('/environments/:environment/activate', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const activation = await activateEnvironment(req.params.environment, requestedBy)
      await publishDomainEvent('configuration.environment-activated', {
        previousEnvironment: activation.previous,
        environment: activation.environment,
        activatedAt: activation.activatedAt,
      }, requestedBy)
      res.json(activation)
    } catch (error) { sendError(res, error) }
  })

  router.put('/secrets/:name', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const secret = await setSecret(req.params.name, req.body || {}, requestedBy)
      await publishDomainEvent('configuration.secret-updated', {
        secretName: secret.name,
        source: secret.source,
        configured: secret.configured,
        environmentVariable: secret.environment || null,
        updatedAt: secret.updatedAt,
      }, requestedBy)
      res.json(secret)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/secrets/:name', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const result = await deleteSecret(req.params.name, requestedBy)
      await publishDomainEvent('configuration.secret-deleted', {
        secretName: result.name,
        deleted: result.deleted,
      }, requestedBy)
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  return router
}
