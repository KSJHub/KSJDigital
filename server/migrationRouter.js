import express from 'express'
import {
  acquireMigrationLock,
  executeMigration,
  executeRetention,
  listMigrationState,
  migrationPlan,
  registerMigration,
  releaseMigrationLock,
  retentionPlan,
  upsertRetentionPolicy,
} from './services/migrationService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function sendError(res, error) {
  const body = { error: error.message || 'Migration request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

function migrationRegistryPayload(state = {}, details = {}) {
  const definitions = Array.isArray(state.definitions) ? state.definitions : []
  const applied = Array.isArray(state.applied) ? state.applied : []
  const rollbacks = Array.isArray(state.rollbacks) ? state.rollbacks : []
  const locks = state.locks && typeof state.locks === 'object' ? Object.values(state.locks) : []
  const policies = Array.isArray(state.retentionPolicies) ? state.retentionPolicies : []
  const runs = Array.isArray(state.retentionRuns) ? state.retentionRuns : []
  const checks = Array.isArray(details.checks) ? details.checks : []
  return {
    definitionCount: definitions.length,
    appliedCount: applied.filter(item => item.status === 'applied').length,
    rollbackCount: rollbacks.length,
    lockCount: locks.length,
    retentionPolicyCount: policies.length,
    enabledRetentionPolicyCount: policies.filter(policy => policy.enabled === true).length,
    retentionRunCount: runs.length,
    operationCount: Number(details.operationCount) || 0,
    changedOperationCount: Number(details.changedOperationCount) || 0,
    changedFileCount: Number(details.changedFileCount) || 0,
    removableCount: Number(details.removableCount) || 0,
    retainedCount: Number(details.retainedCount) || 0,
    checkCount: checks.length,
    failedCheckCount: checks.filter(check => check.status === 'failed').length,
    ready: details.ready === true,
    registered: details.registered === true,
    planned: details.planned === true,
    executed: details.executed === true,
    rolledBack: details.rolledBack === true,
    locked: details.locked === true,
    unlocked: details.unlocked === true,
    policyChanged: details.policyChanged === true,
    retentionPlanned: details.retentionPlanned === true,
    retentionExecuted: details.retentionExecuted === true,
  }
}

async function publishMigrationRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export function createMigrationRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => {
    try { res.json(await listMigrationState(req.query)) } catch (error) { sendError(res, error) }
  })
  router.post('/', async (req, res) => {
    try {
      const migration = await registerMigration(req.body || {}, null)
      const state = await listMigrationState()
      await publishMigrationRealtimeEvent('migration.registered', migrationRegistryPayload(state, {
        registered: true,
        operationCount: migration.up.length + migration.down.length,
      }))
      res.status(201).json(migration)
    } catch (error) { sendError(res, error) }
  })
  router.get('/:migrationId/plan', async (req, res) => {
    try {
      const plan = await migrationPlan(req.params.migrationId, req.query.direction || 'up')
      const state = await listMigrationState()
      await publishMigrationRealtimeEvent('migration.planned', migrationRegistryPayload(state, {
        planned: true,
        ready: plan.ready,
        checks: plan.checks,
        operationCount: plan.changes.length,
        changedOperationCount: plan.changes.filter(item => item.changed).length,
        changedFileCount: plan.changedFiles.length,
      }))
      res.json(plan)
    } catch (error) { sendError(res, error) }
  })
  router.post('/:migrationId/execute', async (req, res) => {
    try {
      const execution = await executeMigration(req.params.migrationId, req.body || {}, null)
      const state = await listMigrationState()
      await publishMigrationRealtimeEvent(execution.direction === 'up' ? 'migration.applied' : 'migration.rolled-back', migrationRegistryPayload(state, {
        executed: execution.direction === 'up',
        rolledBack: execution.direction === 'down',
        changedOperationCount: execution.changes,
        changedFileCount: execution.changedFiles.length,
      }))
      res.json(execution)
    } catch (error) { sendError(res, error) }
  })
  router.post('/locks/:scope', async (req, res) => {
    try {
      const lock = await acquireMigrationLock(req.params.scope, req.body || {}, null)
      const state = await listMigrationState()
      await publishMigrationRealtimeEvent('migration.locked', migrationRegistryPayload(state, { locked: true }))
      res.status(201).json(lock)
    } catch (error) { sendError(res, error) }
  })
  router.delete('/locks/:scope', async (req, res) => {
    try {
      const released = await releaseMigrationLock(req.params.scope, req.body?.lockToken || req.headers['x-migration-lock'], null)
      const state = await listMigrationState()
      await publishMigrationRealtimeEvent('migration.unlocked', migrationRegistryPayload(state, { unlocked: released.released }))
      res.json(released)
    } catch (error) { sendError(res, error) }
  })
  router.put('/retention/:policyId', async (req, res) => {
    try {
      const policy = await upsertRetentionPolicy({ ...(req.body || {}), id: req.params.policyId }, null)
      if (policy.unchanged) return res.json(policy)
      const state = await listMigrationState()
      await publishMigrationRealtimeEvent('retention.policy-updated', migrationRegistryPayload(state, { policyChanged: true }))
      res.json(policy)
    } catch (error) { sendError(res, error) }
  })
  router.get('/retention/:policyId/plan', async (req, res) => {
    try {
      const plan = await retentionPlan(req.params.policyId)
      const state = await listMigrationState()
      await publishMigrationRealtimeEvent('retention.planned', migrationRegistryPayload(state, {
        retentionPlanned: true,
        removableCount: plan.removable,
        retainedCount: plan.retained,
      }))
      res.json(plan)
    } catch (error) { sendError(res, error) }
  })
  router.post('/retention/:policyId/execute', async (req, res) => {
    try {
      const execution = await executeRetention(req.params.policyId, req.body || {}, null)
      if (execution.noop) return res.json(execution)
      const state = await listMigrationState()
      await publishMigrationRealtimeEvent('retention.executed', migrationRegistryPayload(state, {
        retentionExecuted: true,
        removableCount: execution.removed,
        retainedCount: execution.retained,
      }))
      res.json(execution)
    } catch (error) { sendError(res, error) }
  })

  return router
}
