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
  ['const record = await createContentRecord(', 'content.record-created'],
  ['const record = await updateContentRecord(', 'content.record-updated'],
  ['const record = await transitionContentRecord(', 'content.workflow-transitioned'],
  ['const record = await restoreContentRecord(', 'content.record-restored'],
  ['const records = await deleteContentRecord(', 'content.record-deleted'],
  ['const published = await processScheduledContentRecords(', 'content.scheduled-processed'],
  ['const documents = await rebuildContentSearchIndexForWebsite(', 'content.search-index-rebuilt'],
]) {
  const operationIndex = source.indexOf(operation)
  const publishIndex = source.indexOf(`publishDynamicContentEvent('${topic}'`)
  if (operationIndex < 0 || publishIndex < operationIndex) failures.push(`Dynamic content event must publish after successful operation: ${topic}`)
}

const scheduledStart = source.indexOf("router.post('/:websiteId/process-scheduled'")
const scheduledEnd = source.indexOf("\n  router.get('/:websiteId/:typeId'", scheduledStart)
const scheduledSource = scheduledStart >= 0 && scheduledEnd > scheduledStart ? source.slice(scheduledStart, scheduledEnd) : ''
const scheduledOperationAt = scheduledSource.indexOf('const published = await processScheduledContentRecords(')
const scheduledGuardAt = scheduledSource.indexOf('if (published.length > 0)')
const scheduledPublishAt = scheduledSource.indexOf("publishDynamicContentEvent('content.scheduled-processed'")
if (scheduledOperationAt < 0 || scheduledGuardAt < scheduledOperationAt || scheduledPublishAt < scheduledGuardAt) {
  failures.push('Scheduled content processing must suppress publication when no records were published')
}

for (const [route, guard, operation] of [
  ["router.post('/:websiteId/search/rebuild'", 'if (!requireOwner(req, res)) return', 'rebuildContentSearchIndexForWebsite('],
  ["router.post('/:websiteId/process-scheduled'", 'if (!requireOwner(req, res)) return', 'processScheduledContentRecords('],
  ["router.post('/:websiteId/:typeId'", 'if (!requireEdit(req, res)) return', 'createContentRecord('],
  ["router.patch('/:websiteId/:typeId/:recordId'", 'if (!requireEdit(req, res)) return', 'updateContentRecord('],
  ["router.post('/:websiteId/:typeId/:recordId/transitions/:transitionId'", 'if (!requireWorkflow(req, res)) return', 'transitionContentRecord('],
  ["router.post('/:websiteId/:typeId/:recordId/restore/:revisionId'", 'if (!requireEdit(req, res)) return', 'restoreContentRecord('],
  ["router.delete('/:websiteId/:typeId/:recordId'", 'if (!requireEdit(req, res)) return', 'deleteContentRecord('],
]) {
  const routeStart = source.indexOf(route)
  const nextRoute = source.indexOf('\n  router.', routeStart + route.length)
  const routeSource = routeStart >= 0 ? source.slice(routeStart, nextRoute > routeStart ? nextRoute : source.length) : ''
  const guardAt = routeSource.indexOf(guard)
  const operationAt = routeSource.indexOf(operation)
  if (guardAt < 0 || operationAt < guardAt) failures.push(`Dynamic content route must enforce permission before mutation: ${route}`)
}

if (failures.length) {
  console.error('Dynamic content real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Dynamic content real-time event checks passed')
