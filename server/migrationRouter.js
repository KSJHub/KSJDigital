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
function actor(req) { return { id: req.session?.userId || null, email: req.session?.email || null } }
function sendError(res, error) {
  const body = { error: error.message || 'Migration request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createMigrationRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => {
    try { res.json(await listMigrationState(req.query)) } catch (error) { sendError(res, error) }
  })
  router.post('/', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const migration = await registerMigration(req.body || {}, requestedBy)
      await publishDomainEvent('migration.registered', {
        migrationId: migration.id,
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
        upOperations: migration.up.length,
        downOperations: migration.down.length,
      }, requestedBy)
      res.status(201).json(migration)
    } catch (error) { sendError(res, error) }
  })
  router.get('/:migrationId/plan', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const plan = await migrationPlan(req.params.migrationId, req.query.direction || 'up')
      await publishDomainEvent('migration.planned', {
        migrationId: plan.migration.id,
        version: plan.migration.version,
        direction: plan.direction,
        ready: plan.ready,
        changedFiles: plan.changedFiles,
        changedOperations: plan.changes.filter(item => item.changed).length,
      }, requestedBy)
      res.json(plan)
    } catch (error) { sendError(res, error) }
  })
  router.post('/:migrationId/execute', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const execution = await executeMigration(req.params.migrationId, req.body || {}, requestedBy)
      await publishDomainEvent(execution.direction === 'up' ? 'migration.applied' : 'migration.rolled-back', {
        migrationId: execution.migrationId,
        version: execution.version,
        direction: execution.direction,
        status: execution.status,
        backupId: execution.backupId,
        changedFiles: execution.changedFiles,
        changes: execution.changes,
        executedAt: execution.executedAt,
      }, requestedBy)
      res.json(execution)
    } catch (error) { sendError(res, error) }
  })
  router.post('/locks/:scope', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const lock = await acquireMigrationLock(req.params.scope, req.body || {}, requestedBy)
      await publishDomainEvent('migration.locked', {
        scope: lock.scope,
        owner: lock.owner,
        acquiredAt: lock.acquiredAt,
        expiresAt: lock.expiresAt,
      }, requestedBy)
      res.status(201).json(lock)
    } catch (error) { sendError(res, error) }
  })
  router.delete('/locks/:scope', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const released = await releaseMigrationLock(req.params.scope, req.body?.lockToken || req.headers['x-migration-lock'], requestedBy)
      await publishDomainEvent('migration.unlocked', {
        scope: released.scope,
        released: released.released,
      }, requestedBy)
      res.json(released)
    } catch (error) { sendError(res, error) }
  })
  router.put('/retention/:policyId', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const policy = await upsertRetentionPolicy({ ...(req.body || {}), id: req.params.policyId }, requestedBy)
      await publishDomainEvent('retention.policy-updated', {
        policyId: policy.id,
        name: policy.name,
        file: policy.file,
        arrayKey: policy.arrayKey,
        dateKey: policy.dateKey,
        retentionDays: policy.retentionDays,
        enabled: policy.enabled,
      }, requestedBy)
      res.json(policy)
    } catch (error) { sendError(res, error) }
  })
  router.get('/retention/:policyId/plan', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const plan = await retentionPlan(req.params.policyId)
      await publishDomainEvent('retention.planned', {
        policyId: plan.policy.id,
        total: plan.total,
        removable: plan.removable,
        retained: plan.retained,
        cutoff: plan.cutoff,
      }, requestedBy)
      res.json(plan)
    } catch (error) { sendError(res, error) }
  })
  router.post('/retention/:policyId/execute', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const execution = await executeRetention(req.params.policyId, req.body || {}, requestedBy)
      await publishDomainEvent('retention.executed', {
        policyId: execution.policyId,
        removed: execution.removed,
        retained: execution.retained,
        cutoff: execution.cutoff,
        backupId: execution.backupId,
        status: execution.status,
        executedAt: execution.executedAt,
      }, requestedBy)
      res.json(execution)
    } catch (error) { sendError(res, error) }
  })

  return router
}
