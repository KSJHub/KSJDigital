import express from 'express'
import {
  cancelJob,
  claimJobs,
  completeJob,
  enqueueJob,
  failJob,
  getJobQueue,
  processJobQueue,
  renewJobLease,
  requeueDeadLetter,
  upsertJobSchedule,
} from './services/jobQueueService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function sendError(res, error) {
  const body = { error: error.message || 'Job queue request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

function jobEventPayload(job = {}) {
  return {
    status: ['queued', 'retrying', 'processing', 'completed', 'failed', 'cancelled', 'dead-lettered'].includes(job.status) ? job.status : 'queued',
    attemptCount: Number(job.attempts) || 0,
    priority: Number(job.priority) || 0,
    hasPayload: job.payload && typeof job.payload === 'object' ? Object.keys(job.payload).length > 0 : Boolean(job.payload),
    hasResult: job.result !== null && job.result !== undefined,
    hasError: Boolean(job.error),
    terminal: ['completed', 'failed', 'cancelled', 'dead-lettered'].includes(job.status),
  }
}

function queueEventPayload(jobs = []) {
  const items = Array.isArray(jobs) ? jobs : []
  return {
    processedCount: items.length,
    completedCount: items.filter(job => job.status === 'completed').length,
    retryingCount: items.filter(job => job.status === 'retrying').length,
    deadLetterCount: items.filter(job => job.status === 'dead-lettered').length,
    cancelledCount: items.filter(job => job.status === 'cancelled').length,
  }
}

function claimEventPayload(jobs = []) {
  const items = Array.isArray(jobs) ? jobs : []
  return {
    claimedCount: items.length,
    retryingClaimCount: items.filter(job => job.attempts > 0).length,
    highPriorityCount: items.filter(job => Number(job.priority) > 0).length,
  }
}

function scheduleEventPayload(schedule = {}) {
  return {
    enabled: schedule.enabled !== false,
    intervalMs: Number(schedule.intervalMs) || 0,
    priority: Number(schedule.priority) || 0,
    hasPayload: schedule.payload && typeof schedule.payload === 'object' ? Object.keys(schedule.payload).length > 0 : Boolean(schedule.payload),
  }
}

async function publishJobRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function schedulePatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name || '').trim() !== String(existing.name || '').trim()) return true
  if (Object.hasOwn(input, 'queue') && String(input.queue || 'default').trim() !== String(existing.queue || 'default').trim()) return true
  if (Object.hasOwn(input, 'handler') && String(input.handler || '').trim() !== String(existing.handler || '').trim()) return true
  if (Object.hasOwn(input, 'payload') && JSON.stringify(input.payload ?? {}) !== JSON.stringify(existing.payload ?? {})) return true
  if (Object.hasOwn(input, 'priority') && Math.min(100, Math.max(-100, Number(input.priority || 0))) !== Number(existing.priority || 0)) return true
  if (Object.hasOwn(input, 'retry') && JSON.stringify(input.retry || {}) !== JSON.stringify(existing.retry || {})) return true
  if (Object.hasOwn(input, 'timeoutMs') && Math.min(1800000, Math.max(1000, Number(input.timeoutMs))) !== Number(existing.timeoutMs)) return true
  if (Object.hasOwn(input, 'intervalMs') && Math.floor(Number(input.intervalMs)) !== Number(existing.intervalMs)) return true
  if (Object.hasOwn(input, 'enabled') && (input.enabled !== false) !== (existing.enabled !== false)) return true
  if (Object.hasOwn(input, 'nextRunAt')) {
    const requested = new Date(input.nextRunAt)
    const nextRunAt = Number.isNaN(requested.getTime()) ? String(input.nextRunAt || '') : requested.toISOString()
    if (nextRunAt !== String(existing.nextRunAt || '')) return true
  }
  return false
}

export function createJobQueueRouter() {
  const router = express.Router()
  router.use((req, res, next) => {
    if (!requireOwner(req, res)) return
    next()
  })

  router.get('/', async (req, res) => {
    try { res.json(await getJobQueue(req.query)) } catch (error) { sendError(res, error) }
  })

  router.post('/jobs', async (req, res) => {
    try {
      const before = await getJobQueue({ limit: 1000 })
      const job = await enqueueJob(req.body || {}, null)
      if (!before.jobs.some(item => item.id === job.id)) await publishJobRealtimeEvent('job.enqueued', jobEventPayload(job))
      res.status(201).json(job)
    } catch (error) { sendError(res, error) }
  })

  router.post('/jobs/:jobId/cancel', async (req, res) => {
    try {
      const registry = await getJobQueue({ limit: 1000 })
      const existing = registry.jobs.find(item => item.id === req.params.jobId)
      if (!existing) return res.status(404).json({ error: 'Job not found' })
      if (['completed', 'dead-lettered', 'cancelled'].includes(existing.status)) return res.json(existing)
      const job = await cancelJob(req.params.jobId, null)
      await publishJobRealtimeEvent('job.cancelled', jobEventPayload(job))
      res.json(job)
    } catch (error) { sendError(res, error) }
  })

  router.post('/dead-letter/:jobId/requeue', async (req, res) => {
    try {
      const job = await requeueDeadLetter(req.params.jobId, null)
      await publishJobRealtimeEvent('job.requeued', jobEventPayload(job))
      res.json(job)
    } catch (error) { sendError(res, error) }
  })

  router.put('/schedules/:scheduleId', async (req, res) => {
    try {
      const registry = await getJobQueue({ limit: 1 })
      const existing = registry.schedules.find(item => item.id === req.params.scheduleId)
      if (!schedulePatchChanges(existing, req.body || {})) return res.json(existing)
      const schedule = await upsertJobSchedule({ ...(req.body || {}), id: req.params.scheduleId }, null)
      await publishJobRealtimeEvent('job.schedule-updated', scheduleEventPayload(schedule))
      res.json(schedule)
    } catch (error) { sendError(res, error) }
  })

  router.post('/workers/:workerId/claim', async (req, res) => {
    try {
      const jobs = await claimJobs(req.params.workerId, req.body || {})
      if (jobs.length > 0) await publishJobRealtimeEvent('job.claimed', claimEventPayload(jobs))
      res.json(jobs)
    } catch (error) { sendError(res, error) }
  })

  router.post('/jobs/:jobId/lease', async (req, res) => {
    try {
      const job = await renewJobLease(req.params.jobId, req.body || {})
      await publishJobRealtimeEvent('job.lease-renewed', jobEventPayload(job))
      res.json(job)
    } catch (error) { sendError(res, error) }
  })

  router.post('/jobs/:jobId/complete', async (req, res) => {
    try {
      const job = await completeJob(req.params.jobId, req.body || {})
      await publishJobRealtimeEvent('job.completed', jobEventPayload(job))
      res.json(job)
    } catch (error) { sendError(res, error) }
  })

  router.post('/jobs/:jobId/fail', async (req, res) => {
    try {
      const job = await failJob(req.params.jobId, req.body || {})
      const topic = job.status === 'dead-lettered' ? 'job.dead-lettered' : 'job.retry-scheduled'
      await publishJobRealtimeEvent(topic, jobEventPayload(job))
      res.json(job)
    } catch (error) { sendError(res, error) }
  })

  router.post('/process', async (req, res) => {
    try {
      const jobs = await processJobQueue(req.body || {})
      if (jobs.length > 0) await publishJobRealtimeEvent('job.queue-processed', queueEventPayload(jobs))
      res.json(jobs)
    } catch (error) { sendError(res, error) }
  })

  return router
}
