import express from 'express'
import {
  cancelAutomationExecution,
  deleteAutomationJob,
  enqueueAutomationJob,
  getAutomationHealth,
  getAutomationRegistry,
  listAutomationHandlers,
  processAutomationQueue,
  retryAutomationExecution,
  searchAutomationExecutions,
  updateAutomationSettings,
  upsertAutomationJob,
} from './services/automationService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function requireWebsiteAccess(req, res) {
  if (req.session?.role === 'owner') return true
  const allowed = new Set(req.session?.websiteIds || (req.session?.websiteId ? [req.session.websiteId] : []))
  if (allowed.has(req.params.websiteId)) return true
  res.status(403).json({ error: 'Website access denied' })
  return false
}

function actor(req) {
  return {
    id: req.session?.userId || req.session?.email || null,
    email: req.session?.email || null,
    role: req.session?.role || null,
  }
}

async function publishAutomationEvent(req, topic, payload) {
  await publishDomainEvent(topic, { websiteId: req.params.websiteId, ...payload }, actor(req))
}

function sendError(res, error) {
  const body = { error: error.message || 'Automation request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createAutomationRouter() {
  const router = express.Router()

  router.get('/handlers', (_req, res) => res.json(listAutomationHandlers()))

  router.get('/:websiteId', async (req, res) => {
    if (!requireWebsiteAccess(req, res)) return
    try { res.json(await getAutomationRegistry(req.params.websiteId)) } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/health', async (req, res) => {
    if (!requireWebsiteAccess(req, res)) return
    try { res.json(await getAutomationHealth(req.params.websiteId)) } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/executions', async (req, res) => {
    if (!requireWebsiteAccess(req, res)) return
    try { res.json(await searchAutomationExecutions(req.params.websiteId, req.query)) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/jobs', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const job = await upsertAutomationJob(req.params.websiteId, req.body || {})
      await publishAutomationEvent(req, 'automation.job-created', { jobId: job.id, handler: job.handler, enabled: job.enabled, nextRunAt: job.nextRunAt })
      res.status(201).json(job)
    } catch (error) { sendError(res, error) }
  })

  router.patch('/:websiteId/jobs/:jobId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const job = await upsertAutomationJob(req.params.websiteId, { ...(req.body || {}), id: req.params.jobId })
      await publishAutomationEvent(req, 'automation.job-updated', { jobId: job.id, handler: job.handler, enabled: job.enabled, nextRunAt: job.nextRunAt })
      res.json(job)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/:websiteId/jobs/:jobId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const result = await deleteAutomationJob(req.params.websiteId, req.params.jobId)
      await publishAutomationEvent(req, 'automation.job-deleted', { jobId: req.params.jobId })
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/jobs/:jobId/run', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const execution = await enqueueAutomationJob(req.params.websiteId, req.params.jobId, req.body || {})
      await publishAutomationEvent(req, 'automation.execution-queued', { jobId: req.params.jobId, executionId: execution.id, status: execution.status })
      res.status(202).json(execution)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/executions/:executionId/cancel', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const execution = await cancelAutomationExecution(req.params.websiteId, req.params.executionId)
      await publishAutomationEvent(req, 'automation.execution-cancelled', { executionId: execution.id, jobId: execution.jobId, status: execution.status })
      res.json(execution)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/executions/:executionId/retry', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const execution = await retryAutomationExecution(req.params.websiteId, req.params.executionId)
      await publishAutomationEvent(req, 'automation.execution-retried', { executionId: execution.id, jobId: execution.jobId, status: execution.status })
      res.json(execution)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/process', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const result = await processAutomationQueue(req.params.websiteId, req.body || {})
      await publishAutomationEvent(req, 'automation.queue-processed', { processed: result.processed, results: result.results })
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.patch('/:websiteId/settings', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const settings = await updateAutomationSettings(req.params.websiteId, req.body || {})
      await publishAutomationEvent(req, 'automation.settings-updated', { settings })
      res.json(settings)
    } catch (error) { sendError(res, error) }
  })

  return router
}
