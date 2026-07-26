import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/dynamicContentRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishDynamicContentEvent('content.record-created'",
  "publishDynamicContentEvent('content.record-updated'",
  "publishDynamicContentEvent('content.workflow-transitioned'",
  "publishDynamicContentEvent('content.record-restored'",
  "publishDynamicContentEvent('content.record-deleted'",
  "publishDynamicContentEvent('content.scheduled-processed'",
  "publishDynamicContentEvent('content.search-index-rebuilt'",
  'hasWorkflow:',
  'revisionCount:',
  'relationshipCount:',
  'fieldCount:',
  'restored:',
  'transitioned:',
  'remainingRecordCount:',
  'publishedRecordCount:',
  'documentCount:',
]) {
  if (!source.includes(token)) failures.push(`Missing dynamic content realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function recordEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishDynamicContentEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'id: record.id',
  'type: record.type',
  'websiteId: record.websiteId',
  'createdAt:',
  'updatedAt:',
  'revisions:',
  'workflow:',
  'relationships:',
  'values:',
  'fields:',
  'actor:',
  'session:',
  'request:',
  'body:',
  '...record',
  '...details',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Dynamic content payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishDynamicContentEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Dynamic content events must publish aggregate payloads without actor-derived metadata')
}

for (const [operation, topic] of [
  ['const record = await createContentRecord(', "content.record-created"],
  ['const record = await updateContentRecord(', "content.record-updated"],
  ['const record = await transitionContentRecord(', "content.workflow-transitioned"],
  ['const record = await restoreContentRecord(', "content.record-restored"],
  ['const records = await deleteContentRecord(', "content.record-deleted"],
  ['const published = await processScheduledContentRecords(', "content.scheduled-processed"],
  ['const documents = await rebuildContentSearchIndexForWebsite(', "content.search-index-rebuilt"],
]) {
  const operationIndex = source.indexOf(operation)
  const publishIndex = source.indexOf(`publishDynamicContentEvent('${topic}'`)
  if (operationIndex < 0 || publishIndex < operationIndex) failures.push(`Dynamic content event must publish after successful operation: ${topic}`)
}

if (failures.length) {
  console.error('Dynamic content real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Dynamic content real-time event checks passed')
