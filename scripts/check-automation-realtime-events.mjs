import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/automationRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishAutomationRealtimeEvent('automation.job-created'",
  "publishAutomationRealtimeEvent('automation.job-updated'",
  "publishAutomationRealtimeEvent('automation.job-deleted'",
  "publishAutomationRealtimeEvent('automation.execution-queued'",
  "publishAutomationRealtimeEvent('automation.execution-cancelled'",
  "publishAutomationRealtimeEvent('automation.execution-retried'",
  "publishAutomationRealtimeEvent('automation.queue-processed'",
  "publishAutomationRealtimeEvent('automation.settings-updated'",
  'jobCount:',
  'enabledJobCount:',
  'executionCount:',
  'pendingExecutionCount:',
  'recurring:',
  'hasPayload:',
  'processedCount:',
  'completedCount:',
  'retryingCount:',
  'failedCount:',
  'cancelledCount:',
  'attemptCount:',
  'hasResult:',
  'hasError:',
  'terminal:',
]) {
  if (!router.includes(token)) failures.push(`Missing automation realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function automationRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishAutomationRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'websiteId:',
  'jobId:',
  'executionId:',
  'handler:',
  'payload:',
  'result:',
  'results:',
  'settings:',
  'nextRunAt:',
  'actor:',
  'session',
  'email:',
  'userId:',
  'req.body',
  'req.params',
  '...job',
  '...execution',
  '...result',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Automation event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishAutomationRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Automation events must publish aggregate payloads without actor-derived metadata')
}

const jobGuard = router.indexOf('if (!jobPatchChanges(existing, input)) return res.json(existing)')
const jobMutation = router.indexOf('const job = await upsertAutomationJob(req.params.websiteId, { ...input, id: req.params.jobId })')
const jobPublish = router.indexOf("await publishAutomationRealtimeEvent('automation.job-updated'")
if (jobGuard < 0 || jobMutation < jobGuard || jobPublish < jobMutation) {
  failures.push('Unchanged automation jobs must return before persistence and publication')
}

const cancelGuard = router.indexOf("if (['completed', 'failed', 'cancelled'].includes(existing.status)) return res.json(existing)")
const cancelMutation = router.indexOf('const execution = await cancelAutomationExecution(')
const cancelPublish = router.indexOf("await publishAutomationRealtimeEvent('automation.execution-cancelled'")
if (cancelGuard < 0 || cancelMutation < cancelGuard || cancelPublish < cancelMutation) {
  failures.push('Terminal automation executions must not be cancelled or published again')
}

const retryGuard = router.indexOf("if (existing.status === 'pending' && Number(existing.attempts) === 0 && !existing.error) return res.json(existing)")
const retryMutation = router.indexOf('const execution = await retryAutomationExecution(')
const retryPublish = router.indexOf("await publishAutomationRealtimeEvent('automation.execution-retried'")
if (retryGuard < 0 || retryMutation < retryGuard || retryPublish < retryMutation) {
  failures.push('Already-pending automation executions must not be retried or published again')
}

if (!router.includes("if (result.processed > 0) await publishAutomationRealtimeEvent('automation.queue-processed'")) {
  failures.push('Empty automation queue runs must not publish realtime events')
}

const settingsGuard = router.indexOf('if (!settingsPatchChanges(registry.settings, input)) return res.json(registry.settings)')
const settingsMutation = router.indexOf('const settings = await updateAutomationSettings(req.params.websiteId, input)')
const settingsPublish = router.indexOf("await publishAutomationRealtimeEvent('automation.settings-updated'")
if (settingsGuard < 0 || settingsMutation < settingsGuard || settingsPublish < settingsMutation) {
  failures.push('Unchanged automation settings must return before persistence and publication')
}

for (const topic of [
  'automation.job-created',
  'automation.job-updated',
  'automation.job-deleted',
  'automation.execution-queued',
  'automation.execution-cancelled',
  'automation.execution-retried',
  'automation.queue-processed',
  'automation.settings-updated',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Automation topic must be owned by the canonical automation publisher: ${topic}`)
}

if (failures.length) {
  console.error('Automation real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Automation real-time event checks passed')
