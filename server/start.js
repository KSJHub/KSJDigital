import express from 'express'
import { createOrdersRouter } from './ordersRouter.js'
import { createStripeRouter } from './stripeCheckout.js'

const originalUse = express.application.use
let useCalls = 0
let stripeMounted = false
let ordersMounted = false

express.application.use = function patchedUse(...args) {
  useCalls += 1

  if (!stripeMounted && useCalls === 2) {
    stripeMounted = true
    originalUse.call(this, '/api/checkout/stripe', createStripeRouter())
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
