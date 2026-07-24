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
    try { res.status(201).json(await registerMigration(req.body || {}, actor(req))) } catch (error) { sendError(res, error) }
  })
  router.get('/:migrationId/plan', async (req, res) => {
    try { res.json(await migrationPlan(req.params.migrationId, req.query.direction || 'up')) } catch (error) { sendError(res, error) }
  })
  router.post('/:migrationId/execute', async (req, res) => {
    try { res.json(await executeMigration(req.params.migrationId, req.body || {}, actor(req))) } catch (error) { sendError(res, error) }
  })
  router.post('/locks/:scope', async (req, res) => {
    try { res.status(201).json(await acquireMigrationLock(req.params.scope, req.body || {}, actor(req))) } catch (error) { sendError(res, error) }
  })
  router.delete('/locks/:scope', async (req, res) => {
    try { res.json(await releaseMigrationLock(req.params.scope, req.body?.lockToken || req.headers['x-migration-lock'], actor(req))) } catch (error) { sendError(res, error) }
  })
  router.put('/retention/:policyId', async (req, res) => {
    try { res.json(await upsertRetentionPolicy({ ...(req.body || {}), id: req.params.policyId }, actor(req))) } catch (error) { sendError(res, error) }
  })
  router.get('/retention/:policyId/plan', async (req, res) => {
    try { res.json(await retentionPlan(req.params.policyId)) } catch (error) { sendError(res, error) }
  })
  router.post('/retention/:policyId/execute', async (req, res) => {
    try { res.json(await executeRetention(req.params.policyId, req.body || {}, actor(req))) } catch (error) { sendError(res, error) }
  })

  return router
}
