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
  router.get('/report', (req, res, next) => handle(res, next, () => createComplianceReport()))
  router.put('/policies/:policyId', (req, res, next) => handle(res, next, () => upsertRetentionPolicy({ ...req.body, id: req.params.policyId }, actor(req))))
  router.delete('/policies/:policyId', (req, res, next) => handle(res, next, () => deleteRetentionPolicy(req.params.policyId, actor(req))))
  router.post('/policies/:policyId/preview', (req, res, next) => handle(res, next, () => previewRetentionPolicy(req.params.policyId)))
  router.post('/policies/:policyId/execute', (req, res, next) => handle(res, next, () => executeRetentionPolicy(req.params.policyId, actor(req))))
  router.put('/legal-holds/:legalHoldId', (req, res, next) => handle(res, next, () => upsertLegalHold({ ...req.body, id: req.params.legalHoldId }, actor(req))))
  router.delete('/legal-holds/:legalHoldId', (req, res, next) => handle(res, next, () => deleteLegalHold(req.params.legalHoldId, actor(req))))
  router.post('/run', (req, res, next) => handle(res, next, () => runRetentionCycle({ actor: actor(req) })))
  return router
}
