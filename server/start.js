import express from 'express'
import {
  createCommerceSettingsRouter,
  createWebsiteOrderPrefixGuard,
} from './commerceSettingsRouter.js'
import { createOrdersRouter, createPublicOrdersRouter } from './ordersRouter.js'
import { createPayPalRouter } from './paypalCheckout.js'
import { createStripeRouter } from './stripeCheckout.js'

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
    originalUse.call(this, '/api/commerce-settings', createCommerceSettingsRouter())
  }

  return result
}

await import('./index.js')

express.application.use = originalUse
