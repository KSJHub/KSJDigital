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
  'function contentStateChanged(',
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

const draftReadStart = source.indexOf('export async function getDraftContent(')
const draftReadEnd = source.indexOf('\nexport async function saveDraftContent', draftReadStart)
const draftReadSource = draftReadStart >= 0 && draftReadEnd > draftReadStart ? source.slice(draftReadStart, draftReadEnd) : ''
const existingGuardAt = draftReadSource.indexOf("if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored")
const initialWriteAt = draftReadSource.indexOf('await writeJson(paths.content(id), starter)')
const initialPublishAt = draftReadSource.indexOf("await publishContentEvent('content.draft-initialised'")
if (existingGuardAt < 0 || initialWriteAt < existingGuardAt || initialPublishAt < initialWriteAt) {
  failures.push('Draft initialisation must return existing content and publish only after starter persistence')
}

const saveStart = source.indexOf('export async function saveDraftContent(')
const saveEnd = source.indexOf('\nexport async function getPublishedContentRecord', saveStart)
const saveSource = saveStart >= 0 && saveEnd > saveStart ? source.slice(saveStart, saveEnd) : ''
const validationAt = saveSource.indexOf('const supplied = contentDocument(input)')
const noOpAt = saveSource.indexOf('if (!contentStateChanged(current, supplied)) return current')
const draftWriteAt = saveSource.indexOf('await writeJson(paths.content(id), saved)')
const draftPublishAt = saveSource.indexOf("await publishContentEvent('content.draft-saved'")
if (validationAt < 0 || noOpAt < validationAt || draftWriteAt < noOpAt || draftPublishAt < draftWriteAt) {
  failures.push('Draft saves must validate, suppress semantic no-ops, persist changes, then publish')
}

const publishStart = source.indexOf('export async function publishContentSnapshot(')
const publishEnd = source.indexOf('\nexport async function publishDraftContent', publishStart)
const publishSource = publishStart >= 0 && publishEnd > publishStart ? source.slice(publishStart, publishEnd) : ''
const snapshotValidationAt = publishSource.indexOf("const source = contentDocument(snapshot, 'Website approval snapshot')")
const publishWriteAt = publishSource.indexOf('await writeJson(paths.publishedContent(id), published)')
const snapshotPublishAt = publishSource.indexOf("await publishContentEvent('content.snapshot-published'")
if (snapshotValidationAt < 0 || publishWriteAt < snapshotValidationAt || snapshotPublishAt < publishWriteAt) {
  failures.push('Snapshot publication must validate before persistence and publish after persistence')
}

const stateStart = source.indexOf('function contentState(')
const stateEnd = source.indexOf('\nfunction contentStateChanged', stateStart)
const stateSource = stateStart >= 0 && stateEnd > stateStart ? source.slice(stateStart, stateEnd) : ''
for (const metadataField of ['createdAt', 'updatedAt', 'updatedBy', 'publishedAt', 'publishedBy', 'publishRequestId', 'initialPublication']) {
  if (!stateSource.includes(`'${metadataField}'`)) failures.push(`Managed content no-op comparison must exclude metadata field: ${metadataField}`)
}

if (failures.length) {
  console.error('Managed content real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Managed content real-time event checks passed')
