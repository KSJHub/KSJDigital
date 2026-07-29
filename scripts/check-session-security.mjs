import fs from 'node:fs/promises'

const runtime = await fs.readFile('server/sessionSecurityRuntime.js', 'utf8')
const globals = await fs.readFile('server/runtimeGlobals.js', 'utf8')
const access = await fs.readFile('server/sessionAccess.js', 'utf8')
const errors = []

for (const marker of [
  'IDLE_TIMEOUT_MS = 30 * 60 * 1000',
  'ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000',
  'sessionExpired(record',
  'lastSeenAt',
  "process.env.NODE_ENV === 'production'",
  '; Secure',
  'Your session has expired. Please sign in again.',
]) {
  if (!runtime.includes(marker)) errors.push(`sessionSecurityRuntime.js is missing required marker: ${marker}`)
}

for (const marker of [
  'function accountIsSuspended(account = {})',
  "String(account.status || '').trim().toLowerCase() === 'suspended'",
  'if (!account || accountIsSuspended(account))',
]) {
  if (!access.includes(marker)) errors.push(`sessionAccess.js is missing required suspended-account marker: ${marker}`)
}
if (access.includes("account.status === 'Suspended'")) {
  errors.push('Suspended-account enforcement must not rely on case-sensitive status matching')
}

const sessionImport = globals.indexOf("import './sessionSecurityRuntime.js'")
const authImport = globals.indexOf("import './authLoginGuard.js'")
if (sessionImport < 0 || authImport < 0 || sessionImport > authImport) {
  errors.push('Session security must load before the authentication route guard')
}

if (errors.length) {
  errors.forEach(error => console.error(`Session security error: ${error}`))
  process.exit(1)
}

console.log('Session security check passed.')
