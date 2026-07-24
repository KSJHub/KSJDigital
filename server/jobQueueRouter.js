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

function actor(req) {
  return {
    id: req.session?.userId || null,
    email: req.session?.email || null,
  }
}

function websiteId(value) {
  return value?.websiteId || value?.payload?.websiteId || null
}

async function publishJobEvent(topic, value, requestedBy, extra = {}) {
  await publishDomainEvent(topic, {
    jobId: value?.id || extra.jobId || null,
    queue: value?.queue || extra.queue || null,
    handler: value?.handler || extra.handler || null,
    status: value?.status || extra.status || null,
    websiteId: websiteId(value) || extra.websiteId || null,
    ...extra,
  }, requestedBy)
}

function sendError(res, error) {
  const body = { error: error.message || 'Job queue request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createJobQueueRouter() {
  const router = express.Router()
  router.use((req, res, next) => {
    if (!requireOwner(req, res)) return
    next()
  })

  router.get('/', async (req, res) => {
    try {
      res.json(await getJobQueue(req.query))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/jobs', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const job = await enqueueJob(req.body || {}, requestedBy)
      await publishJobEvent('job.enqueued', job, requestedBy)
      res.status(201).json(job)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/jobs/:jobId/cancel', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const job = await cancelJob(req.params.jobId, requestedBy)
      await publishJobEvent('job.cancelled', job, requestedBy)
      res.json(job)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/dead-letter/:jobId/requeue', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const job = await requeueDeadLetter(req.params.jobId, requestedBy)
      await publishJobEvent('job.requeued', job, requestedBy)
      res.json(job)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.put('/schedules/:scheduleId', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const schedule = await upsertJobSchedule({ ...req.body, id: req.params.scheduleId }, requestedBy)
      await publishDomainEvent('job.schedule-updated', {
        scheduleId: schedule.id,
        queue: schedule.queue,
        handler: schedule.handler,
        enabled: schedule.enabled,
        nextRunAt: schedule.nextRunAt,
        websiteId: websiteId(schedule),
      }, requestedBy)
      res.json(schedule)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/workers/:workerId/claim', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const jobs = await claimJobs(req.params.workerId, req.body || {})
      await publishDomainEvent('job.claimed', {
        workerId: req.params.workerId,
        jobIds: jobs.map(job => job.id),
        count: jobs.length,
        queue: req.body?.queue || null,
      }, requestedBy)
      res.json(jobs)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/jobs/:jobId/lease', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const job = await renewJobLease(req.params.jobId, req.body || {})
      await publishJobEvent('job.lease-renewed', job, requestedBy, {
        workerId: req.body?.workerId || null,
        leaseExpiresAt: job.lease?.expiresAt || null,
      })
      res.json(job)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/jobs/:jobId/complete', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const job = await completeJob(req.params.jobId, req.body || {})
      await publishJobEvent('job.completed', job, requestedBy, {
        workerId: req.body?.workerId || null,
        completedAt: job.completedAt || null,
      })
      res.json(job)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/jobs/:jobId/fail', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const job = await failJob(req.params.jobId, req.body || {})
      const topic = job.status === 'dead-lettered' ? 'job.dead-lettered' : 'job.retry-scheduled'
      await publishJobEvent(topic, job, requestedBy, {
        workerId: req.body?.workerId || null,
        attempts: job.attempts,
        nextAttemptAt: job.nextAttemptAt || null,
      })
      res.json(job)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/process', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const jobs = await processJobQueue(req.body || {})
      await publishDomainEvent('job.queue-processed', {
        workerId: req.body?.workerId || null,
        jobIds: jobs.map(job => job.id),
        count: jobs.length,
        completedCount: jobs.filter(job => job.status === 'completed').length,
        retryCount: jobs.filter(job => job.status === 'retrying').length,
        deadLetterCount: jobs.filter(job => job.status === 'dead-lettered').length,
      }, requestedBy)
      res.json(jobs)
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
