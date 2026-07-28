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

function sendError(res, error) {
  const body = { error: error.message || 'Feature flag request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

function featureFlagRegistryPayload(state = {}, flag = {}, details = {}) {
  const flags = Array.isArray(state.flags) ? state.flags : []
  return {
    flagCount: flags.length,
    enabledFlagCount: flags.filter(item => item.enabled !== false).length,
    killSwitchCount: flags.filter(item => item.killSwitch === true).length,
    enabled: flag.enabled !== false,
    killSwitch: flag.killSwitch === true,
    rolloutPercentage: Number(flag.percentage) || 0,
    environmentCount: Array.isArray(flag.environments) ? flag.environments.length : 0,
    websiteTargetCount: Array.isArray(flag.websiteIds) ? flag.websiteIds.length : 0,
    userTargetCount: Array.isArray(flag.userIds) ? flag.userIds.length : 0,
    excludedWebsiteCount: Array.isArray(flag.excludedWebsiteIds) ? flag.excludedWebsiteIds.length : 0,
    excludedUserCount: Array.isArray(flag.excludedUserIds) ? flag.excludedUserIds.length : 0,
    deleted: details.deleted === true,
    created: details.created === true,
  }
}

function evaluationEventPayload(evaluation = {}) {
  return {
    enabled: evaluation.enabled === true,
    hasWebsiteContext: Boolean(evaluation.context?.websiteId),
    hasUserContext: Boolean(evaluation.context?.userId),
    targeted: ['user-targeted', 'website-targeted'].includes(evaluation.reason),
    percentageBased: ['percentage-rollout', 'percentage-excluded'].includes(evaluation.reason),
    blocked: evaluation.enabled !== true,
  }
}

function batchEvaluationEventPayload(results = {}) {
  const values = Object.values(results)
  return {
    evaluatedCount: values.length,
    enabledCount: values.filter(item => item.enabled === true).length,
    blockedCount: values.filter(item => item.enabled !== true).length,
    targetedCount: values.filter(item => ['user-targeted', 'website-targeted'].includes(item.reason)).length,
  }
}

async function publishFeatureFlagRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function uniqueStrings(value, normaliser = item => String(item).trim()) {
  return [...new Set((Array.isArray(value) ? value : []).map(normaliser).filter(Boolean))]
}

function flagPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name || existing.key || '').trim() !== String(existing.name || '').trim()) return true
  if (Object.hasOwn(input, 'description') && (String(input.description || '').trim().slice(0, 2000) || null) !== (existing.description || null)) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'killSwitch') && (input.killSwitch === true) !== (existing.killSwitch === true)) return true
  if (Object.hasOwn(input, 'percentage') && Math.min(100, Math.max(0, Number(input.percentage))) !== Number(existing.percentage)) return true
  if (Object.hasOwn(input, 'environments') && JSON.stringify(uniqueStrings(input.environments, item => String(item).trim().toLowerCase())) !== JSON.stringify(existing.environments || [])) return true
  if (Object.hasOwn(input, 'websiteIds') && JSON.stringify(uniqueStrings(input.websiteIds, item => String(item).trim().toLowerCase())) !== JSON.stringify(existing.websiteIds || [])) return true
  if (Object.hasOwn(input, 'userIds') && JSON.stringify(uniqueStrings(input.userIds, item => String(item).trim().toLowerCase())) !== JSON.stringify(existing.userIds || [])) return true
  if (Object.hasOwn(input, 'excludedWebsiteIds') && JSON.stringify(uniqueStrings(input.excludedWebsiteIds, item => String(item).trim().toLowerCase())) !== JSON.stringify(existing.excludedWebsiteIds || [])) return true
  if (Object.hasOwn(input, 'excludedUserIds') && JSON.stringify(uniqueStrings(input.excludedUserIds, item => String(item).trim().toLowerCase())) !== JSON.stringify(existing.excludedUserIds || [])) return true
  return false
}

export function createFeatureFlagRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => {
    try { res.json(await getFeatureFlagState(req.query)) } catch (error) { sendError(res, error) }
  })

  router.put('/:flagKey', async (req, res) => {
    try {
      const input = req.body || {}
      const state = await getFeatureFlagState({ limit: 1 })
      const existing = state.flags.find(item => item.key === req.params.flagKey)
      if (!flagPatchChanges(existing, input)) return res.json(existing)
      const flag = await upsertFeatureFlag({ ...input, key: req.params.flagKey }, null)
      const updatedState = await getFeatureFlagState({ limit: 1 })
      await publishFeatureFlagRealtimeEvent('feature-flag.updated', featureFlagRegistryPayload(updatedState, flag, { created: !existing }))
      res.json(flag)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/:flagKey', async (req, res) => {
    try {
      const state = await getFeatureFlagState({ limit: 1 })
      const existing = state.flags.find(item => item.key === req.params.flagKey)
      if (!existing) return res.json({ deleted: false, key: req.params.flagKey })
      const result = await deleteFeatureFlag(req.params.flagKey, null)
      const updatedState = await getFeatureFlagState({ limit: 1 })
      await publishFeatureFlagRealtimeEvent('feature-flag.deleted', featureFlagRegistryPayload(updatedState, {}, result))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:flagKey/kill-switch', async (req, res) => {
    try {
      const state = await getFeatureFlagState({ limit: 1 })
      const existing = state.flags.find(item => item.key === req.params.flagKey)
      if (!existing) return res.status(404).json({ error: 'Feature flag not found' })
      const enabled = req.body?.enabled === true
      if ((existing.killSwitch === true) === enabled) return res.json(existing)
      const flag = await setFeatureFlagKillSwitch(req.params.flagKey, enabled, null)
      const updatedState = await getFeatureFlagState({ limit: 1 })
      await publishFeatureFlagRealtimeEvent('feature-flag.kill-switch-changed', featureFlagRegistryPayload(updatedState, flag))
      res.json(flag)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:flagKey/evaluate', async (req, res) => {
    try {
      const evaluation = await evaluateFeatureFlag(req.params.flagKey, req.body || {})
      await publishFeatureFlagRealtimeEvent('feature-flag.evaluated', evaluationEventPayload(evaluation))
      res.json(evaluation)
    } catch (error) { sendError(res, error) }
  })

  router.post('/evaluate/batch', async (req, res) => {
    try {
      const keys = Array.isArray(req.body?.keys) ? req.body.keys : []
      if (keys.length === 0) return res.json({})
      const results = await evaluateFeatureFlags(keys, req.body?.context || {})
      await publishFeatureFlagRealtimeEvent('feature-flag.batch-evaluated', batchEvaluationEventPayload(results))
      res.json(results)
    } catch (error) { sendError(res, error) }
  })

  return router
}
