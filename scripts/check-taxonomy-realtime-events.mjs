import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/taxonomyRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishTaxonomyEvent('taxonomy.created'",
  "publishTaxonomyEvent('taxonomy.updated'",
  "publishTaxonomyEvent('taxonomy.deleted'",
  "publishTaxonomyEvent('taxonomy.term-created'",
  "publishTaxonomyEvent('taxonomy.term-updated'",
  "publishTaxonomyEvent('taxonomy.term-deleted'",
  "publishTaxonomyEvent('taxonomy.term-merged'",
  "publishTaxonomyEvent('taxonomy.assignment-added'",
  "publishTaxonomyEvent('taxonomy.assignment-removed'",
  'hierarchical:',
  'hasDescription:',
  'allowedContentTypeCount:',
  'taxonomyCount:',
  'removedTermCount:',
  'removedAssignmentCount:',
  'assignmentCount:',
  'hasParent:',
  'childCount:',
  'usageCount:',
  'forced:',
  'merged:',
]) {
  if (!source.includes(token)) failures.push(`Missing taxonomy realtime marker: ${token}`)
}

const taxonomyPayloadStart = source.indexOf('function taxonomyEventPayload(')
const taxonomyPayloadEnd = source.indexOf('\n}\n\nfunction termEventPayload', taxonomyPayloadStart)
const termPayloadStart = source.indexOf('function termEventPayload(')
const termPayloadEnd = source.indexOf('\n}\n\nasync function publishTaxonomyEvent', termPayloadStart)
const payloadSource = [
  taxonomyPayloadStart >= 0 && taxonomyPayloadEnd > taxonomyPayloadStart ? source.slice(taxonomyPayloadStart, taxonomyPayloadEnd) : '',
  termPayloadStart >= 0 && termPayloadEnd > termPayloadStart ? source.slice(termPayloadStart, termPayloadEnd) : '',
].join('\n')

for (const forbidden of [
  'id: taxonomy.id',
  'websiteId: taxonomy.websiteId',
  'label: taxonomy.label',
  'description: taxonomy.description',
  'allowedContentTypes: taxonomy.allowedContentTypes',
  'metadata: taxonomy.metadata',
  'id: term.id',
  'websiteId: term.websiteId',
  'taxonomyId: term.taxonomyId',
  'parentId: term.parentId',
  'name: term.name',
  'slug: term.slug',
  'description: term.description',
  'metadata: term.metadata',
  'assignments:',
  'byContentType:',
  'recordId:',
  'contentType:',
  '...taxonomy',
  '...term',
  '...details',
  'req.body',
  'req.params',
  'session',
  'authorization',
  'cookie',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Taxonomy event payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishTaxonomyEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Taxonomy events must publish aggregate payloads without actor-derived metadata')
}
if (!source.includes('if (after.count > before.count)')) {
  failures.push('Assignment-added events must only publish for a real assignment mutation')
}
if (!source.includes('if (result.deleted)')) {
  failures.push('Assignment-removed events must only publish for a real deletion')
}
if (!source.includes("const topic = merged ? 'taxonomy.term-merged' : 'taxonomy.term-deleted'")) {
  failures.push('Term deletion must distinguish merge operations from destructive deletion')
}

if (failures.length) {
  console.error('Taxonomy real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Taxonomy real-time event checks passed')