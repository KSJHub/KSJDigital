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

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function actor(req) { return { id: req.session?.userId || null, email: req.session?.email || null } }
function sendError(res, error) {
  const body = { error: error.message || 'Job queue request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createJobQueueRouter() {
  const router = express.Router()
  router.use((req, res, next) => { if (!requireOwner(req, res)) return; next() })

  router.get('/', async (req, res) => { try { res.json(await getJobQueue(req.query)) } catch (error) { sendError(res, error) } })
  router.post('/jobs', async (req, res) => { try { res.status(201).json(await enqueueJob(req.body || {}, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/jobs/:jobId/cancel', async (req, res) => { try { res.json(await cancelJob(req.params.jobId, actor(req))) } catch (error) { sendError(res, error) } })
  router.post('/dead-letter/:jobId/requeue', async (req, res) => { try { res.json(await requeueDeadLetter(req.params.jobId, actor(req))) } catch (error) { sendError(res, error) } })
  router.put('/schedules/:scheduleId', async (req, res) => { try { res.json(await upsertJobSchedule({ ...req.body, id: req.params.scheduleId }, actor(req))) } catch (error) { sendError(res, error) } })

  router.post('/workers/:workerId/claim', async (req, res) => { try { res.json(await claimJobs(req.params.workerId, req.body || {})) } catch (error) { sendError(res, error) } })
  router.post('/jobs/:jobId/lease', async (req, res) => { try { res.json(await renewJobLease(req.params.jobId, req.body || {})) } catch (error) { sendError(res, error) } })
  router.post('/jobs/:jobId/complete', async (req, res) => { try { res.json(await completeJob(req.params.jobId, req.body || {})) } catch (error) { sendError(res, error) } })
  router.post('/jobs/:jobId/fail', async (req, res) => { try { res.json(await failJob(req.params.jobId, req.body || {})) } catch (error) { sendError(res, error) } })
  router.post('/process', async (req, res) => { try { res.json(await processJobQueue(req.body || {})) } catch (error) { sendError(res, error) } })

  return router
}
