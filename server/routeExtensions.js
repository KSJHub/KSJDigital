import path from 'node:path'
import express from 'express'
import { assertProductCheckoutAccess } from './checkoutAccess.js'
import { captureBasketPayPalOrder, completeBasketStripeSession } from './basketCheckout.js'
import { createCommerceSettingsRouter, createWebsiteOrderPrefixGuard } from './commerceSettingsRouter.js'
import { starterWebsites } from './defaults.js'
import { createDispatchRouter } from './dispatchRouter.js'
import { createInventoryRouter } from './inventoryRouter.js'
import { createOrdersRouter, createPublicOrdersRouter } from './ordersRouter.js'
import { createPayPalOrder, createPayPalRouter, verifyPayPalWebhook } from './paypalCheckout.js'
import { getPublishedContent } from './publishedContent.js'
import { createRefundRouter } from './refundRouter.js'
import { createLiveSessionAccessMiddleware } from './sessionAccess.js'
import { createStripeCheckoutSession, createStripeRouter, processStripeCheckoutCompleted, verifyStripeWebhook } from './stripeCheckout.js'
import { releaseStockReservation } from './stockReservations.js'
import { createTeamRouter } from './teamRouter.js'
import { trustedOriginGuard } from './trustedOriginGuard.js'
import { paths, readJson, readWebsiteAssets, safeName } from './storage.js'

const MAX_ASSET_UPLOAD_BYTES = 15 * 1024 * 1024
const ALLOWED_ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'])

export function assetServingGuard(req, res, next) {
  const extension = path.extname(req.path || '').toLowerCase()
  if (!ALLOWED_ASSET_EXTENSIONS.has(extension)) return res.status(404).send('Asset not found')

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'none'; sandbox")
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (extension === '.pdf') res.setHeader('Content-Disposition', 'attachment')
  next()
}

export function assetUploadGuard(req, res, next) {
  if (req.method !== 'POST') return next()
  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  if (!contentType.startsWith('multipart/form-data;')) {
    return res.status(415).json({ error: 'Asset uploads must use multipart form data' })
  }

  const contentLength = Number(req.headers['content-length'] || 0)
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return res.status(411).json({ error: 'Upload size is required' })
  }
  if (contentLength > MAX_ASSET_UPLOAD_BYTES) {
    return res.status(413).json({ error: 'Asset uploads are limited to 15MB' })
  }
  next()
}

function startsWithBytes(buffer, bytes) {
  return buffer.length >= bytes.length && bytes.every((value, index) => buffer[index] === value)
}

function detectAssetType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { extensions: new Set(['.png']), mime: 'image/png' }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return { extensions: new Set(['.jpg', '.jpeg']), mime: 'image/jpeg' }
  const header = buffer.subarray(0, 12).toString('ascii')
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return { extensions: new Set(['.gif']), mime: 'image/gif' }
  if (header.slice(0, 4) === 'RIFF' && header.slice(8, 12) === 'WEBP') return { extensions: new Set(['.webp']), mime: 'image/webp' }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { extensions: new Set(['.pdf']), mime: 'application/pdf' }
  return null
}

export function validateUploadedAsset(req, res, next) {
  if (!req.file) return next()
  const extension = path.extname(req.file.originalname || '').toLowerCase()
  const detected = detectAssetType(req.file.buffer)
  if (!detected || !detected.extensions.has(extension)) {
    return res.status(415).json({ error: 'File content does not match an approved image or PDF type' })
  }

  const suppliedMime = String(req.file.mimetype || '').toLowerCase()
  if (suppliedMime && suppliedMime !== detected.mime) {
    return res.status(415).json({ error: 'File type does not match its uploaded content' })
  }

  req.file.mimetype = detected.mime
  next()
}

function websiteRegistryMutationGuard(req, res, next) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next()
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Website registry changes require platform owner access' })
}

function isBasketMiss(error) {
  return ['Checkout basket was not found', 'Stripe basket reference is missing'].includes(error?.message)
}

export function mountPublicRoutes(app) {
  app.use('/api/checkout/reservations/:id/release', async (req, res) => {
    try {
      const released = await releaseStockReservation(req.params.id)
      res.json({ released })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.use('/api/checkout/stripe/start', async (req, res, next) => {
    if (req.method !== 'GET' || req.path !== '/') return next()
    try {
      await assertProductCheckoutAccess({ websiteId: req.query.websiteId, productId: req.query.productId, provider: 'stripe' })
      const session = await createStripeCheckoutSession({
        websiteId: req.query.websiteId,
        productId: req.query.productId,
        quantity: req.query.quantity,
        variant: { size: req.query.size, colour: req.query.colour },
        discountCode: req.query.discountCode,
      })
      res.redirect(303, session.url)
    } catch (error) {
      res.status(400).send(`Unable to start Stripe checkout: ${error.message}`)
    }
  })

  app.use('/api/checkout/stripe/session', express.json({ limit: '1mb' }), async (req, res, next) => {
    if (req.method !== 'POST' || req.path !== '/') return next()
    try {
      await assertProductCheckoutAccess({ websiteId: req.body?.websiteId, productId: req.body?.productId, provider: 'stripe' })
      res.json(await createStripeCheckoutSession(req.body || {}))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.use('/api/checkout/stripe/sessions/:id/complete', async (req, res) => {
    try {
      const result = await processStripeCheckoutCompleted({ data: { object: { id: req.params.id } } })
      res.json({ ...result, completed: true })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.use('/api/checkout/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
    try {
      const event = verifyStripeWebhook(req.body, req.headers['stripe-signature'])
      if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return next()
      try {
        await completeBasketStripeSession(event.data?.object?.id)
        return res.json({ received: true, basket: true })
      } catch (error) {
        if (isBasketMiss(error)) return next()
        throw error
      }
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
  })

  app.use('/api/checkout/paypal/start', async (req, res, next) => {
    if (req.method !== 'GET' || req.path !== '/') return next()
    try {
      await assertProductCheckoutAccess({ websiteId: req.query.websiteId, productId: req.query.productId, provider: 'paypal' })
      const order = await createPayPalOrder({
        websiteId: req.query.websiteId,
        productId: req.query.productId,
        quantity: req.query.quantity,
        variant: { size: req.query.size, colour: req.query.colour },
        discountCode: req.query.discountCode,
      })
      if (!order.approvalUrl) throw new Error('PayPal approval URL was not returned')
      res.redirect(303, order.approvalUrl)
    } catch (error) {
      res.status(400).send(`Unable to start PayPal checkout: ${error.message}`)
    }
  })

  app.use('/api/checkout/paypal/orders', express.json({ limit: '1mb' }), async (req, res, next) => {
    if (req.method !== 'POST' || req.path !== '/') return next()
    try {
      await assertProductCheckoutAccess({ websiteId: req.body?.websiteId, productId: req.body?.productId, provider: 'paypal' })
      res.json(await createPayPalOrder(req.body || {}))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.use('/api/checkout/paypal/webhook', express.json({ limit: '1mb' }), async (req, res, next) => {
    try {
      const verified = await verifyPayPalWebhook(req.headers, req.body)
      if (!verified) return res.status(400).json({ error: 'PayPal webhook verification failed' })
      if (req.body?.event_type !== 'CHECKOUT.ORDER.APPROVED') return next()
      try {
        await captureBasketPayPalOrder(req.body.resource?.id)
        return res.json({ received: true, basket: true })
      } catch (error) {
        if (isBasketMiss(error)) return next()
        throw error
      }
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
  })

  app.use('/api/checkout/stripe', createStripeRouter())
  app.use('/api/checkout/paypal', express.json({ limit: '1mb' }), createPayPalRouter())

  app.use('/api/public/sites/:websiteId', async (req, res, next) => {
    if (req.method !== 'GET' || req.path !== '/') return next()
    const websiteId = safeName(req.params.websiteId)
    const websites = await readJson(paths.websites(), starterWebsites)
    const website = websites.find(site => safeName(site.id) === websiteId)
    if (!website) return res.status(404).json({ error: 'Website not found' })

    const content = await getPublishedContent(websiteId)
    const assets = await readWebsiteAssets(websiteId)
    res.setHeader('Cache-Control', 'no-store')
    res.json({ website, content, assets, publishedAt: content.publishedAt || null })
  })

  app.use('/api/public/orders', createPublicOrdersRouter())
}

export function mountProtectedRoutes(app) {
  app.use('/api', createLiveSessionAccessMiddleware())
  app.use('/api', trustedOriginGuard)
  app.use('/api/websites', websiteRegistryMutationGuard)
  app.use('/api/websites', createWebsiteOrderPrefixGuard())
  app.use('/api/team', createTeamRouter())
  app.use('/api/orders', createDispatchRouter())
  app.use('/api/orders', createOrdersRouter())
  app.use('/api/order-refunds', createRefundRouter())
  app.use('/api/inventory', createInventoryRouter())
  app.use('/api/commerce-settings', createCommerceSettingsRouter())
}
