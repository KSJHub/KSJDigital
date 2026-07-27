import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/contentWorkflowScheduler.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishDomainEvent('content-workflow.scheduler-run'",
  'websiteCount,',
  'processedWebsiteCount,',
  'failedWebsiteCount,',
  'publishedRecordCount,',
  'hadPublications:',
  'completedWithoutFailures:',
]) {
  if (!source.includes(token)) failures.push(`Missing content workflow scheduler realtime marker: ${token}`)
}

const payloadMarker = 'await publishSchedulerEvent({' 
const payloadStart = source.indexOf(payloadMarker)
const payloadEnd = source.indexOf('\n        })', payloadStart)
const payload = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'websiteId:',
  'recordId:',
  'typeId:',
  'published:',
  'records:',
  'websites:',
  'error:',
  'message:',
  'stack:',
  'startedAt:',
  'completedAt:',
  'duration:',
  'actor:',
  'session:',
  'request:',
]) {
  if (payload.includes(forbidden)) failures.push(`Content workflow scheduler realtime payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishSchedulerEvent(payload) {\n  await publishDomainEvent('content-workflow.scheduler-run', payload)\n}")) {
  failures.push('Content workflow scheduler event must publish an aggregate payload without actor metadata')
}

const processAt = source.indexOf('const published = await processScheduledContentRecords(websiteId)')
const suppressionAt = source.indexOf('if (publishedRecordCount > 0 || failedWebsiteCount > 0) {')
const publishAt = source.indexOf('await publishSchedulerEvent({')
if (processAt < 0 || publishAt < processAt) {
  failures.push('Content workflow scheduler event must publish after scheduled record processing')
}
if (suppressionAt < 0 || suppressionAt < processAt || publishAt < suppressionAt) {
  failures.push('Content workflow scheduler must suppress clean empty runs before publication')
}

for (const required of [
  'publishedRecordCount > 0',
  'failedWebsiteCount > 0',
]) {
  if (!source.includes(required)) failures.push(`Scheduler publication guard is missing: ${required}`)
}

for (const forbiddenTopic of [
  "publishDomainEvent('content-record.",
  "publishDomainEvent('content-revision.",
  "publishDomainEvent('content-search.",
]) {
  if (source.includes(forbiddenTopic)) failures.push(`Content workflow scheduler must not duplicate another module topic: ${forbiddenTopic}`)
}

if (failures.length) {
  console.error('Content workflow scheduler real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Content workflow scheduler real-time event checks passed')
