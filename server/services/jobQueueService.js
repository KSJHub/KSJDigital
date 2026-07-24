import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { publishIntegrationEvent } from './integrationService.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'jobs', 'registry.json')
const handlers = new Map()
const mutations = new Map()
const workers = new Map()
const MAX_PAYLOAD_BYTES = 1_000_000
const MAX_HISTORY = 5000
const ACTIVE = new Set(['queued', 'retrying', 'processing'])

export class JobQueueError extends Error {
  constructor(message, status = 400, details = null) { super(message); this.name = 'JobQueueError'; this.status = status; this.details = details }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() { return { jobs: [], schedules: [], deadLetters: [], history: [], version: 1, updatedAt: nowIso() } }
async function readRegistry() {
  const value = await readJson(REGISTRY_FILE, null) || initialRegistry()
  value.jobs ||= []; value.schedules ||= []; value.deadLetters ||= []; value.history ||= []; value.version ||= 1
  return value
}
async function mutate(operation) {
  const previous = mutations.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = structuredClone(await readRegistry())
    const result = await operation(registry)
    registry.version += 1; registry.updatedAt = nowIso(); registry.history = registry.history.slice(0, MAX_HISTORY)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function text(value, label, max = 200) {
  const result = String(value || '').trim()
  if (!result) throw new JobQueueError(`${label} is required`, 422)
  if (result.length > max) throw new JobQueueError(`${label} is too long`, 422)
  return result
}
function payload(value) {
  const result = value ?? {}
  let encoded
  try { encoded = JSON.stringify(result) } catch { throw new JobQueueError('Job payload must be JSON serialisable', 422) }
  if (Buffer.byteLength(encoded) > MAX_PAYLOAD_BYTES) throw new JobQueueError('Job payload is too large', 413)
  return result
}
function priority(value) { return Math.min(100, Math.max(-100, Number(value || 0))) }
function retryPolicy(input = {}, existing = null) {
  const maxAttempts = Math.min(20, Math.max(1, Number(input.maxAttempts ?? existing?.maxAttempts ?? 5)))
  const baseDelayMs = Math.min(86_400_000, Math.max(1000, Number(input.baseDelayMs ?? existing?.baseDelayMs ?? 30_000)))
  const maxDelayMs = Math.min(7 * 86_400_000, Math.max(baseDelayMs, Number(input.maxDelayMs ?? existing?.maxDelayMs ?? 6 * 60 * 60_000)))
  const strategy = String(input.strategy ?? existing?.strategy ?? 'exponential')
  if (!['fixed', 'exponential'].includes(strategy)) throw new JobQueueError('Retry strategy is invalid', 422)
  return { maxAttempts, baseDelayMs, maxDelayMs, strategy }
}
function retryAt(policy, attempts) {
  const delay = policy.strategy === 'fixed' ? policy.baseDelayMs : policy.baseDelayMs * (2 ** Math.max(0, attempts - 1))
  return new Date(Date.now() + Math.min(policy.maxDelayMs, delay)).toISOString()
}
function publicJob(job) { return structuredClone(job) }

export function registerJobHandler(nameValue, handler) {
  const name = text(nameValue, 'Handler name', 100)
  if (!/^[a-z][a-z0-9._-]*$/i.test(name)) throw new JobQueueError('Handler name is invalid', 422)
  if (typeof handler !== 'function') throw new JobQueueError('Job handler must be a function', 422)
  handlers.set(name, handler); return name
}
registerJobHandler('noop', async ({ payload: value }) => ({ ok: true, payload: value }))
registerJobHandler('integration-event', async ({ payload: value }) => publishIntegrationEvent(safeName(value.websiteId || 'global'), text(value.eventName, 'Event name'), value.data ?? {}, { jobQueue: true }))
export function listJobHandlers() { return [...handlers.keys()].sort() }

export async function getJobQueue(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  const status = query.status ? String(query.status) : null
  const queue = query.queue ? safeName(query.queue) : null
  const jobs = registry.jobs.filter(item => (!status || item.status === status) && (!queue || item.queue === queue)).slice(0, limit)
  return { ...registry, jobs, handlers: listJobHandlers() }
}

export async function enqueueJob(input = {}, actor = null) {
  const handler = text(input.handler, 'Handler', 100)
  if (!handlers.has(handler)) throw new JobQueueError('Unknown job handler', 422, { handler })
  const queue = safeName(input.queue || 'default')
  const idempotencyKey = input.idempotencyKey ? text(input.idempotencyKey, 'Idempotency key', 200) : null
  const scheduledFor = new Date(input.scheduledFor || Date.now())
  if (Number.isNaN(scheduledFor.getTime())) throw new JobQueueError('Scheduled time is invalid', 422)
  return mutate(registry => {
    if (idempotencyKey) {
      const existing = registry.jobs.find(item => item.queue === queue && item.idempotencyKey === idempotencyKey && !['failed', 'cancelled', 'dead-lettered'].includes(item.status))
      if (existing) return publicJob(existing)
    }
    const now = nowIso()
    const job = {
      id: crypto.randomUUID(), queue, handler, payload: payload(input.payload), priority: priority(input.priority), idempotencyKey,
      status: 'queued', attempts: 0, retry: retryPolicy(input.retry), timeoutMs: Math.min(30 * 60_000, Math.max(1000, Number(input.timeoutMs || 60_000))),
      scheduledFor: scheduledFor.toISOString(), nextAttemptAt: scheduledFor.toISOString(), lease: null, result: null, error: null,
      createdAt: now, createdBy: actor, startedAt: null, completedAt: null, updatedAt: now,
    }
    registry.jobs.unshift(job)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'job.enqueued', jobId: job.id, queue, actor, createdAt: now })
    return publicJob(job)
  })
}

export async function upsertJobSchedule(input = {}, actor = null) {
  const id = safeName(input.id || input.name)
  if (!id || id === 'file') throw new JobQueueError('Schedule ID is required', 422)
  const intervalMs = Number(input.intervalMs)
  if (!Number.isFinite(intervalMs) || intervalMs < 60_000 || intervalMs > 365 * 86_400_000) throw new JobQueueError('Schedule interval must be between one minute and one year', 422)
  const handler = text(input.handler, 'Handler', 100)
  if (!handlers.has(handler)) throw new JobQueueError('Unknown job handler', 422)
  return mutate(registry => {
    const existing = registry.schedules.find(item => item.id === id)
    const schedule = {
      id, name: text(input.name || id, 'Schedule name'), queue: safeName(input.queue || existing?.queue || 'default'), handler,
      payload: payload(input.payload ?? existing?.payload), priority: priority(input.priority ?? existing?.priority), retry: retryPolicy(input.retry, existing?.retry),
      timeoutMs: Math.min(30 * 60_000, Math.max(1000, Number(input.timeoutMs ?? existing?.timeoutMs ?? 60_000))), intervalMs: Math.floor(intervalMs),
      enabled: input.enabled !== false, nextRunAt: input.nextRunAt ? new Date(input.nextRunAt).toISOString() : existing?.nextRunAt || new Date(Date.now() + intervalMs).toISOString(),
      updatedAt: nowIso(), updatedBy: actor, createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor,
    }
    if (Number.isNaN(new Date(schedule.nextRunAt).getTime())) throw new JobQueueError('Schedule next run is invalid', 422)
    registry.schedules = [schedule, ...registry.schedules.filter(item => item.id !== id)]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'schedule.updated', scheduleId: id, actor, createdAt: nowIso() })
    return schedule
  })
}

async function materialiseSchedules() {
  const due = await mutate(registry => {
    const now = Date.now(); const items = []
    for (const schedule of registry.schedules) {
      if (!schedule.enabled || new Date(schedule.nextRunAt).getTime() > now) continue
      items.push(structuredClone(schedule))
      do { schedule.nextRunAt = new Date(new Date(schedule.nextRunAt).getTime() + schedule.intervalMs).toISOString() } while (new Date(schedule.nextRunAt).getTime() <= now)
      schedule.updatedAt = nowIso()
    }
    return items
  })
  for (const schedule of due) await enqueueJob({ queue: schedule.queue, handler: schedule.handler, payload: schedule.payload, priority: schedule.priority, retry: schedule.retry, timeoutMs: schedule.timeoutMs, idempotencyKey: `schedule:${schedule.id}:${schedule.nextRunAt}` }, { system: 'scheduler' })
  return due.length
}

export async function claimJobs(workerValue, input = {}) {
  const workerId = text(workerValue, 'Worker ID', 200)
  const queue = input.queue ? safeName(input.queue) : null
  const limit = Math.min(100, Math.max(1, Number(input.limit || 10)))
  const leaseMs = Math.min(30 * 60_000, Math.max(10_000, Number(input.leaseMs || 5 * 60_000)))
  return mutate(registry => {
    const now = Date.now()
    for (const job of registry.jobs) {
      if (job.status === 'processing' && (!job.lease?.expiresAt || new Date(job.lease.expiresAt).getTime() <= now)) {
        job.status = 'retrying'; job.nextAttemptAt = nowIso(); job.lease = null; job.error = 'Recovered after expired worker lease'; job.updatedAt = nowIso()
      }
    }
    const due = registry.jobs.filter(job => ACTIVE.has(job.status) && job.status !== 'processing' && (!queue || job.queue === queue) && new Date(job.nextAttemptAt).getTime() <= now)
      .sort((a, b) => b.priority - a.priority || new Date(a.createdAt) - new Date(b.createdAt)).slice(0, limit)
    for (const job of due) {
      job.status = 'processing'; job.startedAt ||= nowIso(); job.lease = { workerId, token: crypto.randomBytes(32).toString('hex'), acquiredAt: nowIso(), expiresAt: new Date(now + leaseMs).toISOString() }; job.updatedAt = nowIso()
    }
    return structuredClone(due)
  })
}

function requireLease(job, workerId, token) {
  if (job.status !== 'processing' || !job.lease || job.lease.workerId !== workerId || job.lease.token !== token) throw new JobQueueError('Worker lease is invalid', 409)
  if (new Date(job.lease.expiresAt).getTime() <= Date.now()) throw new JobQueueError('Worker lease has expired', 409)
}
export async function renewJobLease(jobId, input = {}) {
  const workerId = text(input.workerId, 'Worker ID'); const token = text(input.leaseToken, 'Lease token')
  const leaseMs = Math.min(30 * 60_000, Math.max(10_000, Number(input.leaseMs || 5 * 60_000)))
  return mutate(registry => {
    const job = registry.jobs.find(item => item.id === jobId); if (!job) throw new JobQueueError('Job not found', 404)
    requireLease(job, workerId, token); job.lease.expiresAt = new Date(Date.now() + leaseMs).toISOString(); job.updatedAt = nowIso(); return publicJob(job)
  })
}
export async function completeJob(jobId, input = {}) {
  const workerId = text(input.workerId, 'Worker ID'); const token = text(input.leaseToken, 'Lease token')
  const result = await mutate(registry => {
    const job = registry.jobs.find(item => item.id === jobId); if (!job) throw new JobQueueError('Job not found', 404)
    requireLease(job, workerId, token); job.status = 'completed'; job.attempts += 1; job.result = payload(input.result ?? null); job.error = null; job.lease = null; job.completedAt = nowIso(); job.updatedAt = nowIso()
    registry.history.unshift({ id: crypto.randomUUID(), action: 'job.completed', jobId, queue: job.queue, workerId, createdAt: nowIso() }); return publicJob(job)
  })
  publishIntegrationEvent('global', 'job.completed', result, { jobQueue: true }).catch(() => {}); return result
}
export async function failJob(jobId, input = {}) {
  const workerId = text(input.workerId, 'Worker ID'); const token = text(input.leaseToken, 'Lease token'); const error = text(input.error || 'Job failed', 'Error', 5000)
  const result = await mutate(registry => {
    const job = registry.jobs.find(item => item.id === jobId); if (!job) throw new JobQueueError('Job not found', 404)
    requireLease(job, workerId, token); job.attempts += 1; job.error = error; job.lease = null; job.updatedAt = nowIso()
    if (job.attempts >= job.retry.maxAttempts) {
      job.status = 'dead-lettered'; job.completedAt = nowIso(); registry.deadLetters.unshift({ ...structuredClone(job), deadLetteredAt: nowIso() })
      registry.history.unshift({ id: crypto.randomUUID(), action: 'job.dead-lettered', jobId, queue: job.queue, workerId, createdAt: nowIso() })
    } else { job.status = 'retrying'; job.nextAttemptAt = retryAt(job.retry, job.attempts); registry.history.unshift({ id: crypto.randomUUID(), action: 'job.retry-scheduled', jobId, attempt: job.attempts, createdAt: nowIso() }) }
    return publicJob(job)
  })
  if (result.status === 'dead-lettered') publishIntegrationEvent('global', 'job.dead-lettered', result, { jobQueue: true }).catch(() => {})
  return result
}
export async function cancelJob(jobId, actor = null) {
  return mutate(registry => {
    const job = registry.jobs.find(item => item.id === jobId); if (!job) throw new JobQueueError('Job not found', 404)
    if (!['completed', 'dead-lettered', 'cancelled'].includes(job.status)) { job.status = 'cancelled'; job.lease = null; job.completedAt = nowIso(); job.updatedAt = nowIso() }
    registry.history.unshift({ id: crypto.randomUUID(), action: 'job.cancelled', jobId, actor, createdAt: nowIso() }); return publicJob(job)
  })
}
export async function requeueDeadLetter(jobId, actor = null) {
  return mutate(registry => {
    const index = registry.deadLetters.findIndex(item => item.id === jobId); if (index < 0) throw new JobQueueError('Dead-letter job not found', 404)
    const job = registry.jobs.find(item => item.id === jobId); if (!job) throw new JobQueueError('Original job not found', 404)
    Object.assign(job, { status: 'queued', attempts: 0, nextAttemptAt: nowIso(), lease: null, completedAt: null, result: null, error: null, updatedAt: nowIso() })
    registry.deadLetters.splice(index, 1); registry.history.unshift({ id: crypto.randomUUID(), action: 'job.requeued', jobId, actor, createdAt: nowIso() }); return publicJob(job)
  })
}

async function runClaimed(job, workerId) {
  const handler = handlers.get(job.handler)
  if (!handler) return failJob(job.id, { workerId, leaseToken: job.lease.token, error: `Unknown job handler: ${job.handler}` })
  let timer
  try {
    const result = await Promise.race([Promise.resolve(handler({ job, payload: job.payload, workerId })), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Job execution timed out')), job.timeoutMs) })])
    return await completeJob(job.id, { workerId, leaseToken: job.lease.token, result })
  } catch (error) { return failJob(job.id, { workerId, leaseToken: job.lease.token, error: error?.message || 'Job failed' }) } finally { clearTimeout(timer) }
}
export async function processJobQueue(options = {}) {
  await materialiseSchedules()
  const workerId = text(options.workerId || `worker-${process.pid}`, 'Worker ID')
  const jobs = await claimJobs(workerId, options)
  const results = []
  for (const job of jobs) results.push(await runClaimed(job, workerId))
  return results
}
export function startJobQueueWorker(options = {}) {
  const id = text(options.workerId || `worker-${process.pid}`, 'Worker ID')
  if (workers.has(id)) return workers.get(id).stop
  const intervalMs = Math.min(60_000, Math.max(1000, Number(options.intervalMs || process.env.JOB_QUEUE_INTERVAL_MS || 5000)))
  let stopped = false; let running = false
  const tick = async () => { if (stopped || running) return; running = true; try { await processJobQueue({ ...options, workerId: id }) } catch (error) { await writeStructuredLog('error', 'Job queue worker failed', { workerId: id, error: error?.message }) } finally { running = false } }
  const timer = setInterval(tick, intervalMs); timer.unref?.(); workers.set(id, { stop: () => { stopped = true; clearInterval(timer); workers.delete(id) } }); tick()
  return workers.get(id).stop
}
