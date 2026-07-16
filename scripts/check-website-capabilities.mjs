import fs from 'node:fs/promises'

const files = {
  capability: await fs.readFile('server/websiteCapabilities.js', 'utf8'),
  identity: await fs.readFile('server/identityAccessRuntime.js', 'utf8'),
  session: await fs.readFile('server/sessionAccess.js', 'utf8'),
  routes: await fs.readFile('server/routeExtensions.js', 'utf8'),
  websiteRouter: await fs.readFile('server/websiteRouter.js', 'utf8'),
  websiteService: await fs.readFile('server/services/websiteService.js', 'utf8'),
  workspace: await fs.readFile('src/services/workspacePolicy.js', 'utf8'),
  ownerWebsites: await fs.readFile('src/pages/OwnerWebsitesPage.jsx', 'utf8'),
}

const errors = []

for (const marker of ['website', 'media', 'forms', 'commerce', 'team', 'support']) {
  if (!files.capability.includes(`'${marker}'`)) errors.push(`Missing website capability: ${marker}`)
}

if (!files.identity.includes('normaliseWebsiteCapabilities')) {
  errors.push('Website records are not migrated through the capability contract')
}
if (!files.session.includes('websiteCapabilities') || !files.session.includes('capabilitiesForWebsites')) {
  errors.push('Live sessions do not expose assigned website capabilities')
}
if (!files.workspace.includes('rule.capability')) {
  errors.push('Client workspace routes are not capability-gated')
}
for (const binding of [
  "capability: 'website'",
  "capability: 'media'",
  "capability: 'forms'",
  "capability: 'commerce'",
  "capability: 'team'",
  "capability: 'support'",
]) {
  if (!files.workspace.includes(binding)) errors.push(`Workspace policy is missing ${binding}`)
}

if (!files.routes.includes("app.use('/api/websites', createWebsiteRouter())")) {
  errors.push('Protected routes do not mount the website service router')
}
if (!files.websiteRouter.includes("req.session?.role === 'owner'")) {
  errors.push('Website capability writes are not protected by an owner-only API boundary')
}
if (!files.websiteService.includes("import { normaliseWebsiteCapabilities } from '../websiteCapabilities.js'")) {
  errors.push('Website service does not import the capability contract')
}
if (!files.websiteService.includes('capabilities: normaliseWebsiteCapabilities(input.capabilities ?? existing?.capabilities)')) {
  errors.push('Website capability writes are not normalised by the website service')
}
for (const mutation of ["router.post('/', ownerOnly", "router.patch('/:id', ownerOnly", "router.delete('/:id', ownerOnly"]) {
  if (!files.websiteRouter.includes(mutation)) errors.push(`Owner-only website mutation is missing: ${mutation}`)
}

for (const marker of ['CLIENT_TOOLS', 'Client Workspace Tools', 'toggleCapability', 'capabilities: [...ALL_CLIENT_TOOLS]']) {
  if (!files.ownerWebsites.includes(marker)) errors.push(`Owner website controls are missing marker: ${marker}`)
}

if (errors.length) {
  errors.forEach(error => console.error(`Website capability error: ${error}`))
  process.exit(1)
}

console.log('Website capability check passed.')
