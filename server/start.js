import express from 'express'
import {
  createCommerceSettingsRouter,
  createWebsiteOrderPrefixGuard,
} from './commerceSettingsRouter.js'
import { createInventoryRouter } from './inventoryRouter.js'
import { createOrdersRouter, createPublicOrdersRouter } from './ordersRouter.js'
import { createPayPalRouter } from './paypalCheckout.js'
import { createRefundRouter } from './refundRouter.js'
import { createStripeRouter } from './stripeCheckout.js'
import { paths, readJson, writeJson } from './storage.js'

const credentialEnvironment = {
  morgan: 'KSJ_OWNER_PASSWORD',
  taj: 'TWOTONETAJ_CLIENT_PASSWORD',
  'goliath-admin': 'GOLIATH_CLIENT_PASSWORD',
}

const insecureStarterCredentials = new Set(['owner-access', 'client-access', 'draft-access'])

async function migrateStarterCredentials() {
  const clients = await readJson(paths.clients(), null)
  if (!Array.isArray(clients)) return

  let changed = false
  const nextClients = clients.map(client => {
    const environmentName = credentialEnvironment[client.id]
    if (!environmentName) return client

    const configured = String(process.env[environmentName] || '').trim()
    const current = String(client.password || client.accessCode || '').trim()
    const shouldReplace = configured && (!current || insecureStarterCredentials.has(current))
    const shouldRemove = !configured && insecureStarterCredentials.has(current)

    if (!shouldReplace && !shouldRemove) return client
    changed = true

    const next = { ...client }
    delete next.password
    next.accessCode = shouldReplace ? configured : ''
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
