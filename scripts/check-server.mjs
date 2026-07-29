import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const serverDir = path.resolve(root, 'server')

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await javascriptFiles(fullPath))
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) files.push(fullPath)
  }

  return files
}

async function validateProjectCheckInventory() {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const scripts = packageJson.scripts || {}
  const fullCheck = String(scripts.check || '')
  const definedChecks = Object.keys(scripts).filter(name => name.startsWith('check:')).sort()
  const chainedChecks = fullCheck
    .split('&&')
    .map(command => command.trim())
    .map(command => command.match(/^npm run (check:[A-Za-z0-9:-]+)$/)?.[1] || null)
    .filter(Boolean)

  const chainedSet = new Set(chainedChecks)
  const missing = definedChecks.filter(name => !chainedSet.has(name))
  if (missing.length) {
    throw new Error(`Master npm run check is missing validator scripts: ${missing.join(', ')}`)
  }

  if (chainedSet.size !== chainedChecks.length) {
    throw new Error('Master npm run check contains duplicate validator script entries')
  }

  const undefinedChecks = [...chainedSet].filter(name => !Object.hasOwn(scripts, name))
  if (undefinedChecks.length) {
    throw new Error(`Master npm run check references undefined validator scripts: ${undefinedChecks.join(', ')}`)
  }
}

async function validateAssetUploadSecurity() {
  const routes = await readFile(path.join(serverDir, 'routeExtensions.js'), 'utf8')
  const requiredMarkers = [
    'assetUploadScopeAllowed(req.session, req.params)',
    'websiteIds.has(websiteId)',
    'ownerId === accountId || websiteIds.has(ownerId)',
    'fileSize > MAX_ASSET_UPLOAD_BYTES',
    "res.status(403).json({ error: 'Asset upload access denied' })",
  ]

  const missing = requiredMarkers.filter(marker => !routes.includes(marker))
  if (missing.length) {
    throw new Error(`Asset upload security markers are missing: ${missing.join(', ')}`)
  }
}

async function validatePublicErrorSanitization() {
  const routes = await readFile(path.join(serverDir, 'routeExtensions.js'), 'utf8')
  const start = routes.indexOf('export function mountPublicRoutes(app)')
  const end = routes.indexOf('\nexport function mountProtectedRoutes(app)', start)
  if (start < 0 || end < 0) throw new Error('Public route boundary could not be inspected')

  const publicRoutes = routes.slice(start, end)
  if (/error\.message/.test(publicRoutes)) {
    throw new Error('Public checkout routes expose raw error.message details')
  }

  for (const marker of [
    "logPublicCheckoutFailure('Stripe start', error)",
    "error: 'Unable to start Stripe checkout'",
    "error: 'Stripe webhook could not be processed'",
    "logPublicCheckoutFailure('PayPal start', error)",
    "error: 'Unable to start PayPal checkout'",
    "error: 'PayPal webhook could not be processed'",
  ]) {
    if (!routes.includes(marker)) throw new Error(`Public error sanitization marker is missing: ${marker}`)
  }
}

async function validatePublicJsonParserOrder() {
  const start = await readFile(path.join(serverDir, 'start.js'), 'utf8')
  const parserIndex = start.indexOf('const jsonParserResult = originalUse.apply(this, args)')
  const authenticationIndex = start.indexOf('originalUse.call(this, createAuthenticationPublicRouter())')
  const passwordResetIndex = start.indexOf('originalUse.call(this, createPasswordResetPublicRouter())')
  const publicRoutesIndex = start.indexOf('mountPublicRoutes(this)')

  if (parserIndex < 0 || authenticationIndex < parserIndex || passwordResetIndex < parserIndex || publicRoutesIndex < parserIndex) {
    throw new Error('Public POST routes must be mounted after the JSON request parser')
  }
  if (!start.includes('return jsonParserResult')) {
    throw new Error('The intercepted JSON parser must not be mounted a second time')
  }
}

await validateProjectCheckInventory()
await validateAssetUploadSecurity()
await validatePublicErrorSanitization()
await validatePublicJsonParserOrder()

const files = await javascriptFiles(serverDir)
let failed = false

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    failed = true
    console.error(`\nServer syntax check failed: ${path.relative(root, file)}`)
    console.error(result.stderr || result.stdout)
  }
}

if (failed) process.exit(1)
console.log(`Server syntax check passed (${files.length} files); project check inventory, asset upload security, public error sanitization, and public JSON parsing order are complete.`)