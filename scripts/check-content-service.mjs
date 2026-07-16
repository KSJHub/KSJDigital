import fs from 'node:fs/promises'

const files = {
  service: await fs.readFile('server/services/contentService.js', 'utf8'),
  router: await fs.readFile('server/contentRouter.js', 'utf8'),
  published: await fs.readFile('server/publishedContent.js', 'utf8'),
  routes: await fs.readFile('server/routeExtensions.js', 'utf8'),
}

const errors = []

for (const method of [
  'getDraftContent',
  'saveDraftContent',
  'getPublishedContentRecord',
  'publishContentSnapshot',
  'publishDraftContent',
]) {
  if (!files.service.includes(`function ${method}`)) errors.push(`Content service is missing ${method}`)
}

if (!files.service.includes('paths.content(id)') || !files.service.includes('paths.publishedContent(id)')) {
  errors.push('Content service does not own both draft and published storage paths')
}
if (!files.service.includes('updatedAt: new Date().toISOString()')) {
  errors.push('Draft saves do not receive a service timestamp')
}
if (!files.router.includes('saveDraftContent') || !files.router.includes('Edit permission required')) {
  errors.push('Protected content router does not use the content service and edit permission')
}
if (!files.published.includes("from './services/contentService.js'")) {
  errors.push('Published content compatibility module does not delegate to the content service')
}
if (!files.routes.includes("app.use('/api/content', createContentRouter())")) {
  errors.push('Unified content router is not mounted')
}
if (files.routes.indexOf("app.use('/api/content', createContentRouter())") > files.routes.indexOf("app.use('/api/team', createTeamRouter())")) {
  errors.push('Content router must mount before later protected feature routers')
}

if (errors.length) {
  errors.forEach(error => console.error(`Content service error: ${error}`))
  process.exit(1)
}

console.log('Content service layer check passed.')
