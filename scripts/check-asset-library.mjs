import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR } from '../server/storage.js'
import {
  createAsset,
  deleteAsset,
  findAssetUsage,
  getAsset,
  listAssets,
  registerAssetVariant,
  updateAsset,
} from '../server/services/assetLibraryService.js'

const errors = []
const files = {
  service: await fs.readFile('server/services/assetLibraryService.js', 'utf8'),
  router: await fs.readFile('server/assetLibraryRouter.js', 'utf8'),
  protectedRoutes: await fs.readFile('server/routeExtensions.js', 'utf8'),
}

for (const method of ['listAssets', 'getAsset', 'createAsset', 'updateAsset', 'registerAssetVariant', 'findAssetUsage', 'deleteAsset']) {
  if (!files.service.includes(`function ${method}`)) errors.push(`Asset library service is missing ${method}`)
}
if (!files.service.includes('readLegacyAssets')) errors.push('Legacy asset manifest migration is missing')
if (!files.service.includes('withMutation')) errors.push('Asset library writes are not serialised per website')
if (!files.service.includes('recordContainsAsset')) errors.push('Content usage discovery is missing')
if (!files.router.includes("router.get('/:websiteId/:assetId/usage'")) errors.push('Asset usage endpoint is missing')
if (!files.router.includes("router.post('/:websiteId/:assetId/variants'")) errors.push('Asset variant endpoint is missing')
if (!files.protectedRoutes.includes("app.use('/api/asset-library', createAssetLibraryRouter())")) {
  errors.push('Asset library router is not mounted')
}

const websiteId = `asset-check-${crypto.randomUUID()}`
const libraryFile = path.join(DATA_DIR, 'asset-libraries', `${websiteId}.json`)
try {
  const first = await createAsset(websiteId, {
    id: 'hero-image',
    name: 'Hero image',
    originalName: 'hero.png',
    mimeType: 'image/png',
    url: '/assets/test/hero.png',
    folder: 'Marketing',
    collections: ['Homepage'],
    tags: ['hero', 'launch'],
    width: 1600,
    height: 900,
  })
  if (first.kind !== 'image' || first.folder !== 'Marketing') errors.push('Asset metadata normalisation failed')

  await Promise.all([
    createAsset(websiteId, { id: 'document', name: 'Launch PDF', mimeType: 'application/pdf', url: '/assets/test/launch.pdf' }),
    createAsset(websiteId, { id: 'secondary', name: 'Secondary image', mimeType: 'image/jpeg', url: '/assets/test/secondary.jpg' }),
  ])
  const concurrent = await listAssets(websiteId, { limit: 10 })
  if (concurrent.total !== 3) errors.push('Concurrent asset creation lost registry entries')

  const filtered = await listAssets(websiteId, { kind: 'image', collection: 'Homepage', query: 'hero' })
  if (filtered.total !== 1 || filtered.results[0]?.id !== 'hero-image') errors.push('Asset filtering or search failed')

  const updated = await updateAsset(websiteId, 'hero-image', { alt: 'Launch hero artwork', tags: ['hero', 'updated'] })
  if (updated.alt !== 'Launch hero artwork' || !updated.tags.includes('updated')) errors.push('Asset metadata update failed')

  const withVariant = await registerAssetVariant(websiteId, 'hero-image', {
    id: 'thumbnail', label: 'Thumbnail', url: '/assets/test/hero-thumbnail.webp', mimeType: 'image/webp', width: 320, height: 180,
    transformation: { fit: 'cover' },
  })
  if (withVariant.variants?.[0]?.id !== 'thumbnail') errors.push('Asset variant registration failed')

  const usage = await findAssetUsage(websiteId, 'hero-image')
  if (!Array.isArray(usage)) errors.push('Asset usage discovery did not return a list')

  const hydrated = await getAsset(websiteId, 'hero-image')
  if (!Array.isArray(hydrated.usage)) errors.push('Asset detail does not include usage information')

  await deleteAsset(websiteId, 'document')
  const afterDelete = await listAssets(websiteId)
  if (afterDelete.total !== 2) errors.push('Asset registry deletion failed')
} finally {
  await fs.rm(libraryFile, { force: true })
}

if (errors.length) {
  errors.forEach(error => console.error(`Asset library error: ${error}`))
  process.exit(1)
}

console.log('Generic asset library check passed.')
