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
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) { Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next) }

export function createRetentionComplianceRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getRetentionState(req.query)))
  router.get('/report', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const report = await createComplianceReport()
      await publishDomainEvent('retention-compliance.report-generated', {
        accountId: currentActor.id,
        generatedAt: report.generatedAt,
        policyCount: report.policyCount,
        enabledPolicyCount: report.enabledPolicyCount,
        activeLegalHoldCount: report.activeLegalHoldCount,
        statistics: report.statistics,
      }, currentActor)
      return report
    })
  })
  router.put('/policies/:policyId', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const policy = await upsertRetentionPolicy({ ...req.body, id: req.params.policyId }, currentActor)
      await publishDomainEvent('retention-compliance.policy-updated', {
        accountId: currentActor.id,
        policyId: policy.id,
        websiteId: policy.websiteId,
        resourceType: policy.resourceType,
        retentionDays: policy.retentionDays,
        timestampField: policy.timestampField,
        enabled: policy.enabled,
        priority: policy.priority,
        updatedAt: policy.updatedAt,
      }, currentActor)
      return policy
    })
  })
  router.delete('/policies/:policyId', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const result = await deleteRetentionPolicy(req.params.policyId, currentActor)
      await publishDomainEvent('retention-compliance.policy-deleted', { accountId: currentActor.id, policyId: result.id, deleted: result.deleted }, currentActor)
      return result
    })
  })
  router.post('/policies/:policyId/preview', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const preview = await previewRetentionPolicy(req.params.policyId)
      await publishDomainEvent('retention-compliance.policy-previewed', {
        accountId: currentActor.id,
        policyId: preview.policy.id,
        websiteId: preview.policy.websiteId,
        resourceType: preview.policy.resourceType,
        cutoff: preview.cutoff,
        candidateCount: preview.candidateCount,
        heldCount: preview.heldCount,
      }, currentActor)
      return preview
    })
  })
  router.post('/policies/:policyId/execute', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const run = await executeRetentionPolicy(req.params.policyId, currentActor)
      await publishDomainEvent('retention-compliance.policy-executed', {
        accountId: currentActor.id,
        runId: run.id,
        policyId: run.policyId,
        websiteId: run.websiteId,
        resourceType: run.resourceType,
        status: run.status,
        cutoff: run.cutoff,
        purgedCount: run.purgedCount,
        heldCount: run.heldCount,
        createdAt: run.createdAt,
      }, currentActor)
      return run
    })
  })
  router.put('/legal-holds/:legalHoldId', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const hold = await upsertLegalHold({ ...req.body, id: req.params.legalHoldId }, currentActor)
      await publishDomainEvent('retention-compliance.legal-hold-updated', {
        accountId: currentActor.id,
        legalHoldId: hold.id,
        websiteId: hold.websiteId,
        resourceType: hold.resourceType,
        recordCount: hold.recordIds.length,
        enabled: hold.enabled,
        expiresAt: hold.expiresAt,
        updatedAt: hold.updatedAt,
      }, currentActor)
      return hold
    })
  })
  router.delete('/legal-holds/:legalHoldId', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const result = await deleteLegalHold(req.params.legalHoldId, currentActor)
      await publishDomainEvent('retention-compliance.legal-hold-deleted', { accountId: currentActor.id, legalHoldId: result.id, deleted: result.deleted }, currentActor)
      return result
    })
  })
  router.post('/run', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const cycle = await runRetentionCycle({ actor: currentActor })
      await publishDomainEvent('retention-compliance.cycle-run', {
        accountId: currentActor.id,
        processed: cycle.processed,
        runIds: cycle.results.map(run => run.id),
        purgedCount: cycle.results.reduce((total, run) => total + run.purgedCount, 0),
        heldCount: cycle.results.reduce((total, run) => total + run.heldCount, 0),
      }, currentActor)
      return cycle
    })
  })
  return router
}
