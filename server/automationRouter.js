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
    try { res.status(201).json(await upsertAutomationJob(req.params.websiteId, req.body || {})) } catch (error) { sendError(res, error) }
  })

  router.patch('/:websiteId/jobs/:jobId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await upsertAutomationJob(req.params.websiteId, { ...(req.body || {}), id: req.params.jobId })) } catch (error) { sendError(res, error) }
  })

  router.delete('/:websiteId/jobs/:jobId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await deleteAutomationJob(req.params.websiteId, req.params.jobId)) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/jobs/:jobId/run', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.status(202).json(await enqueueAutomationJob(req.params.websiteId, req.params.jobId, req.body || {})) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/executions/:executionId/cancel', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await cancelAutomationExecution(req.params.websiteId, req.params.executionId)) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/executions/:executionId/retry', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await retryAutomationExecution(req.params.websiteId, req.params.executionId)) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/process', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await processAutomationQueue(req.params.websiteId, req.body || {})) } catch (error) { sendError(res, error) }
  })

  router.patch('/:websiteId/settings', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await updateAutomationSettings(req.params.websiteId, req.body || {})) } catch (error) { sendError(res, error) }
  })

  return router
}
