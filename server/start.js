import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { getCredential, setPassword, verifyPassword } from './credentialStore.js'
import {
  assetServingGuard,
  assetUploadGuard,
  mountProtectedRoutes,
  mountPublicRoutes,
  validateUploadedAsset,
} from './routeExtensions.js'

function loadLocalEnvironment() {
  const file = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(file)) return

  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

const credentialConfiguration = {
  morgan: { environment: 'KSJ_OWNER_PASSWORD', development: 'owner-access' },
  taj: { environment: 'TWOTONETAJ_CLIENT_PASSWORD', development: 'client-access' },
  'goliath-admin': { environment: 'GOLIATH_CLIENT_PASSWORD', development: 'draft-access' },
}

async function synchroniseConfiguredCredentials() {
  const production = process.env.NODE_ENV === 'production'

  for (const [accountId, configuration] of Object.entries(credentialConfiguration)) {
    const configured = String(process.env[configuration.environment] || '').trim()
    const desired = configured || (!production ? configuration.development : '')
    if (!desired) continue

    const current = await getCredential(accountId)
    if (current?.passwordHash && await verifyPassword(desired, current.passwordHash)) continue
    await setPassword(accountId, desired)
  }
}

loadLocalEnvironment()
await synchroniseConfiguredCredentials()

const originalUse = express.application.use
const originalPost = express.application.post
let publicRoutesMounted = false
let protectedRoutesMounted = false
let assetServingMounted = false
let assetUploadMounted = false

express.application.post = function guardedPost(...args) {
  if (args[0] === '/api/assets/:ownerId/:websiteId/:slotId' && args.length >= 3) {
    return originalPost.call(this, args[0], args[1], validateUploadedAsset, ...args.slice(2))
  }
  return originalPost.apply(this, args)
}

express.application.use = function routeAwareUse(...args) {
  const mountPath = typeof args[0] === 'string' ? args[0] : ''
  const middleware = mountPath ? args[1] : args[0]

  if (!publicRoutesMounted && middleware?.name === 'jsonParser') {
    publicRoutesMounted = true
    mountPublicRoutes(this)
  }

  if (!assetServingMounted && mountPath === '/assets') {
    assetServingMounted = true
    originalUse.call(this, '/assets', assetServingGuard)
  }

  if (!assetUploadMounted && mountPath === '/api') {
    assetUploadMounted = true
    originalUse.call(this, '/api/assets', assetUploadGuard)
  }

  const result = originalUse.apply(this, args)

  if (!protectedRoutesMounted && mountPath === '/api' && middleware?.name === 'requireSession') {
    protectedRoutesMounted = true
    mountProtectedRoutes(this)
  }

  return result
}

await import('./index.js')

express.application.use = originalUse
express.application.post = originalPost
