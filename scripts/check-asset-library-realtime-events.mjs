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
  'asset.id',
  'asset.websiteId',
  'asset.ownerId',
  'asset.name',
  'asset.originalName',
  'asset.mimeType',
  'asset.extension',
  'asset.url',
  'asset.storagePath',
  'asset.bytes',
  'asset.metadata',
  'asset.createdAt',
  'asset.updatedAt',
  'asset.usage',
  'asset.variants',
  'asset.tags',
  'asset.collections',
  'asset.description',
  'asset.alt',
  'asset.folder',
  'websiteId',
  'assetId',
  'ownerId',
  'recordId',
  'req.body',
  'req.params',
  'session',
  'authorization',
  'cookie',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Asset library event payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishAssetEvent(topic, asset, librarySize, extras = {}) {\n  await publishDomainEvent(topic, assetEventPayload(asset, librarySize, extras))\n}")) {
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
