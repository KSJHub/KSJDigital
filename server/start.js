import express from 'express'
import { createStripeRouter } from './stripeCheckout.js'

const originalUse = express.application.use
let useCalls = 0
let stripeMounted = false

express.application.use = function patchedUse(...args) {
  useCalls += 1

  if (!stripeMounted && useCalls === 2) {
    stripeMounted = true
    originalUse.call(this, '/api/checkout/stripe', createStripeRouter())
  }

  return originalUse.apply(this, args)
}

await import('./index.js')

express.application.use = originalUse
