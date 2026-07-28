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

function sendError(res, error) {
  const body = { error: error.message || 'Configuration request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

function configurationRegistryPayload(configuration = {}, details = {}) {
  const values = configuration.values && typeof configuration.values === 'object' ? configuration.values : {}
  const secrets = Array.isArray(configuration.secrets) ? configuration.secrets : []
  const checks = Array.isArray(details.checks) ? details.checks : []
  return {
    configuredValueCount: Object.values(values).filter(value => value !== null && value !== undefined).length,
    secretCount: secrets.length,
    configuredSecretCount: secrets.filter(secret => secret.configured === true).length,
    checkCount: checks.length,
    failedCheckCount: checks.filter(check => check.status === 'failed').length,
    warningCheckCount: checks.filter(check => check.status === 'warning').length,
    validationErrorCount: Number(details.validationErrorCount) || 0,
    validationWarningCount: Number(details.validationWarningCount) || 0,
    changedValueCount: Number(details.changedValueCount) || 0,
    restartRequiredCount: Number(details.restartRequiredCount) || 0,
    valid: details.valid === true,
    ready: details.ready === true,
    updated: details.updated === true,
    activated: details.activated === true,
    secretUpdated: details.secretUpdated === true,
    secretDeleted: details.secretDeleted === true,
  }
}

async function publishConfigurationRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function requestedConfigurationValues(input = {}) {
  return input.values && typeof input.values === 'object' ? input.values : input
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
      const validation = await validateConfiguration(req.query.environment)
      const configuration = await getConfiguration(validation.environment)
      await publishConfigurationRealtimeEvent('configuration.validated', configurationRegistryPayload(configuration, {
        valid: validation.valid,
        validationErrorCount: validation.errors.length,
        validationWarningCount: validation.warnings.length,
      }))
      res.json(validation)
    } catch (error) { sendError(res, error) }
  })

  router.get('/deployment-readiness', async (req, res) => {
    try {
      const readiness = await deploymentReadiness(req.query.environment || 'production')
      const configuration = await getConfiguration(readiness.environment)
      await publishConfigurationRealtimeEvent('configuration.deployment-readiness-checked', configurationRegistryPayload(configuration, {
        ready: readiness.ready,
        checks: readiness.checks,
      }))
      res.json(readiness)
    } catch (error) { sendError(res, error) }
  })

  router.patch('/environments/:environment', async (req, res) => {
    try {
      const before = await getConfiguration(req.params.environment)
      const requested = requestedConfigurationValues(req.body || {})
      const changedValueCount = Object.entries(requested).filter(([key, value]) => JSON.stringify(before.values?.[key]) !== JSON.stringify(value)).length
      if (changedValueCount === 0) return res.json({ environment: before.environment, values: before.values, restartRequired: [], version: before.version })
      const configuration = await updateConfiguration(req.params.environment, req.body || {}, null)
      const state = await getConfiguration(req.params.environment)
      await publishConfigurationRealtimeEvent('configuration.updated', configurationRegistryPayload(state, {
        updated: true,
        changedValueCount,
        restartRequiredCount: configuration.restartRequired.length,
      }))
      res.json(configuration)
    } catch (error) { sendError(res, error) }
  })

  router.post('/environments/:environment/activate', async (req, res) => {
    try {
      const before = await getConfiguration(req.params.environment)
      if (before.activeEnvironment === before.environment) return res.json({ previous: before.environment, environment: before.environment, unchanged: true })
      const activation = await activateEnvironment(req.params.environment, null)
      const state = await getConfiguration(req.params.environment)
      await publishConfigurationRealtimeEvent('configuration.environment-activated', configurationRegistryPayload(state, { activated: true }))
      res.json(activation)
    } catch (error) { sendError(res, error) }
  })

  router.put('/secrets/:name', async (req, res) => {
    try {
      const configuration = await getConfiguration()
      const existing = configuration.secrets.find(secret => secret.name === req.params.name)
      if (req.body?.source === 'environment' && existing?.source === 'environment' && existing.environment === String(req.body.environment || req.params.name).trim()) return res.json(existing)
      const secret = await setSecret(req.params.name, req.body || {}, null)
      const state = await getConfiguration()
      await publishConfigurationRealtimeEvent('configuration.secret-updated', configurationRegistryPayload(state, { secretUpdated: true }))
      res.json(secret)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/secrets/:name', async (req, res) => {
    try {
      const configuration = await getConfiguration()
      if (!configuration.secrets.some(secret => secret.name === req.params.name)) return res.json({ deleted: false, name: req.params.name })
      const result = await deleteSecret(req.params.name, null)
      const state = await getConfiguration()
      await publishConfigurationRealtimeEvent('configuration.secret-deleted', configurationRegistryPayload(state, { secretDeleted: result.deleted }))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  return router
}
