import fs from 'node:fs/promises'

const routeFile = new URL('../server/routeExtensions.js', import.meta.url)
const source = await fs.readFile(routeFile, 'utf8')
const routeStart = source.indexOf("app.use('/api/public/sites/:websiteId'")
const routeEnd = source.indexOf("app.use('/api/public/orders'", routeStart)

if (routeStart < 0 || routeEnd < 0) {
  throw new Error('Public website route could not be located in server/routeExtensions.js')
}

const publicRoute = source.slice(routeStart, routeEnd)
const forbiddenDraftReads = [
  'paths.content(',
  'getStarterSiteContent(',
  'storedContent',
]

for (const token of forbiddenDraftReads) {
  if (publicRoute.includes(token)) {
    throw new Error(`Public website route must not read editable draft content (${token})`)
  }
}

if (!publicRoute.includes('getPublishedContent(websiteId)')) {
  throw new Error('Public website route must load the approved published snapshot')
}

if (!publicRoute.includes('content.publishedAt')) {
  throw new Error('Public website response must expose the published snapshot timestamp')
}

for (const required of [
  'function publicWebsiteMetadata(website = {})',
  'function publicAssetMetadata(asset = {})',
  'function publicAssetVariant(variant = {})',
  '(await readWebsiteAssets(websiteId)).map(publicAssetMetadata)',
  'website: publicWebsiteMetadata(website)',
]) {
  if (!source.includes(required)) throw new Error(`Public website route is missing metadata sanitisation: ${required}`)
}

const websiteStart = source.indexOf('function publicWebsiteMetadata(website = {})')
const websiteEnd = source.indexOf('\n}\n\nfunction publicAssetVariant', websiteStart)
const websitePayload = websiteStart >= 0 && websiteEnd > websiteStart ? source.slice(websiteStart, websiteEnd) : ''

for (const forbidden of [
  'developmentEditorUrl', 'pageCount', 'mediaCount', 'owner', 'orderPrefix', 'plan', 'seo',
  'performance', 'repository', 'notes', 'accessCode', 'email', 'websiteIds',
]) {
  if (websitePayload.includes(forbidden)) throw new Error(`Public website metadata exposes internal field: ${forbidden}`)
}

const assetStart = source.indexOf('function publicAssetMetadata(asset = {})')
const assetEnd = source.indexOf('\n}\n\nexport function mountPublicRoutes', assetStart)
const assetPayload = assetStart >= 0 && assetEnd > assetStart ? source.slice(assetStart, assetEnd) : ''

for (const forbidden of [
  'websiteId', 'ownerId', 'originalName', 'storagePath', 'bytes', 'folder', 'collections', 'tags',
  'metadata', 'createdAt', 'updatedAt', 'transformation',
]) {
  if (assetPayload.includes(forbidden)) throw new Error(`Public asset metadata exposes internal field: ${forbidden}`)
}

if (/res\.json\(\{\s*website\s*,/.test(publicRoute)) {
  throw new Error('Public website route must not return the raw stored website object')
}

if (/const assets = await readWebsiteAssets\(websiteId\)/.test(publicRoute)) {
  throw new Error('Public website route must not return raw asset manifest entries')
}

console.log('Published content and public metadata boundary checks passed.')
