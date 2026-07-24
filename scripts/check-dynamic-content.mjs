import fs from 'node:fs/promises'

const files = {
  fields: await fs.readFile('server/services/fieldTypeRegistry.js', 'utf8'),
  types: await fs.readFile('server/services/contentTypeRegistry.js', 'utf8'),
  records: await fs.readFile('server/services/contentRecordService.js', 'utf8'),
  revisions: await fs.readFile('server/services/contentRevisionService.js', 'utf8'),
  router: await fs.readFile('server/cmsRouter.js', 'utf8'),
}

const errors = []

for (const method of ['registerFieldType', 'getFieldType', 'listFieldTypes']) {
  if (!files.fields.includes(`function ${method}`)) errors.push(`Field type registry is missing ${method}`)
}
for (const method of ['registerContentType', 'getContentType', 'listContentTypes', 'normaliseContentFields']) {
  if (!files.types.includes(`function ${method}`)) errors.push(`Content type registry is missing ${method}`)
}
for (const method of [
  'listContentRecords',
  'createContentRecord',
  'updateContentRecord',
  'restoreContentRecord',
  'deleteContentRecord',
]) {
  if (!files.records.includes(`function ${method}`)) errors.push(`Content record service is missing ${method}`)
}
for (const method of ['listContentRevisions', 'getContentRevision', 'saveContentRevision']) {
  if (!files.revisions.includes(`function ${method}`)) errors.push(`Content revision service is missing ${method}`)
}

if (!files.types.includes("id: 'article'") || !files.types.includes("type: 'blocks'")) {
  errors.push('Article content type is not registered with structured blocks')
}
if (!files.records.includes("'content-records'") || !files.revisions.includes("'content-revisions'")) {
  errors.push('Dynamic records and revisions do not use their canonical storage roots')
}
if (!files.records.includes('migrateLegacyArticles') || !files.records.includes('paths.articles(websiteId)')) {
  errors.push('Existing article data does not have an in-place migration path')
}
if (!files.router.includes("from './services/contentRecordService.js'")) {
  errors.push('CMS router does not delegate to the dynamic content service')
}
for (const forbidden of ['normaliseArticle', 'normaliseBlock', 'revisionSnapshot', 'writeJson(', 'readJson(']) {
  if (files.router.includes(forbidden)) errors.push(`CMS router still owns domain or persistence logic: ${forbidden}`)
}

await import('../server/services/fieldTypeRegistry.js')
const { getContentType, normaliseContentFields } = await import('../server/services/contentTypeRegistry.js')
const article = getContentType('article')
if (!article) errors.push('Article content type could not be loaded')

const sample = normaliseContentFields('article', {
  title: 'Dynamic Content Check',
  status: 'Draft',
  blocks: [{ type: 'richText', body: 'Ready' }],
})
if (sample.title !== 'Dynamic Content Check' || sample.blocks?.[0]?.body !== 'Ready') {
  errors.push('Article schema normalisation did not preserve structured content')
}

if (errors.length) {
  errors.forEach(error => console.error(`Dynamic content error: ${error}`))
  process.exit(1)
}

console.log('Dynamic content foundation check passed.')
