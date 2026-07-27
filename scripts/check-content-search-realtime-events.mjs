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
  'id:', 'key:', 'websiteId:', 'type:', 'title:', 'summary:', 'workflowState:', 'filters:', 'weighted:',
  'relationships:', 'field:', 'text:', 'tokens:', 'createdAt:', 'updatedAt:', 'publishedAt:', 'record:',
  'actor:', 'session:', 'request:', '...document',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Content search realtime payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishContentSearchEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Content search events must publish aggregate payloads without actor-derived metadata')
}

for (const [functionName, publishMarker] of [
  ['export async function indexContentRecord(', "await publishContentSearchEvent('content-search.document-indexed'"],
  ['export async function removeContentSearchDocument(', "await publishContentSearchEvent('content-search.document-removed'"],
  ['export async function rebuildContentSearchIndex(', "await publishContentSearchEvent('content-search.index-rebuilt'"],
]) {
  const start = source.indexOf(functionName)
  const end = source.indexOf('\nexport ', start + functionName.length)
  const block = start >= 0 ? source.slice(start, end > start ? end : source.length) : ''
  const mutationAt = block.indexOf('await mutateIndex(')
  const publishAt = block.indexOf(publishMarker)
  if (mutationAt < 0 || publishAt < mutationAt) failures.push(`Content search event must publish after index persistence: ${publishMarker}`)
}

for (const token of [
  'if (next !== documents) await writeJson(searchPath(websiteId), next)',
  'if (current && !searchDocumentStateChanged(current, document)) return documents',
  'if (!changed) return document',
  'return removed ? filtered : documents',
  'if (!removed) return next',
]) {
  if (!source.includes(token)) failures.push(`Missing content search no-op suppression: ${token}`)
}

for (const field of ['delete state.updatedAt']) {
  if (!source.includes(field)) failures.push(`Content search comparison must ignore lifecycle metadata: ${field}`)
}

for (const forbiddenTopic of ["publishDomainEvent('content-record.", "publishDomainEvent('content."]) {
  if (source.includes(forbiddenTopic)) failures.push(`Content search service must not duplicate another module topic: ${forbiddenTopic}`)
}

if (failures.length) {
  console.error('Content search real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Content search real-time event checks passed')
