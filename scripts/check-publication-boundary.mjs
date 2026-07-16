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

console.log('Published content boundary check passed.')
