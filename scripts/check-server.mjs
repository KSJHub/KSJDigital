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

await validateProjectCheckInventory()
await validateAssetUploadSecurity()

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
console.log(`Server syntax check passed (${files.length} files); project check inventory and asset upload security are complete.`)
