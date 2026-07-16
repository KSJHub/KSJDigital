import fs from 'node:fs/promises'

const guard = await fs.readFile('server/trustedOriginGuard.js', 'utf8')
const routes = await fs.readFile('server/routeExtensions.js', 'utf8')

const requiredGuardMarkers = [
  "SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])",
  'KSJ_PORTAL_ORIGIN',
  'KSJ_ALLOWED_ORIGINS',
  "process.env.NODE_ENV !== 'production'",
  'return res.status(403)',
]

for (const marker of requiredGuardMarkers) {
  if (!guard.includes(marker)) throw new Error(`Trusted-origin guard is missing: ${marker}`)
}

if (!routes.includes("app.use('/api', trustedOriginGuard)")) {
  throw new Error('Protected API routes are not using trustedOriginGuard')
}

const sessionIndex = routes.indexOf("app.use('/api', createLiveSessionAccessMiddleware())")
const originIndex = routes.indexOf("app.use('/api', trustedOriginGuard)")
if (sessionIndex < 0 || originIndex < sessionIndex) {
  throw new Error('Trusted-origin protection must run after live session verification')
}

console.log('Trusted-origin protection check passed.')
