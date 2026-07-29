import fs from 'node:fs/promises'

const guard = await fs.readFile('server/trustedOriginGuard.js', 'utf8')
const routes = await fs.readFile('server/routeExtensions.js', 'utf8')
const start = await fs.readFile('server/start.js', 'utf8')

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

for (const marker of [
  'function configuredCorsOrigins()',
  'function corsOriginAllowed(origin)',
  'function trustedCorsMiddleware(req, res, next)',
  "middleware?.name === 'corsMiddleware'",
  "return res.status(403).json({ error: 'Cross-origin request denied' })",
  "res.setHeader('Access-Control-Allow-Origin', origin)",
  "res.setHeader('Access-Control-Allow-Credentials', 'true')",
]) {
  if (!start.includes(marker)) throw new Error(`Credentialed CORS protection is missing: ${marker}`)
}

if (!start.includes("if (!mountPath && middleware?.name === 'corsMiddleware') return originalUse.call(this, trustedCorsMiddleware)")) {
  throw new Error('Legacy permissive CORS middleware is not replaced at startup')
}

console.log('Trusted-origin and credentialed CORS protection check passed.')