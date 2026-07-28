import express from 'express'
import {
  createComplianceReport,
  deleteLegalHold,
  deleteRetentionPolicy,
  executeRetentionPolicy,
  getRetentionState,
  previewRetentionPolicy,
  runRetentionCycle,
  upsertLegalHold,
  upsertRetentionPolicy,
} from './services/retentionComplianceService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}

function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

function retentionRegistryPayload(state = {}, subject = {}, details = {}) {
  const policies = Array.isArray(state.policies) ? state.policies : []
  const legalHolds = Array.isArray(state.legalHolds) ? state.legalHolds : []
  const runs = Array.isArray(state.runs) ? state.runs : []
  return {
    policyCount: policies.length,
    enabledPolicyCount: policies.filter(item => item.enabled !== false).length,
    legalHoldCount: legalHolds.length,
    activeLegalHoldCount: legalHolds.filter(item => item.enabled !== false && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now())).length,
    runCount: runs.length,
    enabled: subject.enabled !== false,
    retentionDays: Number(subject.retentionDays) || 0,
    recordCount: Array.isArray(subject.recordIds) ? subject.recordIds.length : 0,
    candidateCount: Number(subject.candidateCount) || 0,
    heldCount: Number(subject.heldCount ?? details.heldCount) || 0,
    purgedCount: Number(subject.purgedCount ?? details.purgedCount) || 0,
    processedCount: Number(subject.processed ?? details.processed) || 0,
    hasExpiry: Boolean(subject.expiresAt),
    created: details.created === true,
    deleted: details.deleted === true,
    previewed: details.previewed === true,
    executed: details.executed === true,
    reportGenerated: details.reportGenerated === true,
  }
}

async function publishRetentionComplianceRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function normaliseRecordIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => String(item).trim()).filter(Boolean))].slice(0, 10000)
}

function retentionPolicyPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name ?? existing.id).trim().slice(0, 200) !== String(existing.name || '')) return true
  if (Object.hasOwn(input, 'websiteId') && String(input.websiteId) !== String(existing.websiteId)) return true
  if (Object.hasOwn(input, 'resourceType') && String(input.resourceType) !== String(existing.resourceType)) return true
  if (Object.hasOwn(input, 'retentionDays') && Math.min(36500, Math.max(1, Number(input.retentionDays))) !== Number(existing.retentionDays)) return true
  if (Object.hasOwn(input, 'timestampField') && String(input.timestampField).trim() !== String(existing.timestampField)) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'priority') && Math.min(10000, Math.max(-10000, Number(input.priority))) !== Number(existing.priority)) return true
  return false
}

function legalHoldPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name ?? existing.id).trim().slice(0, 200) !== String(existing.name || '')) return true
  if (Object.hasOwn(input, 'websiteId') && String(input.websiteId) !== String(existing.websiteId)) return true
  if (Object.hasOwn(input, 'resourceType') && String(input.resourceType) !== String(existing.resourceType)) return true
  if (Object.hasOwn(input, 'recordIds') && JSON.stringify(normaliseRecordIds(input.recordIds)) !== JSON.stringify(existing.recordIds || [])) return true
  if (Object.hasOwn(input, 'reason') && String(input.reason || '').trim() !== String(existing.reason || '')) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'expiresAt')) {
    const requested = input.expiresAt ? new Date(input.expiresAt).toISOString() : null
    if (requested !== (existing.expiresAt || null)) return true
  }
  return false
}

export function createRetentionComplianceRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getRetentionState(req.query)))

  router.get('/report', (req, res, next) => handle(res, next, async () => {
    const report = await createComplianceReport()
    const state = await getRetentionState({ limit: 1000 })
    await publishRetentionComplianceRealtimeEvent('retention-compliance.report-generated', retentionRegistryPayload(state, {}, { reportGenerated: true }))
    return report
  }))

  router.put('/policies/:policyId', (req, res, next) => handle(res, next, async () => {
    const input = req.body || {}
    const state = await getRetentionState({ limit: 1000 })
    const existing = state.policies.find(item => item.id === req.params.policyId)
    if (!retentionPolicyPatchChanges(existing, input)) return existing
    const policy = await upsertRetentionPolicy({ ...input, id: req.params.policyId }, null)
    const updatedState = await getRetentionState({ limit: 1000 })
    await publishRetentionComplianceRealtimeEvent('retention-compliance.policy-updated', retentionRegistryPayload(updatedState, policy, { created: !existing }))
    return policy
  }))

  router.delete('/policies/:policyId', (req, res, next) => handle(res, next, async () => {
    const state = await getRetentionState({ limit: 1000 })
    const existing = state.policies.find(item => item.id === req.params.policyId)
    if (!existing) return { deleted: false, id: req.params.policyId }
    const result = await deleteRetentionPolicy(req.params.policyId, null)
    const updatedState = await getRetentionState({ limit: 1000 })
    await publishRetentionComplianceRealtimeEvent('retention-compliance.policy-deleted', retentionRegistryPayload(updatedState, {}, result))
    return result
  }))

  router.post('/policies/:policyId/preview', (req, res, next) => handle(res, next, async () => {
    const preview = await previewRetentionPolicy(req.params.policyId)
    const state = await getRetentionState({ limit: 1000 })
    await publishRetentionComplianceRealtimeEvent('retention-compliance.policy-previewed', retentionRegistryPayload(state, preview, { previewed: true }))
    return preview
  }))

  router.post('/policies/:policyId/execute', (req, res, next) => handle(res, next, async () => {
    const run = await executeRetentionPolicy(req.params.policyId, null)
    if (run.noop === true) return run
    const state = await getRetentionState({ limit: 1000 })
    await publishRetentionComplianceRealtimeEvent('retention-compliance.policy-executed', retentionRegistryPayload(state, run, { executed: true }))
    return run
  }))

  router.put('/legal-holds/:legalHoldId', (req, res, next) => handle(res, next, async () => {
    const input = req.body || {}
    const state = await getRetentionState({ limit: 1000 })
    const existing = state.legalHolds.find(item => item.id === req.params.legalHoldId)
    if (!legalHoldPatchChanges(existing, input)) return existing
    const hold = await upsertLegalHold({ ...input, id: req.params.legalHoldId }, null)
    const updatedState = await getRetentionState({ limit: 1000 })
    await publishRetentionComplianceRealtimeEvent('retention-compliance.legal-hold-updated', retentionRegistryPayload(updatedState, hold, { created: !existing }))
    return hold
  }))

  router.delete('/legal-holds/:legalHoldId', (req, res, next) => handle(res, next, async () => {
    const state = await getRetentionState({ limit: 1000 })
    const existing = state.legalHolds.find(item => item.id === req.params.legalHoldId)
    if (!existing) return { deleted: false, id: req.params.legalHoldId }
    const result = await deleteLegalHold(req.params.legalHoldId, null)
    const updatedState = await getRetentionState({ limit: 1000 })
    await publishRetentionComplianceRealtimeEvent('retention-compliance.legal-hold-deleted', retentionRegistryPayload(updatedState, {}, result))
    return result
  }))

  router.post('/run', (req, res, next) => handle(res, next, async () => {
    const cycle = await runRetentionCycle({ actor: null })
    if (cycle.processed === 0) return cycle
    const state = await getRetentionState({ limit: 1000 })
    await publishRetentionComplianceRealtimeEvent('retention-compliance.cycle-run', retentionRegistryPayload(state, {}, {
      processed: cycle.processed,
      purgedCount: cycle.results.reduce((total, run) => total + run.purgedCount, 0),
      heldCount: cycle.results.reduce((total, run) => total + run.heldCount, 0),
    }))
    return cycle
  }))

  return router
}
