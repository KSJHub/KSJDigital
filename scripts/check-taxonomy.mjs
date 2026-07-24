import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const serviceSource = await fs.readFile(path.join(root, 'server/services/taxonomyService.js'), 'utf8')
const routerSource = await fs.readFile(path.join(root, 'server/taxonomyRouter.js'), 'utf8')
const extensionsSource = await fs.readFile(path.join(root, 'server/routeExtensions.js'), 'utf8')

for (const symbol of ['createTaxonomy', 'createTerm', 'assignTerm', 'unassignTerm', 'mergeTerms', 'deleteTerm', 'deleteTaxonomy', 'getTermUsage', 'listRecordTerms']) {
  assert.match(serviceSource, new RegExp(`export async function ${symbol}\\b`), `${symbol} must be exported`)
}
assert.match(serviceSource, /Term hierarchy would create a cycle/, 'Hierarchy cycles must be rejected')
assert.match(serviceSource, /Taxonomy term is still in use/, 'Term deletion must be protected')
assert.match(serviceSource, /Taxonomy is still in use/, 'Taxonomy deletion must be protected')
assert.match(serviceSource, /const mutations = new Map\(\)/, 'Registry writes must be serialised')
assert.match(routerSource, /requireOwner/, 'Destructive taxonomy routes must require owner authority')
assert.match(extensionsSource, /createTaxonomyRouter/, 'Taxonomy router must be imported')
assert.match(extensionsSource, /\/api\/taxonomies/, 'Taxonomy router must be mounted')
assert.match(extensionsSource, /\/api\/asset-library/, 'Asset library router must be mounted')

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-taxonomy-'))
process.chdir(temporaryRoot)
try {
  const contentDir = path.join(temporaryRoot, 'server-data', 'content-records', 'test-site')
  await fs.mkdir(contentDir, { recursive: true })
  await fs.writeFile(path.join(contentDir, 'article.json'), JSON.stringify([{ id: 'article-1', title: 'Test article' }], null, 2))

  const service = await import(`${new URL('../server/services/taxonomyService.js', import.meta.url).href}?test=${Date.now()}`)
  const taxonomy = await service.createTaxonomy('test-site', {
    id: 'topics',
    label: 'Topics',
    hierarchical: true,
    allowedContentTypes: ['article'],
  })
  assert.equal(taxonomy.id, 'topics')

  const [parent, sibling] = await Promise.all([
    service.createTerm('test-site', 'topics', { id: 'development', name: 'Development' }),
    service.createTerm('test-site', 'topics', { id: 'design', name: 'Design' }),
  ])
  const child = await service.createTerm('test-site', 'topics', { id: 'backend', name: 'Backend', parentId: parent.id })
  assert.equal(child.parentId, parent.id)

  await assert.rejects(
    service.updateTerm('test-site', 'topics', parent.id, { parentId: child.id }),
    error => error.status === 422 && /cycle/.test(error.message),
  )

  const firstAssignment = await service.assignTerm('test-site', 'topics', child.id, { contentType: 'article', recordId: 'article-1' })
  const duplicateAssignment = await service.assignTerm('test-site', 'topics', child.id, { contentType: 'article', recordId: 'article-1' })
  assert.deepEqual(duplicateAssignment, firstAssignment, 'Assignments must be idempotent')

  const usage = await service.getTermUsage('test-site', 'topics', child.id)
  assert.equal(usage.count, 1)
  assert.equal(usage.byContentType.article, 1)

  await assert.rejects(
    service.deleteTerm('test-site', 'topics', child.id),
    error => error.status === 409,
  )

  const merged = await service.mergeTerms('test-site', 'topics', child.id, sibling.id)
  assert.equal(merged.merged, true)
  assert.equal(merged.usage.count, 1)

  const recordTerms = await service.listRecordTerms('test-site', 'article', 'article-1')
  assert.equal(recordTerms.length, 1)
  assert.equal(recordTerms[0].term.id, sibling.id)

  const tree = await service.listTerms('test-site', 'topics', { tree: true })
  assert.equal(Array.isArray(tree), true)
  assert.equal(tree.some(term => term.id === parent.id), true)

  await assert.rejects(
    service.deleteTaxonomy('test-site', 'topics'),
    error => error.status === 409,
  )

  const deleted = await service.deleteTaxonomy('test-site', 'topics', { force: true })
  assert.equal(deleted.deleted, true)
} finally {
  process.chdir(root)
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}

console.log('Taxonomy engine checks passed')
