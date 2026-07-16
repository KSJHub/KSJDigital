import fs from 'node:fs/promises'

const [policy, app, shell, routes, websiteRouter] = await Promise.all([
  fs.readFile(new URL('../src/services/workspacePolicy.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/layouts/Shell.jsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../server/routeExtensions.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('../server/websiteRouter.js', import.meta.url), 'utf8'),
])

const failures = []

if (!app.includes("from './services/workspacePolicy.js'")) {
  failures.push('App routes must use the shared workspace policy.')
}

if (!shell.includes("from '../services/workspacePolicy.js'")) {
  failures.push('Sidebar navigation must use the shared workspace policy.')
}

if (!routes.includes("app.use('/api/websites', createWebsiteRouter())")) {
  failures.push('Protected routes must mount the website service router.')
}

if (!websiteRouter.includes("if (req.session?.role === 'owner') return next()")) {
  failures.push('Website registry mutation guard must require an owner session.')
}

for (const route of ["router.post('/', ownerOnly", "router.patch('/:id', ownerOnly", "router.delete('/:id', ownerOnly"]) {
  if (!websiteRouter.includes(route)) {
    failures.push(`Website registry mutation is missing owner protection: ${route}`)
  }
}

const clientPolicy = policy.split('const clientWorkspace = {')[1]?.split('\n}\n\nfunction allowedByRule')[0] || ''
const forbiddenClientTerms = ['API', 'Runtime', 'Schema', 'Registry', 'Bridge', 'Developer', 'Infrastructure']
for (const term of forbiddenClientTerms) {
  if (clientPolicy.includes(`'${term}`) || clientPolicy.includes(` ${term}`)) {
    failures.push(`Client workspace contains technical label: ${term}`)
  }
}

const requiredClientPaths = [
  '/client/editor',
  '/client/branding',
  '/client/media',
  '/client/forms',
  '/client/merch',
  '/client/inventory',
  '/client/orders',
  '/client/commerce',
  '/client/publish',
  '/client/support',
  '/client/settings',
]
for (const path of requiredClientPaths) {
  if (!clientPolicy.includes(path)) failures.push(`Client workspace policy is missing ${path}`)
}

if (failures.length) {
  console.error('Workspace boundary check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Workspace and registry boundary check passed.')
