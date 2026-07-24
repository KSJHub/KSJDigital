import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { publishIntegrationEvent } from './integrationService.js'

const ROOT = path.join(DATA_DIR, 'automations')
const locks = new Map()
const handlers = new Map()
const workers = new Map()
const LEASE_MS = 10 * 60 * 1000
const MAX_HISTORY = 5000
const MAX_PAYLOAD_BYTES = 1_000_000

export class AutomationError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'AutomationError'
    this.status = status
    this.details = details
  }
}

function websiteId(value) {
  const id = safeName(value)
  if (!id || id === 'file') throw new AutomationError('Website id is required', 422)
  return id
}

function file(id) { return path.join(ROOT, `${id}.json`) }
function nowIso() { return new Date().toISOString() }

function initialStore(id) {
  return {
    websiteId: id,
    jobs: [],
    executions: [],
    settings: { enabled: true, workerIntervalMs: 5000, executionRetentionDays: 90, failureAlertThreshold: 3 },
    updatedAt: nowIso(),
  }
}

async function readStore(id) {
  const stored = await readJson(file(id), null)
  if (!stored) {
    const created = initialStore(id)
    await writeJson(file(id), created)
    return created
  }
  if (!Array.isArray(stored.jobs) || !Array.isArray(stored.executions)) throw new AutomationError('Stored automation registry is invalid', 500)
  return stored
}

async function mutate(id, operation) {
  const previous = locks.get(id) || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const store = structuredClone(await readStore(id))
    const result = await operation(store)
    store.websiteId = id
    store.updatedAt = nowIso()
    await writeJson(file(id), store)
    return result === undefined ? store : result
  })
  locks.set(id, current)
  try { return await current } finally { if (locks.get(id) === current) locks.delete(id) }
}

function requiredText(value, label, max = 200) {
  const result = String(value || '').trim()
  if (!result) throw new AutomationError(`${label} is required`, 422)
  if (result.length > max) throw new AutomationError(`${label} is too long`, 422)
  return result
}

function validatePayload(payload) {
  const value = payload ?? {}
  let serialised
  try { serialised = JSON.stringify(value) } catch { throw new AutomationError('Job payload must be JSON serialisable', 422) }
  if (Buffer.byteLength(serialised) > MAX_PAYLOAD_BYTES) throw new AutomationError('Job payload is too large', 413)
  return value
}

function normaliseSchedule(input = {}, existing = null) {
  const type = String(input.type ?? existing?.type ?? 'once')
  if (!['once', 'interval'].includes(type)) throw new AutomationError('Schedule type must be once or interval', 422)
  if (type === 'once') {
    const at = new Date(input.at ?? existing?.at ?? Date.now())
    if (Number.isNaN(at.getTime())) throw new AutomationError('Scheduled time is invalid', 422)
    return { type, at: at.toISOString(), intervalMs: null }
  }
  const intervalMs = Number(input.intervalMs ?? existing?.intervalMs)
  if (!Number.isFinite(intervalMs) || intervalMs < 60_000 || intervalMs > 365 * 86_400_000) {
    throw new AutomationError('Recurring interval must be between one minute and one year', 422)
  }
  return { type, at: null, intervalMs: Math.floor(intervalMs) }
}

function nextRun(schedule, from = Date.now()) {
  if (schedule.type === 'once') return schedule.at
  return new Date(from + schedule.intervalMs).toISOString()
}

function publicJob(job) {
  return { ...job, payload: job.payload }
}

export function registerAutomationHandler(idValue, handler) {
  const id = requiredText(idValue, 'Handler id', 100)
  if (!/^[a-z][a-z0-9._-]*$/i.test(id)) throw new AutomationError('Handler id is invalid', 422)
  if (typeof handler !== 'function') throw new AutomationError('Automation handler must be a function', 422)
  handlers.set(id, handler)
  return id
}

registerAutomationHandler('noop', async ({ payload }) => ({ ok: true, payload }))
registerAutomationHandler('integration-event', async ({ websiteId: id, payload }) => {
  const eventName = requiredText(payload?.eventName, 'Integration event name')
  return publishIntegrationEvent(id, eventName, payload?.data ?? {}, { automation: true })
})

export function listAutomationHandlers() { return [...handlers.keys()].sort() }

export async function getAutomationRegistry(websiteValue) {
  const store = await readStore(websiteId(websiteValue))
  return { ...store, jobs: store.jobs.map(publicJob) }
}

export async function upsertAutomationJob(websiteValue, input = {}) {
  const id = websiteId(websiteValue)
  return mutate(id, store => {
    const existing = input.id ? store.jobs.find(item => item.id === input.id) : null
    if (input.id && !existing) throw new AutomationError('Automation job not found', 404)
    const schedule = normaliseSchedule(input.schedule || {}, existing?.schedule)
    const handler = requiredText(input.handler ?? existing?.handler, 'Handler')
    if (!handlers.has(handler)) throw new AutomationError('Unknown automation handler', 422, { handler })
    const now = nowIso()
    const job = {
      id: existing?.id || crypto.randomUUID(),
      name: requiredText(input.name ?? existing?.name, 'Job name'),
      handler,
      payload: validatePayload(input.payload === undefined ? existing?.payload : input.payload),
      schedule,
      enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
      maxAttempts: Math.min(12, Math.max(1, Number(input.maxAttempts ?? existing?.maxAttempts ?? 3))),
      timeoutMs: Math.min(15 * 60_000, Math.max(1000, Number(input.timeoutMs ?? existing?.timeoutMs ?? 60_000))),
      nextRunAt: input.nextRunAt ? new Date(input.nextRunAt).toISOString() : existing?.nextRunAt || nextRun(schedule),
      consecutiveFailures: existing?.consecutiveFailures || 0,
      lastRunAt: existing?.lastRunAt || null,
      lastSuccessAt: existing?.lastSuccessAt || null,
      lastFailureAt: existing?.lastFailureAt || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
    if (Number.isNaN(new Date(job.nextRunAt).getTime())) throw new AutomationError('Next run time is invalid', 422)
    store.jobs = [job, ...store.jobs.filter(item => item.id !== job.id)]
    return publicJob(job)
  })
}

export async function deleteAutomationJob(websiteValue, jobId) {
  const id = websiteId(websiteValue)
  return mutate(id, store => {
    if (!store.jobs.some(item => item.id === jobId)) throw new AutomationError('Automation job not found', 404)
    store.jobs = store.jobs.filter(item => item.id !== jobId)
    for (const execution of store.executions) if (execution.jobId === jobId && ['pending', 'processing', 'retrying'].includes(execution.status)) execution.status = 'cancelled'
    return { deleted: true, id: jobId }
  })
}

export async function enqueueAutomationJob(websiteValue, jobId, options = {}) {
  const id = websiteId(websiteValue)
  return mutate(id, store => {
    const job = store.jobs.find(item => item.id === jobId)
    if (!job) throw new AutomationError('Automation job not found', 404)
    const now = nowIso()
    const execution = {
      id: crypto.randomUUID(), jobId, handler: job.handler,
      payload: validatePayload(options.payload ?? job.payload), status: 'pending', attempts: 0,
      nextAttemptAt: now, leaseUntil: null, startedAt: null, completedAt: null,
      result: null, error: null, createdAt: now, updatedAt: now,
    }
    store.executions.push(execution)
    return execution
  })
}

export async function cancelAutomationExecution(websiteValue, executionId) {
  const id = websiteId(websiteValue)
  return mutate(id, store => {
    const execution = store.executions.find(item => item.id === executionId)
    if (!execution) throw new AutomationError('Automation execution not found', 404)
    if (['completed', 'failed', 'cancelled'].includes(execution.status)) return execution
    Object.assign(execution, { status: 'cancelled', leaseUntil: null, completedAt: nowIso(), updatedAt: nowIso() })
    return execution
  })
}

export async function retryAutomationExecution(websiteValue, executionId) {
  const id = websiteId(websiteValue)
  return mutate(id, store => {
    const execution = store.executions.find(item => item.id === executionId)
    if (!execution) throw new AutomationError('Automation execution not found', 404)
    Object.assign(execution, { status: 'pending', attempts: 0, nextAttemptAt: nowIso(), leaseUntil: null, startedAt: null, completedAt: null, result: null, error: null, updatedAt: nowIso() })
    return execution
  })
}

function retryAt(attempts) {
  return new Date(Date.now() + Math.min(6 * 60 * 60_000, 30_000 * (2 ** Math.max(0, attempts - 1)))).toISOString()
}

async function scheduleDueJobs(id) {
  return mutate(id, store => {
    if (store.settings?.enabled === false) return 0
    const now = Date.now()
    let queued = 0
    for (const job of store.jobs) {
      if (!job.enabled || new Date(job.nextRunAt).getTime() > now) continue
      const alreadyQueued = store.executions.some(item => item.jobId === job.id && ['pending', 'processing', 'retrying'].includes(item.status))
      if (!alreadyQueued) {
        const createdAt = nowIso()
        store.executions.push({ id: crypto.randomUUID(), jobId: job.id, handler: job.handler, payload: job.payload, status: 'pending', attempts: 0, nextAttemptAt: createdAt, leaseUntil: null, startedAt: null, completedAt: null, result: null, error: null, createdAt, updatedAt: createdAt })
        queued += 1
      }
      if (job.schedule.type === 'once') job.enabled = false
      else job.nextRunAt = nextRun(job.schedule, Math.max(now, new Date(job.nextRunAt).getTime()))
      job.updatedAt = nowIso()
    }
    return queued
  })
}

async function claimExecutions(id, limit) {
  return mutate(id, store => {
    const now = Date.now()
    for (const item of store.executions) {
      if (item.status === 'processing' && (!item.leaseUntil || new Date(item.leaseUntil).getTime() <= now)) {
        Object.assign(item, { status: 'retrying', nextAttemptAt: nowIso(), leaseUntil: null, error: 'Recovered after interrupted execution', updatedAt: nowIso() })
      }
    }
    const due = store.executions.filter(item => ['pending', 'retrying'].includes(item.status) && new Date(item.nextAttemptAt).getTime() <= now).slice(0, limit)
    const leaseUntil = new Date(now + LEASE_MS).toISOString()
    for (const item of due) Object.assign(item, { status: 'processing', leaseUntil, startedAt: item.startedAt || nowIso(), updatedAt: nowIso() })
    return structuredClone(due)
  })
}

async function executeWithTimeout(handler, context, timeoutMs) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve(handler(context)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Automation execution timed out')), timeoutMs) }),
    ])
  } finally { clearTimeout(timer) }
}

export async function processAutomationQueue(websiteValue, options = {}) {
  const id = websiteId(websiteValue)
  await scheduleDueJobs(id)
  const claimed = await claimExecutions(id, Math.min(100, Math.max(1, Number(options.limit || 20))))
  const results = []
  for (const claimedExecution of claimed) {
    const snapshot = await readStore(id)
    const job = snapshot.jobs.find(item => item.id === claimedExecution.jobId)
    const handler = handlers.get(claimedExecution.handler)
    if (!job || !handler || !job.enabled && job.schedule.type !== 'once') {
      await mutate(id, store => {
        const item = store.executions.find(entry => entry.id === claimedExecution.id)
        if (item) Object.assign(item, { status: 'cancelled', leaseUntil: null, completedAt: nowIso(), error: 'Job is disabled, missing, or has no handler', updatedAt: nowIso() })
      })
      results.push({ id: claimedExecution.id, status: 'cancelled' })
      continue
    }
    try {
      const result = await executeWithTimeout(handler, { websiteId: id, job, payload: claimedExecution.payload, executionId: claimedExecution.id }, job.timeoutMs)
      await mutate(id, store => {
        const item = store.executions.find(entry => entry.id === claimedExecution.id)
        const currentJob = store.jobs.find(entry => entry.id === claimedExecution.jobId)
        if (item) Object.assign(item, { status: 'completed', attempts: item.attempts + 1, leaseUntil: null, completedAt: nowIso(), result: validatePayload(result ?? null), error: null, updatedAt: nowIso() })
        if (currentJob) Object.assign(currentJob, { consecutiveFailures: 0, lastRunAt: nowIso(), lastSuccessAt: nowIso(), updatedAt: nowIso() })
      })
      results.push({ id: claimedExecution.id, status: 'completed' })
    } catch (error) {
      let finalStatus = 'failed'
      let failures = 0
      await mutate(id, store => {
        const item = store.executions.find(entry => entry.id === claimedExecution.id)
        const currentJob = store.jobs.find(entry => entry.id === claimedExecution.jobId)
        if (!item) return
        const attempts = item.attempts + 1
        finalStatus = attempts >= (currentJob?.maxAttempts || 1) ? 'failed' : 'retrying'
        Object.assign(item, { status: finalStatus, attempts, leaseUntil: null, nextAttemptAt: retryAt(attempts), completedAt: finalStatus === 'failed' ? nowIso() : null, error: String(error?.message || error), updatedAt: nowIso() })
        if (currentJob) {
          failures = (currentJob.consecutiveFailures || 0) + 1
          Object.assign(currentJob, { consecutiveFailures: failures, lastRunAt: nowIso(), lastFailureAt: nowIso(), updatedAt: nowIso() })
        }
      })
      const threshold = Number(snapshot.settings?.failureAlertThreshold || 3)
      if (finalStatus === 'failed' && failures >= threshold) {
        publishIntegrationEvent(id, 'automation.failed', { jobId: claimedExecution.jobId, executionId: claimedExecution.id, error: String(error?.message || error), consecutiveFailures: failures }, { automationHealthAlert: true }).catch(() => {})
      }
      results.push({ id: claimedExecution.id, status: finalStatus })
    }
  }
  return { processed: results.length, results }
}

export async function searchAutomationExecutions(websiteValue, query = {}) {
  const store = await readStore(websiteId(websiteValue))
  let results = [...store.executions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (query.jobId) results = results.filter(item => item.jobId === query.jobId)
  if (query.status) results = results.filter(item => item.status === query.status)
  const total = results.length
  const offset = Math.max(0, Number(query.offset || 0))
  const limit = Math.min(200, Math.max(1, Number(query.limit || 50)))
  return { total, offset, limit, hasMore: offset + limit < total, results: results.slice(offset, offset + limit) }
}

export async function updateAutomationSettings(websiteValue, input = {}) {
  const id = websiteId(websiteValue)
  return mutate(id, store => {
    store.settings = {
      enabled: input.enabled === undefined ? store.settings?.enabled !== false : input.enabled === true,
      workerIntervalMs: Math.min(300_000, Math.max(5000, Number(input.workerIntervalMs ?? store.settings?.workerIntervalMs ?? 5000))),
      executionRetentionDays: Math.min(3650, Math.max(1, Number(input.executionRetentionDays ?? store.settings?.executionRetentionDays ?? 90))),
      failureAlertThreshold: Math.min(100, Math.max(1, Number(input.failureAlertThreshold ?? store.settings?.failureAlertThreshold ?? 3))),
    }
    return store.settings
  })
}

export async function getAutomationHealth(websiteValue) {
  const store = await readStore(websiteId(websiteValue))
  const counts = Object.fromEntries(['pending', 'processing', 'retrying', 'completed', 'failed', 'cancelled'].map(status => [status, store.executions.filter(item => item.status === status).length]))
  const unhealthyJobs = store.jobs.filter(job => job.consecutiveFailures >= Number(store.settings?.failureAlertThreshold || 3)).map(job => ({ id: job.id, name: job.name, consecutiveFailures: job.consecutiveFailures, lastFailureAt: job.lastFailureAt }))
  return { websiteId: store.websiteId, enabled: store.settings?.enabled !== false, counts, unhealthyJobs, healthy: unhealthyJobs.length === 0 }
}

export async function pruneAutomationExecutions(websiteValue) {
  const id = websiteId(websiteValue)
  return mutate(id, store => {
    const cutoff = Date.now() - Number(store.settings?.executionRetentionDays || 90) * 86_400_000
    const before = store.executions.length
    store.executions = store.executions.filter(item => !['completed', 'failed', 'cancelled'].includes(item.status) || new Date(item.updatedAt).getTime() >= cutoff).slice(-MAX_HISTORY)
    return { removed: before - store.executions.length, remaining: store.executions.length }
  })
}

export async function listAutomationWebsiteIds() {
  const { readdir } = await import('node:fs/promises')
  try { return (await readdir(ROOT)).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
}

export function startAutomationWorker(options = {}) {
  const tickMs = Math.max(5000, Number(options.tickMs || 5000))
  if (workers.has('global')) return workers.get('global')
  const lastRuns = new Map()
  const run = async () => {
    for (const id of await listAutomationWebsiteIds()) {
      try {
        const store = await readStore(id)
        const interval = Math.max(5000, Number(store.settings?.workerIntervalMs || 5000))
        if (Date.now() - (lastRuns.get(id) || 0) < interval) continue
        lastRuns.set(id, Date.now())
        await processAutomationQueue(id)
        await pruneAutomationExecutions(id)
      } catch (error) { console.error(`Automation worker failed for ${id}`, error) }
    }
  }
  const timer = setInterval(run, tickMs)
  timer.unref?.()
  workers.set('global', timer)
  run().catch(error => console.error('Automation worker startup failed', error))
  return timer
}
