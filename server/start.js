import express from 'express'
import { createOrdersRouter } from './ordersRouter.js'
import { createPayPalRouter } from './paypalCheckout.js'
import { createStripeRouter } from './stripeCheckout.js'

const originalUse = express.application.use
let useCalls = 0
let checkoutMounted = false
let ordersMounted = false

express.application.use = function patchedUse(...args) {
  useCalls += 1

  if (!checkoutMounted && useCalls === 2) {
    checkoutMounted = true
    originalUse.call(this, '/api/checkout/stripe', createStripeRouter())
    originalUse.call(this, '/api/checkout/paypal', createPayPalRouter())
  }

  const result = originalUse.apply(this, args)

  if (!ordersMounted && useCalls === 4) {
    ordersMounted = true
    originalUse.call(this, '/api/orders', createOrdersRouter())
  }

  return result
}

await import('./index.js')

express.application.use = originalUse
