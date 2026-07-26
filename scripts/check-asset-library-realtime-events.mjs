import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/assetLibraryService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishAssetEvent('asset.created'",
  "publishAssetEvent('asset.updated'",
  "publishAssetEvent('asset.deleted'",
  'kind:',
  'hasDimensions:',
  'hasDescription:',
  'hasAltText:',
  'hasFolder:',
  'hasStoredFile:',
  'collectionCount:',
  'tagCount:',
  'variantCount:',
  'librarySize:',
  'usageCount:',
  'forced:',
  'storedFileDeleted:',
]) {
  if (!source.includes(token)) failures.push(`Missing asset library realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function assetEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishAssetEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'id: asset.id',
  'websiteId: asset.websiteId',
  'ownerId: asset.ownerId',
  'name: asset.name',
  'originalName: asset.originalName',
  'mimeType: asset.mimeType',
  'extension: asset.extension',
  'url: asset.url',
  'storagePath: asset.storagePath',
  'bytes: asset.bytes',
  'metadata: asset.metadata',
  'createdAt: asset.createdAt',
  'updatedAt: asset.updatedAt',
  'usage: asset.usage',
  'variants: asset.variants',
  'tags: asset.tags',
  'collections: asset.collections',
  'description: asset.description',
  'alt: asset.alt',
  'folder: asset.folder',
  '...asset',
  '...deletion',
  'req.body',
  'req.params',
  'session',
  'authorization',
  'cookie',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Asset library event payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishAssetEvent(topic, asset, librarySize, deletion = {}) {\n  await publishDomainEvent(topic, assetEventPayload(asset, librarySize, deletion))\n}")) {
  failures.push('Asset library events must publish aggregate payloads without actor-derived metadata')
}
if (!source.includes("await writeJson(libraryPath(websiteId), nextAssets)\n    await publishAssetEvent('asset.created'")) {
  failures.push('Asset creation must publish after successful persistence')
}
if (!source.includes("await writeJson(libraryPath(websiteId), assets)\n    await publishAssetEvent('asset.updated'")) {
  failures.push('Asset updates must publish after successful persistence')
}
if (!source.includes("await publishAssetEvent('asset.deleted'")) {
  failures.push('Asset deletion must publish after registry and optional file deletion complete')
}
if (!source.includes('return updateAsset(websiteValue, assetValue, { variants })')) {
  failures.push('Asset variants must reuse the canonical asset update mutation')
}

if (failures.length) {
  console.error('Asset library real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Asset library real-time event checks passed')
