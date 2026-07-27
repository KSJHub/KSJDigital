import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/jobQueueRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishJobRealtimeEvent('job.enqueued'",
  "publishJobRealtimeEvent('job.cancelled'",
  "publishJobRealtimeEvent('job.requeued'",
  "publishJobRealtimeEvent('job.schedule-updated'",
  "publishJobRealtimeEvent('job.claimed'",
  "publishJobRealtimeEvent('job.lease-renewed'",
  "publishJobRealtimeEvent('job.completed'",
  "'job.dead-lettered' : 'job.retry-scheduled'",
  "publishJobRealtimeEvent('job.queue-processed'",
  'attemptCount:',
  'hasPayload:',
  'hasResult:',
  'hasError:',
  'terminal:',
  'processedCount:',
  'completedCount:',
  'retryingCount:',
  'deadLetterCount:',
  'claimedCount:',
]) {
  if (!router.includes(token)) failures.push(`Missing job queue realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function jobEventPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishJobRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'jobId:',
  'jobIds:',
  'scheduleId:',
  'workerId:',
  'websiteId:',
  'queue:',
  'handler:',
  'payload:',
  'result:',
  'error:',
  'leaseExpiresAt:',
  'nextAttemptAt:',
  'nextRunAt:',
  'actor:',
  'session',
  'email:',
  'userId:',
  'req.body',
  'req.params',
  '...job',
  '...jobs',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Job queue event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishJobRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Job queue events must publish aggregate payloads without actor-derived metadata')
}

const enqueueGuard = router.indexOf("if (!before.jobs.some(item => item.id === job.id)) await publishJobRealtimeEvent('job.enqueued'")
if (enqueueGuard < 0) failures.push('Idempotent enqueue requests must not publish duplicate job.enqueued events')

const cancelGuard = router.indexOf("if (['completed', 'dead-lettered', 'cancelled'].includes(existing.status)) return res.json(existing)")
const cancelMutation = router.indexOf('const job = await cancelJob(req.params.jobId, null)')
const cancelPublish = router.indexOf("await publishJobRealtimeEvent('job.cancelled'")
if (cancelGuard < 0 || cancelMutation < cancelGuard || cancelPublish < cancelMutation) {
  failures.push('Terminal jobs must return before cancellation persistence and publication')
}

const scheduleGuard = router.indexOf('if (!schedulePatchChanges(existing, req.body || {})) return res.json(existing)')
const scheduleMutation = router.indexOf('const schedule = await upsertJobSchedule(')
const schedulePublish = router.indexOf("await publishJobRealtimeEvent('job.schedule-updated'")
if (scheduleGuard < 0 || scheduleMutation < scheduleGuard || schedulePublish < scheduleMutation) {
  failures.push('Unchanged job schedules must return before persistence and publication')
}

if (!router.includes("if (jobs.length > 0) await publishJobRealtimeEvent('job.claimed'")) {
  failures.push('Empty job claims must not publish realtime events')
}
if (!router.includes("if (jobs.length > 0) await publishJobRealtimeEvent('job.queue-processed'")) {
  failures.push('Empty job queue runs must not publish realtime events')
}

for (const topic of [
  'job.enqueued',
  'job.cancelled',
  'job.requeued',
  'job.schedule-updated',
  'job.claimed',
  'job.lease-renewed',
  'job.completed',
  'job.retry-scheduled',
  'job.dead-lettered',
  'job.queue-processed',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Job queue topic must be owned by the canonical job publisher: ${topic}`)
}

if (failures.length) {
  console.error('Job queue real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Job queue real-time event checks passed')
