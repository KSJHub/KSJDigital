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

function sendError(res, error) {
  const body = { error: error.message || 'Automation request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

function automationRegistryPayload(registry = {}, job = {}, details = {}) {
  const jobs = Array.isArray(registry.jobs) ? registry.jobs : []
  const executions = Array.isArray(registry.executions) ? registry.executions : []
  return {
    jobCount: jobs.length,
    enabledJobCount: jobs.filter(item => item.enabled !== false).length,
    executionCount: executions.length,
    pendingExecutionCount: executions.filter(item => ['pending', 'processing', 'retrying'].includes(item.status)).length,
    enabled: job.enabled !== false,
    recurring: job.schedule?.type === 'interval',
    hasPayload: job.payload && typeof job.payload === 'object' ? Object.keys(job.payload).length > 0 : Boolean(job.payload),
    deleted: details.deleted === true,
  }
}

function executionEventPayload(execution = {}) {
  return {
    status: ['pending', 'processing', 'retrying', 'completed', 'failed', 'cancelled'].includes(execution.status) ? execution.status : 'pending',
    attemptCount: Number(execution.attempts) || 0,
    hasResult: execution.result !== null && execution.result !== undefined,
    hasError: Boolean(execution.error),
    terminal: ['completed', 'failed', 'cancelled'].includes(execution.status),
  }
}

function queueEventPayload(result = {}) {
  const results = Array.isArray(result.results) ? result.results : []
  return {
    processedCount: Number(result.processed) || 0,
    completedCount: results.filter(item => item.status === 'completed').length,
    retryingCount: results.filter(item => item.status === 'retrying').length,
    failedCount: results.filter(item => item.status === 'failed').length,
    cancelledCount: results.filter(item => item.status === 'cancelled').length,
  }
}

function settingsEventPayload(settings = {}) {
  return {
    enabled: settings.enabled !== false,
    workerIntervalMs: Number(settings.workerIntervalMs) || 0,
    executionRetentionDays: Number(settings.executionRetentionDays) || 0,
    failureAlertThreshold: Number(settings.failureAlertThreshold) || 0,
  }
}

async function publishAutomationRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function normalisedSchedule(input = {}, existing = {}) {
  const type = String(input.type ?? existing.type ?? 'once')
  if (type === 'interval') return { type, at: null, intervalMs: Math.floor(Number(input.intervalMs ?? existing.intervalMs)) }
  const at = new Date(input.at ?? existing.at)
  return { type, at: Number.isNaN(at.getTime()) ? String(input.at ?? existing.at ?? '') : at.toISOString(), intervalMs: null }
}

function jobPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name || '').trim() !== String(existing.name || '').trim()) return true
  if (Object.hasOwn(input, 'handler') && String(input.handler || '').trim() !== String(existing.handler || '').trim()) return true
  if (Object.hasOwn(input, 'payload') && JSON.stringify(input.payload ?? {}) !== JSON.stringify(existing.payload ?? {})) return true
  if (Object.hasOwn(input, 'schedule') && JSON.stringify(normalisedSchedule(input.schedule || {}, existing.schedule || {})) !== JSON.stringify(existing.schedule || {})) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'maxAttempts') && Math.min(12, Math.max(1, Number(input.maxAttempts))) !== Number(existing.maxAttempts)) return true
  if (Object.hasOwn(input, 'timeoutMs') && Math.min(900000, Math.max(1000, Number(input.timeoutMs))) !== Number(existing.timeoutMs)) return true
  if (Object.hasOwn(input, 'nextRunAt')) {
    const requested = new Date(input.nextRunAt)
    const nextRunAt = Number.isNaN(requested.getTime()) ? String(input.nextRunAt || '') : requested.toISOString()
    if (nextRunAt !== String(existing.nextRunAt || '')) return true
  }
  return false
}

function settingsPatchChanges(existing = {}, input = {}) {
  if (Object.hasOwn(input, 'enabled') && (input.enabled === true) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'workerIntervalMs') && Math.min(300000, Math.max(1000, Number(input.workerIntervalMs))) !== Number(existing.workerIntervalMs)) return true
  if (Object.hasOwn(input, 'executionRetentionDays') && Math.min(3650, Math.max(1, Number(input.executionRetentionDays))) !== Number(existing.executionRetentionDays)) return true
  if (Object.hasOwn(input, 'failureAlertThreshold') && Math.min(100, Math.max(1, Number(input.failureAlertThreshold))) !== Number(existing.failureAlertThreshold)) return true
  return false
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
      const registry = await getAutomationRegistry(req.params.websiteId)
      await publishAutomationRealtimeEvent('automation.job-created', automationRegistryPayload(registry, job))
      res.status(201).json(job)
    } catch (error) { sendError(res, error) }
  })

  router.patch('/:websiteId/jobs/:jobId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const input = req.body || {}
      const registry = await getAutomationRegistry(req.params.websiteId)
      const existing = registry.jobs.find(item => item.id === req.params.jobId)
      if (!existing) return res.status(404).json({ error: 'Automation job not found' })
      if (!jobPatchChanges(existing, input)) return res.json(existing)
      const job = await upsertAutomationJob(req.params.websiteId, { ...input, id: req.params.jobId })
      const updatedRegistry = await getAutomationRegistry(req.params.websiteId)
      await publishAutomationRealtimeEvent('automation.job-updated', automationRegistryPayload(updatedRegistry, job))
      res.json(job)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/:websiteId/jobs/:jobId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const result = await deleteAutomationJob(req.params.websiteId, req.params.jobId)
      const registry = await getAutomationRegistry(req.params.websiteId)
      await publishAutomationRealtimeEvent('automation.job-deleted', automationRegistryPayload(registry, {}, result))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/jobs/:jobId/run', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const execution = await enqueueAutomationJob(req.params.websiteId, req.params.jobId, req.body || {})
      await publishAutomationRealtimeEvent('automation.execution-queued', executionEventPayload(execution))
      res.status(202).json(execution)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/executions/:executionId/cancel', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const registry = await getAutomationRegistry(req.params.websiteId)
      const existing = registry.executions.find(item => item.id === req.params.executionId)
      if (!existing) return res.status(404).json({ error: 'Automation execution not found' })
      if (['completed', 'failed', 'cancelled'].includes(existing.status)) return res.json(existing)
      const execution = await cancelAutomationExecution(req.params.websiteId, req.params.executionId)
      await publishAutomationRealtimeEvent('automation.execution-cancelled', executionEventPayload(execution))
      res.json(execution)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/executions/:executionId/retry', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const registry = await getAutomationRegistry(req.params.websiteId)
      const existing = registry.executions.find(item => item.id === req.params.executionId)
      if (!existing) return res.status(404).json({ error: 'Automation execution not found' })
      if (existing.status === 'pending' && Number(existing.attempts) === 0 && !existing.error) return res.json(existing)
      const execution = await retryAutomationExecution(req.params.websiteId, req.params.executionId)
      await publishAutomationRealtimeEvent('automation.execution-retried', executionEventPayload(execution))
      res.json(execution)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/process', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const result = await processAutomationQueue(req.params.websiteId, req.body || {})
      if (result.processed > 0) await publishAutomationRealtimeEvent('automation.queue-processed', queueEventPayload(result))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.patch('/:websiteId/settings', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const input = req.body || {}
      const registry = await getAutomationRegistry(req.params.websiteId)
      if (!settingsPatchChanges(registry.settings, input)) return res.json(registry.settings)
      const settings = await updateAutomationSettings(req.params.websiteId, input)
      await publishAutomationRealtimeEvent('automation.settings-updated', settingsEventPayload(settings))
      res.json(settings)
    } catch (error) { sendError(res, error) }
  })

  return router
}
