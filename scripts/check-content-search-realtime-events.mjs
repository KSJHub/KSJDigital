import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/contentSearchService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishContentSearchEvent('content-search.document-indexed'",
  "publishContentSearchEvent('content-search.document-removed'",
  "publishContentSearchEvent('content-search.index-rebuilt'",
  'documentCount:',
  'published:',
  'weightedFieldCount:',
  'filterCount:',
  'relationshipCount:',
  'removed:',
  'searchableTypeCount:',
  'publishedDocumentCount:',
  'unpublishedDocumentCount:',
]) {
  if (!source.includes(token)) failures.push(`Missing content search realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function searchDocumentEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishContentSearchEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'id:',
  'key:',
  'websiteId:',
  'type:',
  'title:',
  'summary:',
  'workflowState:',
  'filters:',
  'weighted:',
  'relationships:',
  'field:',
  'text:',
  'tokens:',
  'createdAt:',
  'updatedAt:',
  'publishedAt:',
  'record:',
  'actor:',
  'session:',
  'request:',
  '...document',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Content search realtime payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishContentSearchEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Content search events must publish aggregate payloads without actor-derived metadata')
}

const writeAt = source.indexOf('await writeJson(searchPath(websiteId), next)')
for (const marker of [
  "await publishContentSearchEvent('content-search.document-indexed'",
  "await publishContentSearchEvent('content-search.document-removed'",
  "await publishContentSearchEvent('content-search.index-rebuilt'",
]) {
  const publishAt = source.indexOf(marker)
  if (writeAt < 0 || publishAt < writeAt) failures.push(`Content search event must publish after index persistence: ${marker}`)
}

for (const forbiddenTopic of [
  "publishDomainEvent('content-record.",
  "publishDomainEvent('content.",
]) {
  if (source.includes(forbiddenTopic)) failures.push(`Content search service must not duplicate another module topic: ${forbiddenTopic}`)
}

if (failures.length) {
  console.error('Content search real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Content search real-time event checks passed')
