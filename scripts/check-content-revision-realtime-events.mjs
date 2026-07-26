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

const firstWrite = source.indexOf('await writeJson(file, next)')
for (const marker of [
  "await publishContentRevisionEvent('content-revision.saved'",
  "await publishContentRevisionEvent('content-revision.imported'",
]) {
  const publishAt = source.indexOf(marker)
  if (firstWrite < 0 || publishAt < firstWrite) failures.push(`Content revision event must publish after persistence: ${marker}`)
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
