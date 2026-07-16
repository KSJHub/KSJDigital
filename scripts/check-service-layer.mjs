import fs from 'node:fs/promises'

const files = {
  service: await fs.readFile('server/services/websiteService.js', 'utf8'),
  router: await fs.readFile('server/websiteRouter.js', 'utf8'),
  routes: await fs.readFile('server/routeExtensions.js', 'utf8'),
}

const errors = []

for (const marker of ['createWebsite', 'updateWebsite', 'deleteWebsite', 'listWebsites', 'websitesForSession']) {
  if (!files.service.includes(`function ${marker}`) && !files.service.includes(`function ${marker}(`)) {
    errors.push(`Website service is missing ${marker}`)
  }
}

if (!files.service.includes('assertUnique')) errors.push('Website service does not enforce registry uniqueness')
if (!files.service.includes("PLATFORM_WEBSITE_ID = 'ksjdigital'")) errors.push('Platform website deletion protection is missing')
if (!files.service.includes('normaliseWebsiteCapabilities')) errors.push('Website capabilities are not normalised in the service')
if (!files.router.includes("router.post('/', ownerOnly")) errors.push('Website creation is not owner-only')
if (!files.router.includes("router.patch('/:id', ownerOnly")) errors.push('Website updates are not owner-only')
if (!files.router.includes("router.delete('/:id', ownerOnly")) errors.push('Website deletion is not owner-only')
if (!files.router.includes('websitesForSession')) errors.push('Website listing is not session-scoped')
if (!files.routes.includes("app.use('/api/websites', createWebsiteRouter())")) errors.push('Website service router is not mounted')
if (files.routes.includes('websiteRegistryMutationGuard')) errors.push('Legacy website mutation middleware is still active')

if (errors.length) {
  errors.forEach(error => console.error(`Service layer error: ${error}`))
  process.exit(1)
}

console.log('Website service layer check passed.')
