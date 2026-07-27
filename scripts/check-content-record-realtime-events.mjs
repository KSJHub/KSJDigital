import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/contentRecordService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishContentRecordEvent('content-record.created'",
  "event.topic || 'content-record.updated'",
  "publishContentRecordEvent('content-record.workflow-transitioned'",
  "topic: 'content-record.revision-restored'",
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

for (const field of ['id', 'type', 'websiteId', 'createdAt', 'updatedAt']) {
  if (!source.includes(`delete state[field]`) || !source.includes(`['id', 'type', 'websiteId', 'createdAt', 'updatedAt']`)) {
    failures.push(`Content record no-op comparison must exclude structural field: ${field}`)
    break
  }
}

const updateStart = source.indexOf('export async function updateContentRecord(')
const updateEnd = source.indexOf('\nexport async function transitionContentRecord(', updateStart)
const updateSource = updateStart >= 0 && updateEnd > updateStart ? source.slice(updateStart, updateEnd) : ''
const compareAt = updateSource.indexOf('if (!contentRecordStateChanged(existing, proposed)) return hydrateRecord(')
const revisionAt = updateSource.indexOf('await saveContentRevision(')
const writeAt = updateSource.indexOf('await writeJson(')
const indexAt = updateSource.indexOf('await indexContentRecord(')
const publishAt = updateSource.indexOf('await publishContentRecordEvent(')
if (compareAt < 0 || revisionAt < compareAt || writeAt < revisionAt || indexAt < writeAt || publishAt < indexAt) {
  failures.push('Content record updates must suppress semantic no-ops before revision, persistence, indexing, and publication')
}

const restoreStart = source.indexOf('export async function restoreContentRecord(')
const restoreEnd = source.indexOf('\nexport async function processScheduledContentRecords(', restoreStart)
const restoreSource = restoreStart >= 0 && restoreEnd > restoreStart ? source.slice(restoreStart, restoreEnd) : ''
if (!restoreSource.includes("return updateContentRecord(websiteId, typeId, recordId, revision.snapshot, actor, {")) {
  failures.push('Revision restore must use the canonical update operation')
}
if (!restoreSource.includes("topic: 'content-record.revision-restored'")) {
  failures.push('Revision restore must assign its lifecycle topic through the canonical update operation')
}
if (restoreSource.includes('publishContentRecordEvent(')) {
  failures.push('Revision restore must not publish a second lifecycle event outside the canonical update operation')
}

for (const [persistToken, publishToken, label] of [
  ['await indexContentRecord(websiteId, typeId, record)', "await publishContentRecordEvent('content-record.created'", 'creation'],
  ['await indexContentRecord(websiteId, typeId, updated)', 'await publishContentRecordEvent(event.topic', 'update or restore'],
  ['await indexContentRecord(websiteId, typeId, updated)', "await publishContentRecordEvent('content-record.workflow-transitioned'", 'workflow transition'],
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
