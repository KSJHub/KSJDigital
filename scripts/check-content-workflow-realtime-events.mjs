import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/contentWorkflowService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishContentWorkflowEvent('content-workflow.history-appended'",
  'historyCount:',
  'retentionLimitReached:',
  'historyPruned:',
  'hasNote:',
  'automaticActor:',
  'const existing = event?.id ? events.find(item => item?.id === event.id) : null',
  'if (existing) return existing',
]) {
  if (!source.includes(token)) failures.push(`Missing content workflow realtime marker: ${token}`)
}

const payloadMarker = "await publishContentWorkflowEvent('content-workflow.history-appended', {"
const payloadStart = source.indexOf(payloadMarker)
const payloadEnd = source.indexOf('\n  })', payloadStart)
const payload = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'id:',
  'websiteId:',
  'typeId:',
  'recordId:',
  'transition:',
  'label:',
  'from:',
  'to:',
  'note:',
  'actor:',
  'role:',
  'name:',
  'email:',
  'createdAt:',
  'scheduledAt:',
  'publishedAt:',
  'event:',
  'request:',
  'session:',
  '...event',
]) {
  if (payload.includes(forbidden)) failures.push(`Content workflow realtime payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishContentWorkflowEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Content workflow events must publish aggregate payloads without actor metadata')
}

const appendStart = source.indexOf('export async function appendWorkflowHistory(')
const appendEnd = source.indexOf('\n}\n\nexport function scheduledPublicationIsDue', appendStart)
const appendSource = appendStart >= 0 && appendEnd > appendStart ? source.slice(appendStart, appendEnd) : ''
const duplicateAt = appendSource.indexOf('if (existing) return existing')
const writeAt = appendSource.indexOf('await writeJson(workflowPath(websiteId, typeId, recordId), next)')
const publishAt = appendSource.indexOf("await publishContentWorkflowEvent('content-workflow.history-appended'")

if (duplicateAt < 0 || writeAt < 0 || duplicateAt > writeAt) {
  failures.push('Duplicate workflow history events must return before persistence')
}
if (duplicateAt < 0 || publishAt < 0 || duplicateAt > publishAt) {
  failures.push('Duplicate workflow history events must return before realtime publication')
}
if (writeAt < 0 || publishAt < writeAt) {
  failures.push('Content workflow event must publish after history persistence')
}

for (const forbiddenTopic of [
  "publishDomainEvent('content-record.",
  "publishDomainEvent('content-revision.",
  "publishDomainEvent('content-search.",
]) {
  if (source.includes(forbiddenTopic)) failures.push(`Content workflow service must not duplicate another module topic: ${forbiddenTopic}`)
}

if (failures.length) {
  console.error('Content workflow real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Content workflow real-time event checks passed')
