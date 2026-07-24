import fs from 'node:fs/promises'

const files = {
  fields: await fs.readFile('server/services/fieldTypeRegistry.js', 'utf8'),
  types: await fs.readFile('server/services/contentTypeRegistry.js', 'utf8'),
  records: await fs.readFile('server/services/contentRecordService.js', 'utf8'),
  relationships: await fs.readFile('server/services/contentRelationshipService.js', 'utf8'),
  revisions: await fs.readFile('server/services/contentRevisionService.js', 'utf8'),
  cmsRouter: await fs.readFile('server/cmsRouter.js', 'utf8'),
  dynamicRouter: await fs.readFile('server/dynamicContentRouter.js', 'utf8'),
  routes: await fs.readFile('server/routeExtensions.js', 'utf8'),
  capabilities: await fs.readFile('server/capabilityAccessGuard.js', 'utf8'),
}

const errors = []

for (const method of ['registerFieldType', 'getFieldType', 'listFieldTypes', 'isRelationshipFieldType']) {
  if (!files.fields.includes(`function ${method}`)) errors.push(`Field type registry is missing ${method}`)
}
for (const method of [
  'registerContentType',
  'getContentType',
  'listContentTypes',
  'getRelationshipFields',
  'describeContentType',
  'listContentTypeDescriptions',
  'normaliseContentFields',
  'validateContentFields',
]) {
  if (!files.types.includes(`function ${method}`)) errors.push(`Content type registry is missing ${method}`)
}
for (const method of [
  'listContentRecords',
  'getContentRecord',
  'createContentRecord',
  'updateContentRecord',
  'restoreContentRecord',
  'deleteContentRecord',
]) {
  if (!files.records.includes(`function ${method}`)) errors.push(`Content record service is missing ${method}`)
}
for (const method of [
  'validateContentRelationships',
  'resolveContentRelationships',
  'findIncomingContentRelationships',
  'nullifyRelationshipValue',
]) {
  if (!files.relationships.includes(`function ${method}`)) errors.push(`Relationship service is missing ${method}`)
}
for (const method of ['listContentRevisions', 'getContentRevision', 'saveContentRevision']) {
  if (!files.revisions.includes(`function ${method}`)) errors.push(`Content revision service is missing ${method}`)
}

if (!files.types.includes("id: 'article'") || !files.types.includes("type: 'blocks'")) {
  errors.push('Article content type is not registered with structured blocks')
}
if (!files.types.includes("type: 'references'") || !files.types.includes("targetTypes: ['article']")) {
  errors.push('Article relationships are not registered through schema metadata')
}
if (!files.types.includes('ContentSchemaValidationError') || !files.types.includes("code: 'required'")) {
  errors.push('Content schema validation does not expose structured field errors')
}
if (!files.records.includes("'content-records'") || !files.revisions.includes("'content-revisions'")) {
  errors.push('Dynamic records and revisions do not use their canonical storage roots')
}
if (!files.records.includes('migrateLegacyArticles') || !files.records.includes('paths.articles(websiteId)')) {
  errors.push('Existing article data does not have an in-place migration path')
}
if (!files.records.includes('findIncomingContentRelationships') || !files.records.includes('applyNullifyPolicies')) {
  errors.push('Content record deletion does not enforce relationship policies')
}
if (!files.cmsRouter.includes("from './services/contentRecordService.js'")) {
  errors.push('CMS router does not delegate to the dynamic content service')
}
for (const forbidden of ['normaliseArticle', 'normaliseBlock', 'revisionSnapshot', 'writeJson(', 'readJson(']) {
  if (files.cmsRouter.includes(forbidden)) errors.push(`CMS router still owns domain or persistence logic: ${forbidden}`)
}

for (const route of [
  "router.get('/field-types'",
  "router.get('/types'",
  "router.get('/:websiteId/:typeId'",
  "router.get('/:websiteId/:typeId/:recordId'",
  "router.post('/:websiteId/:typeId'",
  "router.patch('/:websiteId/:typeId/:recordId'",
  "router.delete('/:websiteId/:typeId/:recordId'",
]) {
  if (!files.dynamicRouter.includes(route)) errors.push(`Dynamic content API is missing route: ${route}`)
}
if (!files.routes.includes("app.use('/api/dynamic-content', createDynamicContentRouter())")) {
  errors.push('Dynamic content API is not mounted')
}
if (!files.capabilities.includes("prefix: '/dynamic-content'") || !files.capabilities.includes("parts[0] === 'dynamic-content'")) {
  errors.push('Dynamic content API is not protected by website capability access')
}

await import('../server/services/fieldTypeRegistry.js')
const {
  describeContentType,
  getContentType,
  normaliseContentFields,
  validateContentFields,
} = await import('../server/services/contentTypeRegistry.js')
const {
  nullifyRelationshipValue,
  resolveContentRelationships,
  validateContentRelationships,
} = await import('../server/services/contentRelationshipService.js')
const article = getContentType('article')
if (!article) errors.push('Article content type could not be loaded')

const description = describeContentType('article')
if (!description?.fields?.some(field => field.id === 'title' && field.required === true)) {
  errors.push('Article schema discovery does not expose required editor metadata')
}
const relatedField = description?.fields?.find(field => field.id === 'relatedArticles')
if (relatedField?.type !== 'references' || relatedField?.targetTypes?.[0] !== 'article' || relatedField?.onDelete !== 'restrict') {
  errors.push('Relationship editor metadata is incomplete')
}
if ('normalise' in (description || {})) errors.push('Content type discovery exposes executable schema internals')

const sample = normaliseContentFields('article', {
  title: 'Dynamic Content Check',
  status: 'Draft',
  blocks: [{ type: 'richText', body: 'Ready' }],
  relatedArticles: ['target-article'],
})
if (sample.title !== 'Dynamic Content Check' || sample.blocks?.[0]?.body !== 'Ready') {
  errors.push('Article schema normalisation did not preserve structured content')
}
if (sample.relatedArticles?.[0]?.type !== 'article' || sample.relatedArticles?.[0]?.id !== 'target-article') {
  errors.push('Relationship fields do not normalise to canonical references')
}

try {
  validateContentFields('article', { ...sample, title: '' })
  errors.push('Required field validation accepted an empty article title')
} catch (error) {
  if (error.status !== 422 || error.errors?.[0]?.field !== 'title') {
    errors.push('Required field validation did not return structured title errors')
  }
}

await validateContentRelationships('article', sample, async (type, id) => (
  type === 'article' && id === 'target-article' ? { id, type, title: 'Target article' } : null
)).catch(() => errors.push('A valid relationship was rejected'))
try {
  await validateContentRelationships('article', sample, async () => null)
  errors.push('A missing relationship target was accepted')
} catch (error) {
  if (error.status !== 422 || error.details?.[0]?.code !== 'missing_target') {
    errors.push('Missing relationship validation did not return structured errors')
  }
}

const resolved = await resolveContentRelationships('article', sample, async (type, id) => ({ id, type, title: 'Target article' }))
if (resolved.relatedArticles?.[0]?.label !== 'Target article') errors.push('Relationship API metadata does not resolve target labels')
const nullified = nullifyRelationshipValue(relatedField, sample.relatedArticles, 'article', 'target-article')
if (nullified.length !== 0) errors.push('Relationship nullification did not remove the target reference')

if (errors.length) {
  errors.forEach(error => console.error(`Dynamic content error: ${error}`))
  process.exit(1)
}

console.log('Dynamic content API check passed.')