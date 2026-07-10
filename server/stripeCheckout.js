import crypto from 'node:crypto'
import express from 'express'
import { getCommerceSettings } from './commerceSettingsRouter.js'
import { decrementProductStock, resolveProductSelection } from './merchValidation.js'
import { createPaidOrder } from './orderService.js'
import { sendOrderNotifications } from './orderNotificationService.js'
import { paths, readJson, safeName } from './storage.js'

const STRIPE_API = 'https://api.stripe.com/v1'
const SIGNATURE_TOLERANCE_SECONDS = 300

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function formBody(entries) {
  const body = new URLSearchParams()
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') body.append(key, String(value))
  }
  return body
}

async function stripeRequest(path, entries) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEnv('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody(entries),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || `Stripe request failed: ${response.status}`)
  return data
}

function parseStripeSignature(header = '') {
  return header.split(',').reduce(
    (result, part) => {
      const [key, value] = part.split('=')
      if (key === 't') result.timestamp = Number(value)
      if (key === 'v1') result.signatures.push(value)
      return result
    },
    { timestamp: 0, signatures: [] },
  )
}

export function verifyStripeWebhook(rawBody, signatureHeader, secret = requiredEnv('STRIPE_WEBHOOK_SECRET')) {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader)
  if (!timestamp || !signatures.length) throw new Error('Stripe signature is missing')
  if (Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error('Stripe webhook timestamp is outside tolerance')
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  const valid = signatures.some(signature => {
    try {
      const signatureBuffer = Buffer.from(signature, 'hex')
      return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    } catch {
      return false
    }
  })

  if (!valid) throw new Error('Stripe webhook signature is invalid')
  return JSON.parse(payload)
}

async function getStore(websiteId) {
  const content = await readJson(paths.content(websiteId), {})
  const merch = content.merch
  if (!merch || !Array.isArray(merch.products)) throw new Error('Merch catalogue is unavailable')
  return { content, merch }
}

function getProduct(merch, productId) {
  const product = merch.products.find(item => item.id === productId)
  if (!product) throw new Error('Product was not found')
  if (product.availability !== 'available') throw new Error('Product is not available')
  if (Number(product.priceGBP) <= 0) throw new Error('Product price is invalid')
  return product
}

async function checkoutSettings(websiteId, content = {}) {
  const commerce = await getCommerceSettings(websiteId)
  return {
    ...commerce,
    successUrl: commerce.successUrl || process.env.STRIPE_SUCCESS_URL,
    cancelUrl: commerce.cancelUrl || process.env.STRIPE_CANCEL_URL,
    supportEmail: commerce.supportEmail || content.contact?.supportEmail || '',
    replyTo: commerce.replyTo || commerce.supportEmail || content.contact?.supportEmail || '',
    brandName: content.brand?.name || websiteId,
    manageUrl: process.env.ORDER_MANAGE_URL || 'https://ksjdigital.co.uk/owner/orders',
  }
}

export async function createStripeCheckoutSession({ websiteId, productId, quantity = 1, variant = {} }) {
  const safeWebsiteId = safeName(websiteId)
  const { content, merch } = await getStore(safeWebsiteId)
  const product = getProduct(merch, productId)
  const selection = resolveProductSelection(product, quantity, variant)
  const settings = await checkoutSettings(safeWebsiteId, content)
  if (!settings.stripeEnabled) throw new Error('Stripe checkout is disabled for this website')
  if (!settings.successUrl || !settings.cancelUrl) throw new Error('Stripe success and cancel URLs are not configured')

  const amount = Math.round(Number(product.priceGBP) * 100)
  const session = await stripeRequest('/checkout/sessions', [
    ['mode', 'payment'],
    ['success_url', `${settings.successUrl}${settings.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`],
    ['cancel_url', settings.cancelUrl],
    ['customer_creation', 'always'],
    ['billing_address_collection', 'auto'],
    ['shipping_address_collection[allowed_countries][0]', 'GB'],
    ['line_items[0][quantity]', selection.quantity],
    ['line_items[0][price_data][currency]', 'gbp'],
    ['line_items[0][price_data][unit_amount]', amount],
    ['line_items[0][price_data][product_data][name]', product.name],
    ['line_items[0][price_data][product_data][description]', product.description],
    ['metadata[websiteId]', safeWebsiteId],
    ['metadata[productId]', product.id],
    ['metadata[quantity]', selection.quantity],
    ['metadata[size]', selection.variant.size],
    ['metadata[colour]', selection.variant.colour],
  ])

  return { id: session.id, url: session.url }
}

async function retrieveStripeSession(sessionId) {
  const response = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`, {
    headers: { Authorization: `Bearer ${requiredEnv('STRIPE_SECRET_KEY')}` },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Unable to retrieve Stripe session')
  return data
}

function stripeAddress(address = {}) {
  return {
    line1: address.line1 || '',
    line2: address.line2 || '',
    city: address.city || '',
    region: address.state || '',
    postalCode: address.postal_code || '',
    countryCode: address.country || '',
  }
}

export async function processStripeCheckoutCompleted(event) {
  const eventSession = event.data?.object
  if (!eventSession?.id) throw new Error('Stripe session is missing')
  const session = await retrieveStripeSession(eventSession.id)
  if (session.payment_status !== 'paid') return { ignored: true, reason: 'Session is not paid' }

  const websiteId = safeName(session.metadata?.websiteId)
  const { content, merch } = await getStore(websiteId)
  const product = getProduct(merch, session.metadata?.productId)
  const settings = await checkoutSettings(websiteId, content)
  const selection = resolveProductSelection(product, session.metadata?.quantity, {
    size: session.metadata?.size,
    colour: session.metadata?.colour,
  })
  const customerDetails = session.customer_details || {}
  const shippingDetails = session.shipping_details || session.collected_information?.shipping_details || {}

  const { order, created } = await createPaidOrder({
    websiteId,
    clientName: content.brand?.name || websiteId,
    provider: 'stripe',
    providerOrderId: session.id,
    providerTransactionId: session.payment_intent || '',
    paymentMethod: 'Card / Stripe',
    currency: String(session.currency || 'gbp').toUpperCase(),
    subtotal: Number(session.amount_subtotal || 0) / 100,
    shipping: Number(session.total_details?.amount_shipping || 0) / 100,
    tax: Number(session.total_details?.amount_tax || 0) / 100,
    discount: Number(session.total_details?.amount_discount || 0) / 100,
    total: Number(session.amount_total || 0) / 100,
    customer: {
      name: customerDetails.name || shippingDetails.name || 'Customer',
      email: customerDetails.email || session.customer_email || '',
      phone: customerDetails.phone || '',
    },
    billingAddress: stripeAddress(customerDetails.address),
    shippingAddress: stripeAddress(shippingDetails.address),
    shippingMethod: 'Standard delivery',
    items: [
      {
        productId: product.id,
        name: product.name,
        image: product.image?.url || '',
        quantity: selection.quantity,
        unitPrice: Number(product.priceGBP),
        fulfilment: product.fulfilment,
        variant: selection.variant,
      },
    ],
    paidAt: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  })

  if (created) {
    await decrementProductStock(websiteId, product.id, selection.quantity)
    await sendOrderNotifications(order, settings)
  }
  return { order, created }
}

export function createStripeRouter() {
  const router = express.Router()

  router.get('/start', async (req, res) => {
    try {
      const session = await createStripeCheckoutSession({
        websiteId: req.query.websiteId,
        productId: req.query.productId,
        quantity: req.query.quantity,
        variant: { size: req.query.size, colour: req.query.colour },
      })
      res.redirect(303, session.url)
    } catch (error) {
      res.status(400).send(`Unable to start Stripe checkout: ${error.message}`)
    }
  })

  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const event = verifyStripeWebhook(req.body, req.headers['stripe-signature'])
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        await processStripeCheckoutCompleted(event)
      }
      res.json({ received: true })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  router.post('/session', express.json(), async (req, res) => {
    try {
      const session = await createStripeCheckoutSession(req.body || {})
      res.json(session)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
