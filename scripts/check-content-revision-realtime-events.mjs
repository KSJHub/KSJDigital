import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/contentRevisionService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishContentRevisionEvent('content-revision.saved'",
  "publishContentRevisionEvent('content-revision.imported'",
  'revisionCount:',
  'totalRevisionCount:',
  'retentionLimitReached:',
  'revisionPruned:',
  'importedRevisionCount:',
  'importTruncated:',
]) {
  if (!source.includes(token)) failures.push(`Missing content revision realtime marker: ${token}`)
}

for (const payloadMarker of [
  "await publishContentRevisionEvent('content-revision.saved', {",
  "await publishContentRevisionEvent('content-revision.imported', {",
]) {
  const start = source.indexOf(payloadMarker)
  const end = source.indexOf('\n  })', start)
  const payload = start >= 0 && end > start ? source.slice(start, end) : ''
  for (const forbidden of [
    'id:',
    'websiteId:',
    'typeId:',
    'recordId:',
    'contentRecordId:',
    'snapshot:',
    'record:',
    'revision:',
    'revisions:',
    'createdAt:',
    'updatedAt:',
    'publishedAt:',
    'title:',
    'slug:',
    'content:',
    'fields:',
    'actor:',
    'session:',
    'request:',
    '...created',
    '...imported',
  ]) {
    if (payload.includes(forbidden)) failures.push(`Content revision realtime payload exposes forbidden data: ${forbidden}`)
  }
}

if (!source.includes("async function publishContentRevisionEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Content revision events must publish aggregate payloads without actor metadata')
}

const stateStart = source.indexOf('function revisionSnapshotState(')
const stateEnd = source.indexOf('\n}\n\nfunction revisionSnapshotChanged', stateStart)
const stateSource = stateStart >= 0 && stateEnd > stateStart ? source.slice(stateStart, stateEnd) : ''
if (!stateSource.includes('delete state.updatedAt')) {
  failures.push('Content revision duplicate detection must ignore timestamp-only snapshot changes')
}

const saveStart = source.indexOf('export async function saveContentRevision(')
const saveEnd = source.indexOf('\n}\n\nexport async function importContentRevisions', saveStart)
const saveSource = saveStart >= 0 && saveEnd > saveStart ? source.slice(saveStart, saveEnd) : ''
const duplicateAt = saveSource.indexOf('if (latest && !revisionSnapshotChanged(latest.snapshot, snapshot)) return latest')
const createAt = saveSource.indexOf('const created = revisionRecord(record)')
const writeAt = saveSource.indexOf('await writeJson(file, next)')
const publishAt = saveSource.indexOf("await publishContentRevisionEvent('content-revision.saved'")
if (duplicateAt < 0 || createAt < duplicateAt || writeAt < createAt || publishAt < writeAt) {
  failures.push('Content revision saves must suppress duplicate snapshots before creation and publish only after persistence')
}

const importStart = source.indexOf('export async function importContentRevisions(')
const importSource = importStart >= 0 ? source.slice(importStart) : ''
const emptyGuardAt = importSource.indexOf('if (!Array.isArray(revisions) || revisions.length === 0) return')
const existingGuardAt = importSource.indexOf('if (all.some(revision => revision.contentRecordId === recordId)) return')
const importWriteAt = importSource.indexOf('await writeJson(file, next)')
const importPublishAt = importSource.indexOf("await publishContentRevisionEvent('content-revision.imported'")
if (emptyGuardAt < 0 || existingGuardAt < emptyGuardAt || importWriteAt < existingGuardAt || importPublishAt < importWriteAt) {
  failures.push('Content revision imports must suppress empty or existing history and publish only after persistence')
}

for (const forbiddenTopic of [
  "publishDomainEvent('content-record.",
  "publishDomainEvent('content-search.",
]) {
  if (source.includes(forbiddenTopic)) failures.push(`Content revision service must not duplicate another module topic: ${forbiddenTopic}`)
}

if (failures.length) {
  console.error('Content revision real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Content revision real-time event checks passed')
