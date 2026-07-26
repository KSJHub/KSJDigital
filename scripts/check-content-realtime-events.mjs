import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/contentService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishContentEvent('content.draft-initialised'",
  "publishContentEvent('content.draft-saved'",
  "publishContentEvent('content.snapshot-published'",
  'topLevelFieldCount:',
  'collectionCount:',
  'populatedCollectionCount:',
  'initialised:',
  'published:',
  'initialPublication:',
]) {
  if (!source.includes(token)) failures.push(`Missing managed content realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function contentEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishContentEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'websiteId:',
  'updatedBy:',
  'publishedBy:',
  'publishRequestId:',
  'createdAt:',
  'updatedAt:',
  'publishedAt:',
  'document:',
  'content:',
  'snapshot:',
  'components:',
  'pages:',
  'sections:',
  'blocks:',
  '...document',
  '...details',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Managed content payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishContentEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Managed content events must publish aggregate payloads without actor-derived metadata')
}

const initialWrite = source.indexOf('await writeJson(paths.content(id), starter)')
const initialPublish = source.indexOf("await publishContentEvent('content.draft-initialised'")
if (initialWrite < 0 || initialPublish < initialWrite) failures.push('Draft initialisation events must publish after persistence')

const draftWrite = source.indexOf('await writeJson(paths.content(id), saved)')
const draftPublish = source.indexOf("await publishContentEvent('content.draft-saved'")
if (draftWrite < 0 || draftPublish < draftWrite) failures.push('Draft save events must publish after persistence')

const publishWrite = source.indexOf('await writeJson(paths.publishedContent(id), published)')
const snapshotPublish = source.indexOf("await publishContentEvent('content.snapshot-published'")
if (publishWrite < 0 || snapshotPublish < publishWrite) failures.push('Snapshot publication events must publish after persistence')

if (failures.length) {
  console.error('Managed content real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Managed content real-time event checks passed')
