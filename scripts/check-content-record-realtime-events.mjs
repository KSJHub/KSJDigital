import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/contentRecordService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishContentRecordEvent('content-record.created'",
  "publishContentRecordEvent('content-record.updated'",
  "publishContentRecordEvent('content-record.workflow-transitioned'",
  "publishContentRecordEvent('content-record.revision-restored'",
  "publishContentRecordEvent('content-record.deleted'",
  'fieldCount:',
  'relationshipFieldCount:',
  'workflowEnabled:',
  'published:',
  'scheduled:',
  'revisionCreated:',
  'stateChanged:',
  'scheduledPublication:',
  'automaticPublication:',
  'remainingRecordCount:',
  'nullifiedRelationshipCount:',
]) {
  if (!source.includes(token)) failures.push(`Missing content record realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function contentRecordEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishContentRecordEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''
const deleteStart = source.indexOf("await publishContentRecordEvent('content-record.deleted'")
const deleteEnd = source.indexOf('\n  })', deleteStart)
const deleteSource = deleteStart >= 0 && deleteEnd > deleteStart ? source.slice(deleteStart, deleteEnd) : ''

for (const forbidden of [
  'id:',
  'recordId:',
  'revisionId:',
  'websiteId:',
  'typeId:',
  'actor:',
  'userId:',
  'email:',
  'name:',
  'role:',
  'note:',
  'title:',
  'slug:',
  'body:',
  'content:',
  'fields:',
  'relationships:',
  'history:',
  'revisions:',
  'transitionId:',
  'createdAt:',
  'updatedAt:',
  'publishedAt:',
  'scheduledAt:',
  '...record',
  '...input',
  '...actor',
]) {
  if (payloadSource.includes(forbidden) || deleteSource.includes(forbidden)) {
    failures.push(`Content record realtime payload exposes forbidden data: ${forbidden}`)
  }
}

if (!source.includes("async function publishContentRecordEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Content record events must publish aggregate payloads without actor-derived metadata')
}

for (const [persistToken, publishToken, label] of [
  ['await indexContentRecord(websiteId, typeId, record)', "await publishContentRecordEvent('content-record.created'", 'creation'],
  ['await indexContentRecord(websiteId, typeId, updated)', "await publishContentRecordEvent('content-record.updated'", 'update'],
  ['await indexContentRecord(websiteId, typeId, updated)', "await publishContentRecordEvent('content-record.workflow-transitioned'", 'workflow transition'],
  ['const restored = await updateContentRecord(', "await publishContentRecordEvent('content-record.revision-restored'", 'revision restore'],
  ['await removeContentSearchDocument(websiteId, typeId, recordId)', "await publishContentRecordEvent('content-record.deleted'", 'deletion'],
]) {
  const publishAt = source.indexOf(publishToken)
  const persistAt = source.lastIndexOf(persistToken, publishAt)
  if (persistAt < 0 || publishAt < persistAt) failures.push(`Content record ${label} event must publish after persistence`)
}

if (!source.includes("transitionContentRecord(websiteId, definition.id, record.id, 'publish-scheduled'")) {
  failures.push('Scheduled publication must continue through the canonical workflow transition service')
}

if (failures.length) {
  console.error('Content record real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Content record real-time event checks passed')
