import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(process.cwd())
const serviceSource = await fs.readFile(path.join(root, 'server/services/localisationService.js'), 'utf8')
const routerSource = await fs.readFile(path.join(root, 'server/localisationRouter.js'), 'utf8')
const routeSource = await fs.readFile(path.join(root, 'server/routeExtensions.js'), 'utf8')

for (const name of [
  'getLocalisationConfig', 'updateLocalisationConfig', 'upsertLocale', 'deleteLocale',
  'configureTranslatableFields', 'saveTranslation', 'publishTranslation', 'getTranslation',
  'resolveLocalisedRecord', 'getTranslationCompleteness', 'listPublishedTranslations',
]) assert.match(serviceSource, new RegExp(`export async function ${name}\\b`), `Missing ${name}`)

assert.match(serviceSource, /fallback cycle detected/i)
assert.match(serviceSource, /Field is not translatable/i)
assert.match(serviceSource, /Content record not found/i)
assert.match(serviceSource, /status: \['draft', 'published'\]/)
assert.match(serviceSource, /publishedOnly/)
assert.match(serviceSource, /percentage:/)
assert.match(routerSource, /createLocalisationRouter/)
assert.match(routeSource, /createLocalisationRouter/)
assert.match(routeSource, /\/api\/localisation/)

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-localisation-'))
const previousCwd = process.cwd()
try {
  process.chdir(temporaryRoot)
  const { DATA_DIR, writeJson } = await import(new URL('../server/storage.js', import.meta.url))
  const service = await import(new URL(`../server/services/localisationService.js?check=${Date.now()}`, import.meta.url))
  const websiteId = 'localisation-check'
  const recordFolder = path.join(DATA_DIR, 'content-records', websiteId)
  await fs.mkdir(recordFolder, { recursive: true })
  await writeJson(path.join(recordFolder, 'article.json'), [{ id: 'article-1', title: 'Hello', excerpt: 'Original', status: 'Published' }])

  await service.upsertLocale(websiteId, { id: 'fr-FR', label: 'French', fallbackLocale: 'en-GB' })
  await service.upsertLocale(websiteId, { id: 'de-DE', label: 'German', fallbackLocale: 'fr-FR' })
  await service.configureTranslatableFields(websiteId, 'article', ['title', 'excerpt'])
  await service.saveTranslation(websiteId, 'article', 'article-1', 'fr-FR', { values: { title: 'Bonjour' } })
  await service.publishTranslation(websiteId, 'article', 'article-1', 'fr-FR')

  const resolved = await service.resolveLocalisedRecord(websiteId, 'article', 'article-1', 'de-DE', { publishedOnly: true })
  assert.equal(resolved.title, 'Bonjour')
  assert.equal(resolved.excerpt, 'Original')
  assert.deepEqual(resolved.localeFallbackChain, ['de-DE', 'fr-FR', 'en-GB'])

  const completeness = await service.getTranslationCompleteness(websiteId, 'article', 'article-1')
  assert.equal(completeness.find(item => item.locale === 'fr-FR').percentage, 50)
  assert.equal((await service.listPublishedTranslations(websiteId, 'fr-FR')).length, 1)

  await assert.rejects(
    service.saveTranslation(websiteId, 'article', 'article-1', 'fr-FR', { values: { author: 'Invalid' } }),
    /not translatable/i,
  )
  await assert.rejects(
    service.upsertLocale(websiteId, { id: 'en-GB', fallbackLocale: 'de-DE' }),
    /cycle/i,
  )
  await assert.rejects(service.deleteLocale(websiteId, 'fr-FR'), /has translations/i)
  await service.deleteLocale(websiteId, 'fr-FR', { force: true })
  assert.equal((await service.getLocalisationConfig(websiteId)).locales.some(item => item.id === 'fr-FR'), false)
} finally {
  process.chdir(previousCwd)
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}

console.log('Localisation engine checks passed')
