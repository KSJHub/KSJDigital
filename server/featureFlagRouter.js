import express from 'express'
import {
  deleteFeatureFlag,
  evaluateFeatureFlag,
  evaluateFeatureFlags,
  getFeatureFlagState,
  setFeatureFlagKillSwitch,
  upsertFeatureFlag,
} from './services/featureFlagService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function actor(req) { return { id: req.session?.userId || null, email: req.session?.email || null, role: req.session?.role || null } }
function sendError(res, error) {
  const body = { error: error.message || 'Feature flag request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createFeatureFlagRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => { try { res.json(await getFeatureFlagState(req.query)) } catch (error) { sendError(res, error) } })
  router.put('/:flagKey', async (req, res) => {
    try {
      const currentActor = actor(req)
      const flag = await upsertFeatureFlag({ ...req.body, key: req.params.flagKey }, currentActor)
      await publishDomainEvent('feature-flag.updated', {
        accountId: currentActor.id,
        flagKey: flag.key,
        enabled: flag.enabled,
        killSwitch: flag.killSwitch,
        percentage: flag.percentage,
        environments: flag.environments,
        websiteTargetCount: flag.websiteIds.length,
        userTargetCount: flag.userIds.length,
        excludedWebsiteCount: flag.excludedWebsiteIds.length,
        excludedUserCount: flag.excludedUserIds.length,
        updatedAt: flag.updatedAt,
      }, currentActor)
      res.json(flag)
    } catch (error) { sendError(res, error) }
  })
  router.delete('/:flagKey', async (req, res) => {
    try {
      const currentActor = actor(req)
      const result = await deleteFeatureFlag(req.params.flagKey, currentActor)
      await publishDomainEvent('feature-flag.deleted', { accountId: currentActor.id, flagKey: result.key, deleted: result.deleted }, currentActor)
      res.json(result)
    } catch (error) { sendError(res, error) }
  })
  router.post('/:flagKey/kill-switch', async (req, res) => {
    try {
      const currentActor = actor(req)
      const flag = await setFeatureFlagKillSwitch(req.params.flagKey, req.body?.enabled === true, currentActor)
      await publishDomainEvent('feature-flag.kill-switch-changed', { accountId: currentActor.id, flagKey: flag.key, enabled: flag.killSwitch, updatedAt: flag.updatedAt }, currentActor)
      res.json(flag)
    } catch (error) { sendError(res, error) }
  })
  router.post('/:flagKey/evaluate', async (req, res) => {
    try {
      const currentActor = actor(req)
      const evaluation = await evaluateFeatureFlag(req.params.flagKey, req.body || {})
      await publishDomainEvent('feature-flag.evaluated', {
        accountId: currentActor.id,
        flagKey: evaluation.key,
        enabled: evaluation.enabled,
        reason: evaluation.reason,
        environment: evaluation.context.environment,
        hasWebsiteContext: Boolean(evaluation.context.websiteId),
        hasUserContext: Boolean(evaluation.context.userId),
        evaluatedAt: evaluation.evaluatedAt,
      }, currentActor)
      res.json(evaluation)
    } catch (error) { sendError(res, error) }
  })
  router.post('/evaluate/batch', async (req, res) => {
    try {
      const currentActor = actor(req)
      const results = await evaluateFeatureFlags(req.body?.keys || [], req.body?.context || {})
      const values = Object.values(results)
      await publishDomainEvent('feature-flag.batch-evaluated', {
        accountId: currentActor.id,
        evaluatedCount: values.length,
        enabledCount: values.filter(item => item.enabled).length,
        environment: values[0]?.context?.environment || String(req.body?.context?.environment || process.env.NODE_ENV || 'development'),
        evaluatedAt: new Date().toISOString(),
      }, currentActor)
      res.json(results)
    } catch (error) { sendError(res, error) }
  })

  return router
}
