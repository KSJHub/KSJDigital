import fs from 'node:fs/promises'

const guard = await fs.readFile('server/capabilityAccessGuard.js', 'utf8')
const routes = await fs.readFile('server/routeExtensions.js', 'utf8')
const errors = []

for (const binding of [
  "{ prefix: '/assets', capability: 'media' }",
  "{ prefix: '/asset-library', capability: 'media' }",
  "{ prefix: '/forms', capability: 'forms' }",
  "{ prefix: '/team', capability: 'team' }",
  "{ prefix: '/support', capability: 'support' }",
  "{ prefix: '/orders', capability: 'commerce' }",
  "{ prefix: '/inventory', capability: 'commerce' }",
  "{ prefix: '/commerce-settings', capability: 'commerce' }",
  "{ prefix: '/taxonomies', capability: 'website' }",
  "{ prefix: '/content', capability: 'website' }",
  "{ prefix: '/publish', capability: 'website' }",
]) {
  if (!guard.includes(binding)) errors.push(`Protected API capability mapping is missing ${binding}`)
}

for (const marker of [
  "req.session?.role === 'owner'",
  'normaliseWebsiteCapabilities(website.capabilities)',
  "res.status(403).json({ error: 'This tool is not enabled for your website' })",
  'assigned.has(targetWebsiteId)',
  'hasSessionCapability(req.session, rule.capability)',
  "['asset-library', 'content', 'forms', 'cms', 'commerce-settings', 'taxonomies'].includes(parts[0])",
]) {
  if (!guard.includes(marker)) errors.push(`Capability guard is missing required marker: ${marker}`)
}

const liveSessionIndex = routes.indexOf("app.use('/api', createLiveSessionAccessMiddleware())")
const capabilityIndex = routes.indexOf("app.use('/api', createCapabilityAccessGuard())")
const assetLibraryIndex = routes.indexOf("app.use('/api/asset-library', createAssetLibraryRouter())")
const teamIndex = routes.indexOf("app.use('/api/team', createTeamRouter())")

if (capabilityIndex < 0) errors.push('Protected API capability guard is not mounted')
if (liveSessionIndex < 0 || capabilityIndex < liveSessionIndex) {
  errors.push('Capability guard must run after live session access refresh')
}
if (assetLibraryIndex < 0 || capabilityIndex > assetLibraryIndex) {
  errors.push('Capability guard must run before the asset library router')
}
if (teamIndex < 0 || capabilityIndex > teamIndex) {
  errors.push('Capability guard must run before protected feature routers')
}

if (errors.length) {
  errors.forEach(error => console.error(`Capability API boundary error: ${error}`))
  process.exit(1)
}

console.log('Capability API boundary check passed.')
