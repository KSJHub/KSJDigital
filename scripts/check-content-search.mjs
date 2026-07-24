import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR } from '../server/storage.js'
import {
  indexContentRecord,
  projectContentSearchDocument,
  removeContentSearchDocument,
  searchContent,
} from '../server/services/contentSearchService.js'
import { describeContentType } from '../server/services/contentTypeRegistry.js'

const errors = []
const files = {
  types: await fs.readFile('server/services/contentTypeRegistry.js', 'utf8'),
  records: await fs.readFile('server/services/contentRecordService.js', 'utf8'),
  search: await fs.readFile('server/services/contentSearchService.js', 'utf8'),
  router: await fs.readFile('server/dynamicContentRouter.js', 'utf8'),
}

for (const method of [
  'projectContentSearchDocument',
  'readContentSearchIndex',
  'indexContentRecord',
  'removeContentSearchDocument',
  'rebuildContentSearchIndex',
  'searchContent',
]) {
  if (!files.search.includes(`function ${method}`)) errors.push(`Content search service is missing ${method}`)
}

for (const mutation of ['createContentRecord', 'updateContentRecord', 'transitionContentRecord', 'applyNullifyPolicies']) {
  const start = files.records.indexOf(`function ${mutation}`)
  if (start < 0 || !files.records.slice(start).includes('indexContentRecord(')) errors.push(`${mutation} does not update the search index`)
}
if (!files.records.includes('removeContentSearchDocument(websiteId, typeId, recordId)')) errors.push('Content deletion does not remove its search document')
if (!files.search.includes('indexMutations') || !files.search.includes('mutateIndex(')) errors.push('Search index writes are not serialised per website')
if (!files.router.includes("router.get('/:websiteId/search'")) errors.push('Generic search endpoint is missing')
if (!files.router.includes("router.post('/:websiteId/search/rebuild'")) errors.push('Search rebuild endpoint is missing')
if (!files.router.includes('relationshipId') || !files.router.includes('relationshipField')) errors.push('Relationship-aware query parameters are missing')
if (files.router.indexOf("router.get('/:websiteId/search'") > files.router.indexOf("router.get('/:websiteId/:typeId'")) errors.push('Search endpoint is shadowed by the generic content route')

const article = describeContentType('article')
if (!article?.search || article.search.titleField !== 'title') errors.push('Article search schema is not discoverable')
if (!article?.search?.fields?.some(field => field.field === 'title' && field.weight === 10)) errors.push('Article title search weighting is missing')
if (!article?.search?.filters?.includes('category') || !article?.search?.filters?.includes('status')) errors.push('Article search filters are incomplete')

const projected = projectContentSearchDocument('website', 'article', {
  id: 'projected', title: 'Search projection', excerpt: 'Summary', status: 'Published', category: 'News',
  tags: ['search'], relatedArticles: [{ type: 'article', id: 'related' }], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
})
if (projected?.title !== 'Search projection' || !projected.published) errors.push('Search projection does not expose canonical result metadata')
if (projected?.relationships?.[0]?.id !== 'related') errors.push('Search projection is not relationship aware')

const websiteId = `search-check-${crypto.randomUUID()}`
const indexFile = path.join(DATA_DIR, 'content-search', `${websiteId}.json`)
try {
  await Promise.all([
    indexContentRecord(websiteId, 'article', {
      id: 'published', title: 'Diamond launch update', slug: 'diamond-launch', excerpt: 'Production release', category: 'News', tags: ['launch'], author: 'KSJ', locale: 'en-GB', status: 'Published', blocks: [], relatedArticles: [{ type: 'article', id: 'related' }], updatedAt: '2026-07-24T01:00:00.000Z', publishedAt: '2026-07-24T01:00:00.000Z',
    }),
    indexContentRecord(websiteId, 'article', {
      id: 'draft', title: 'Secret diamond roadmap', slug: 'secret-roadmap', excerpt: 'Internal plan', category: 'Planning', tags: ['roadmap'], author: 'KSJ', locale: 'en-GB', status: 'Draft', blocks: [], relatedArticles: [], updatedAt: '2026-07-24T02:00:00.000Z',
    }),
  ])

  const publicResults = await searchContent(websiteId, { query: 'diamond', limit: 1 }, { role: 'viewer' })
  if (publicResults.total !== 1 || publicResults.results[0]?.id !== 'published') errors.push('Search visibility exposed unpublished content to a viewer')
  if (publicResults.hasMore !== false) errors.push('Search pagination metadata is incorrect')
  const editorResults = await searchContent(websiteId, { query: 'diamond' }, { role: 'editor', canEdit: true })
  if (editorResults.total !== 2) errors.push('Concurrent indexing lost a searchable document or editor visibility failed')
  const filtered = await searchContent(websiteId, { filters: { category: 'news' } }, { role: 'owner' })
  if (filtered.total !== 1 || filtered.results[0]?.id !== 'published') errors.push('Search field filtering failed')
  const related = await searchContent(websiteId, { relationship: { type: 'article', id: 'related', field: 'relatedArticles' } }, { role: 'owner' })
  if (related.total !== 1 || related.results[0]?.id !== 'published') errors.push('Relationship-aware search filtering failed')
  if ('weighted' in (publicResults.results[0] || {}) || 'key' in (publicResults.results[0] || {})) errors.push('Search results expose internal index data')

  try {
    await searchContent(websiteId, { filters: { unsupported: 'value' } }, { role: 'owner' })
    errors.push('Unsupported search filters were accepted')
  } catch (error) {
    if (error.status !== 422 || !error.details?.filters?.includes('unsupported')) errors.push('Unsupported filters did not return structured validation')
  }

  await removeContentSearchDocument(websiteId, 'article', 'published')
  const removed = await searchContent(websiteId, { query: 'launch' }, { role: 'owner' })
  if (removed.total !== 0) errors.push('Incremental search deletion failed')
} finally {
  await fs.rm(indexFile, { force: true })
}

if (errors.length) {
  errors.forEach(error => console.error(`Content search error: ${error}`))
  process.exit(1)
}

console.log('Universal content search check passed.')
