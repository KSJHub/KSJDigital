import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

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

loadLocalEnvironment()

const [
  { createCommerceSettingsRouter, createWebsiteOrderPrefixGuard },
  { createInventoryRouter },
  { createOrdersRouter, createPublicOrdersRouter },
  { createPayPalRouter },
  { createRefundRouter },
  { createStripeRouter },
  { paths, readJson, writeJson },
] = await Promise.all([
  import('./commerceSettingsRouter.js'),
  import('./inventoryRouter.js'),
  import('./ordersRouter.js'),
  import('./paypalCheckout.js'),
  import('./refundRouter.js'),
  import('./stripeCheckout.js'),
  import('./storage.js'),
])

const credentialConfiguration = {
  morgan: { environment: 'KSJ_OWNER_PASSWORD', development: 'owner-access' },
  taj: { environment: 'TWOTONETAJ_CLIENT_PASSWORD', development: 'client-access' },
  'goliath-admin': { environment: 'GOLIATH_CLIENT_PASSWORD', development: 'draft-access' },
}

const insecureStarterCredentials = new Set(['owner-access', 'client-access', 'draft-access'])

async function migrateStarterCredentials() {
  const clients = await readJson(paths.clients(), null)
  if (!Array.isArray(clients)) return

  const production = process.env.NODE_ENV === 'production'
  let changed = false
  const nextClients = clients.map(client => {
    const configuration = credentialConfiguration[client.id]
    if (!configuration) return client

    const configured = String(process.env[configuration.environment] || '').trim()
    const current = String(client.password || client.accessCode || '').trim()
    const desired = configured || (!production ? configuration.development : '')
    const replaceable = !current || insecureStarterCredentials.has(current)

    if (!replaceable || current === desired) return client
    changed = true
    const next = { ...client }
    delete next.password
    next.accessCode = desired
    return next
  })

  if (changed) await writeJson(paths.clients(), nextClients)
}

await migrateStarterCredentials()

const originalUse = express.application.use
let useCalls = 0
let checkoutMounted = false
let publicOrdersMounted = false
let protectedCommerceMounted = false

express.application.use = function patchedUse(...args) {
  useCalls += 1

  if (!checkoutMounted && useCalls === 2) {
    checkoutMounted = true
    originalUse.call(this, '/api/checkout/stripe', createStripeRouter())
    originalUse.call(this, '/api/checkout/paypal', createPayPalRouter())
  }

  const result = originalUse.apply(this, args)

  if (!publicOrdersMounted && useCalls === 2) {
    publicOrdersMounted = true
    originalUse.call(this, '/api/public/orders', createPublicOrdersRouter())
  }

  if (!protectedCommerceMounted && useCalls === 4) {
    protectedCommerceMounted = true
    originalUse.call(this, '/api/websites', createWebsiteOrderPrefixGuard())
    originalUse.call(this, '/api/orders', createOrdersRouter())
    originalUse.call(this, '/api/order-refunds', createRefundRouter())
    originalUse.call(this, '/api/inventory', createInventoryRouter())
    originalUse.call(this, '/api/commerce-settings', createCommerceSettingsRouter())
  }

  return result
}

await import('./index.js')

express.application.use = originalUse
