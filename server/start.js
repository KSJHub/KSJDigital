import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

const MAX_ASSET_UPLOAD_BYTES = 15 * 1024 * 1024
const ALLOWED_ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'])

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

function assetServingGuard(req, res, next) {
  const extension = path.extname(req.path || '').toLowerCase()
  if (!ALLOWED_ASSET_EXTENSIONS.has(extension)) {
    return res.status(404).send('Asset not found')
  }

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'none'; sandbox")
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (extension === '.pdf') res.setHeader('Content-Disposition', 'attachment')
  next()
}

function assetUploadGuard(req, res, next) {
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
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { extensions: new Set(['.png']), mime: 'image/png' }
  }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return { extensions: new Set(['.jpg', '.jpeg']), mime: 'image/jpeg' }
  }
  const header = buffer.subarray(0, 12).toString('ascii')
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return { extensions: new Set(['.gif']), mime: 'image/gif' }
  }
  if (header.slice(0, 4) === 'RIFF' && header.slice(8, 12) === 'WEBP') {
    return { extensions: new Set(['.webp']), mime: 'image/webp' }
  }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { extensions: new Set(['.pdf']), mime: 'application/pdf' }
  }
  return null
}

function validateUploadedAsset(req, res, next) {
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

loadLocalEnvironment()

const [
  { assertProductCheckoutAccess },
  { createCommerceSettingsRouter, createWebsiteOrderPrefixGuard },
  { createDispatchRouter },
  { createInventoryRouter },
  { createOrdersRouter, createPublicOrdersRouter },
  { createPayPalOrder, createPayPalRouter },
  { createRefundRouter },
  { createLiveSessionAccessMiddleware },
  { createStripeCheckoutSession, createStripeRouter, processStripeCheckoutCompleted },
  { releaseStockReservation },
  { paths, readJson, writeJson },
] = await Promise.all([
  import('./checkoutAccess.js'),
  import('./commerceSettingsRouter.js'),
  import('./dispatchRouter.js'),
  import('./inventoryRouter.js'),
  import('./ordersRouter.js'),
  import('./paypalCheckout.js'),
  import('./refundRouter.js'),
  import('./sessionAccess.js'),
  import('./stripeCheckout.js'),
  import('./stockReservations.js'),
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
const originalPost = express.application.post
let useCalls = 0
let checkoutMounted = false
let publicOrdersMounted = false
let protectedCommerceMounted = false
let assetServingMounted = false
let assetUploadMounted = false

express.application.post = function patchedPost(...args) {
  if (args[0] === '/api/assets/:ownerId/:websiteId/:slotId' && args.length >= 3) {
    return originalPost.call(this, args[0], args[1], validateUploadedAsset, ...args.slice(2))
  }
  return originalPost.apply(this, args)
}

express.application.use = function patchedUse(...args) {
  useCalls += 1

  if (!assetServingMounted && useCalls === 3) {
    assetServingMounted = true
    originalUse.call(this, '/assets', assetServingGuard)
  }

  if (!checkoutMounted && useCalls === 2) {
    checkoutMounted = true

    originalUse.call(this, '/api/checkout/reservations/:id/release', async (req, res) => {
      try {
        const released = await releaseStockReservation(req.params.id)
        res.json({ released })
      } catch (error) {
        res.status(400).json({ error: error.message })
      }
    })

    originalUse.call(this, '/api/checkout/stripe/start', async (req, res, next) => {
      if (req.method !== 'GET' || req.path !== '/') return next()
      try {
        await assertProductCheckoutAccess({
          websiteId: req.query.websiteId,
          productId: req.query.productId,
          provider: 'stripe',
        })
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

    originalUse.call(
      this,
      '/api/checkout/stripe/session',
      express.json({ limit: '1mb' }),
      async (req, res, next) => {
        if (req.method !== 'POST' || req.path !== '/') return next()
        try {
          await assertProductCheckoutAccess({
            websiteId: req.body?.websiteId,
            productId: req.body?.productId,
            provider: 'stripe',
          })
          res.json(await createStripeCheckoutSession(req.body || {}))
        } catch (error) {
          res.status(400).json({ error: error.message })
        }
      },
    )

    originalUse.call(this, '/api/checkout/stripe/sessions/:id/complete', async (req, res) => {
      try {
        const result = await processStripeCheckoutCompleted({
          data: { object: { id: req.params.id } },
        })
        res.json({ ...result, completed: true })
      } catch (error) {
        res.status(400).json({ error: error.message })
      }
    })

    originalUse.call(this, '/api/checkout/paypal/start', async (req, res, next) => {
      if (req.method !== 'GET' || req.path !== '/') return next()
      try {
        await assertProductCheckoutAccess({
          websiteId: req.query.websiteId,
          productId: req.query.productId,
          provider: 'paypal',
        })
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

    originalUse.call(
      this,
      '/api/checkout/paypal/orders',
      express.json({ limit: '1mb' }),
      async (req, res, next) => {
        if (req.method !== 'POST' || req.path !== '/') return next()
        try {
          await assertProductCheckoutAccess({
            websiteId: req.body?.websiteId,
            productId: req.body?.productId,
            provider: 'paypal',
          })
          res.json(await createPayPalOrder(req.body || {}))
        } catch (error) {
          res.status(400).json({ error: error.message })
        }
      },
    )

    originalUse.call(this, '/api/checkout/stripe', createStripeRouter())
    originalUse.call(
      this,
      '/api/checkout/paypal',
      express.json({ limit: '1mb' }),
      createPayPalRouter(),
    )
  }

  const result = originalUse.apply(this, args)

  if (!publicOrdersMounted && useCalls === 2) {
    publicOrdersMounted = true
    originalUse.call(this, '/api/public/orders', createPublicOrdersRouter())
  }

  if (!assetUploadMounted && useCalls === 4) {
    assetUploadMounted = true
    originalUse.call(this, '/api/assets', assetUploadGuard)
  }

  if (!protectedCommerceMounted && useCalls === 4) {
    protectedCommerceMounted = true
    originalUse.call(this, '/api', createLiveSessionAccessMiddleware())
    originalUse.call(this, '/api/websites', createWebsiteOrderPrefixGuard())
    originalUse.call(this, '/api/orders', createDispatchRouter())
    originalUse.call(this, '/api/orders', createOrdersRouter())
    originalUse.call(this, '/api/order-refunds', createRefundRouter())
    originalUse.call(this, '/api/inventory', createInventoryRouter())
    originalUse.call(this, '/api/commerce-settings', createCommerceSettingsRouter())
  }

  return result
}

await import('./index.js')

express.application.use = originalUse
express.application.post = originalPost
