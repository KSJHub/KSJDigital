import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const runtime = await fs.readFile(path.join(root, 'server', 'runtimeGlobals.js'), 'utf8')
const guard = await fs.readFile(path.join(root, 'server', 'authLoginGuard.js'), 'utf8')
const errors = []

for (const marker of [
  "import './authLoginGuard.js'",
]) {
  if (!runtime.includes(marker)) errors.push(`runtimeGlobals.js is missing ${marker}`)
}

for (const marker of [
  'MAX_FAILURES = 5',
  'WINDOW_MS = 15 * 60 * 1000',
  'LOCK_MS = 30 * 60 * 1000',
  "path === '/api/login'",
  "res.status(429)",
  "res.setHeader('Retry-After'",
]) {
  if (!guard.includes(marker)) errors.push(`authLoginGuard.js is missing required protection: ${marker}`)
}

if (errors.length) {
  errors.forEach(error => console.error(`Authentication hardening error: ${error}`))
  process.exit(1)
}

console.log('Authentication hardening check passed.')
