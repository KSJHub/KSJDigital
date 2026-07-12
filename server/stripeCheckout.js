import crypto from 'node:crypto'
import express from 'express'
import {
  calculateShipping,
  calculateTax,
  getCommerceSettings,
  recordDiscountUse,
  resolveDiscount,
} from './commerceSettingsRouter.js'
import { decrementProductStock, resolveProductSelection } from './merchValidation.js'
import { createPaidOrder } from './orderService.js'
import { sendOrderNotifications } from './orderNotificationService.js'
import {
  consumeStockReservation,
  getActiveStockReservation,
  releaseStockReservation,
  reserveProductStock,
} from './stockReservations.js'
import { paths, readJson, safeName } from './storage.js'

const STRIPE_API = 'https://api.stripe.com/v1'
const SIGNATURE_TOLERANCE_SECONDS = 300
const STRIPE_SESSION_SECONDS = 30 * 60

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

function addQueryParam(url, key, value) {
  const parsed = new URL(url)
  parsed.searchParams.set(key, value)
  return parsed.toString()
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

function getProduct(merch, productId, allowUnavailable = false) {
  const product = merch.products.find(item => item.id === productId)
  if (!product) throw new Error('Product was not found')
  if (!allowUnavailable && product.availability !== 'available') throw new Error('Product is not available')
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

export async function createStripeCheckoutSession({ websiteId, productId, quantity = 1, variant = {}, discountCode = '' }) {
  const safeWebsiteId = safeName(websiteId)
  const { content, merch } = await getStore(safeWebsiteId)
  const product = getProduct(merch, productId)
  const selection = resolveProductSelection(product, quantity, variant)
  const settings = await checkoutSettings(safeWebsiteId, content)
  if (!settings.stripeEnabled) throw new Error('Stripe checkout is disabled for this website')
  if (!settings.successUrl || !settings.cancelUrl) throw new Error('Stripe success and cancel URLs are not configured')

  const originalSubtotal = Number(product.priceGBP) * selection.quantity
  const discount = resolveDiscount(settings, discountCode, originalSubtotal)
  const discountedSubtotal = Math.max(0, originalSubtotal - discount.amount)
  const shippingProduct = { ...product, priceGBP: discountedSubtotal / selection.quantity }
  const shipping = calculateShipping(settings, shippingProduct, selection.quantity)
  const tax = calculateTax(settings, discountedSubtotal, shipping.amount)
  const reservation = await reserveProductStock({
    websiteId: safeWebsiteId,
    product,
    quantity: selection.quantity,
    variant: selection.variant,
    provider: 'stripe',
  })
  const reservationId = reservation?.id || ''
  const hasDiscount = discount.amount > 0
  const entries = [
    ['mode', 'payment'],
    ['success_url', `${settings.successUrl}${settings.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`],
    ['cancel_url', reservationId ? addQueryParam(settings.cancelUrl, 'reservation_id', reservationId) : settings.cancelUrl],
    ['expires_at', Math.floor(Date.now() / 1000) + STRIPE_SESSION_SECONDS],
    ['customer_creation', 'always'],
    ['billing_address_collection', 'auto'],
    ['line_items[0][quantity]', hasDiscount ? 1 : selection.quantity],
    ['line_items[0][price_data][currency]', 'gbp'],
    ['line_items[0][price_data][unit_amount]', Math.round(discountedSubtotal * 100 / (hasDiscount ? 1 : selection.quantity))],
    ['line_items[0][price_data][product_data][name]', hasDiscount ? `${product.name} × ${selection.quantity}` : product.name],
    ['line_items[0][price_data][product_data][description]', hasDiscount ? `${product.description || ''} Discount ${discount.code} applied.`.trim() : product.description],
    ['metadata[websiteId]', safeWebsiteId],
    ['metadata[productId]', product.id],
    ['metadata[quantity]', selection.quantity],
    ['metadata[size]', selection.variant.size],
    ['metadata[colour]', selection.variant.colour],
    ['metadata[reservationId]', reservationId],
    ['metadata[shippingLabel]', shipping.label],
    ['metadata[originalSubtotal]', originalSubtotal.toFixed(2)],
    ['metadata[discountCode]', discount.code],
    ['metadata[discountAmount]', discount.amount.toFixed(2)],
    ['metadata[productNet]', tax.productNet.toFixed(2)],
    ['metadata[shippingNet]', tax.shippingNet.toFixed(2)],
    ['metadata[taxAmount]', tax.amount.toFixed(2)],
    ['metadata[taxLabel]', tax.label],
    ['metadata[taxRate]', tax.rate],
    ['metadata[taxIncluded]', tax.included ? 'true' : 'false'],
    ['metadata[taxNumber]', tax.number],
  ]

  if (tax.enabled && !tax.included && tax.amount > 0) {
    entries.push(['line_items[1][quantity]', 1])
    entries.push(['line_items[1][price_data][currency]', 'gbp'])
    entries.push(['line_items[1][price_data][unit_amount]', Math.round(tax.amount * 100)])
    entries.push(['line_items[1][price_data][product_data][name]', `${tax.label} (${tax.rate}%)`])
  }

  if (product.fulfilment !== 'digital') {
    entries.push(['shipping_address_collection[allowed_countries][0]', 'GB'])
    entries.push(['shipping_options[0][shipping_rate_data][type]', 'fixed_amount'])
    entries.push(['shipping_options[0][shipping_rate_data][display_name]', shipping.label])
    entries.push(['shipping_options[0][shipping_rate_data][fixed_amount][amount]', Math.round(shipping.amount * 100)])
    entries.push(['shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'gbp'])
    if (shipping.minimumDays > 0) {
      entries.push(['shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day'])
      entries.push(['shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]', shipping.minimumDays])
      entries.push(['shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day'])
      entries.push(['shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]', shipping.maximumDays])
    }
  }

  try {
    const session = await stripeRequest('/checkout/sessions', entries)
    return { id: session.id, url: session.url }
  } catch (error) {
    if (reservationId) await releaseStockReservation(reservationId)
    throw error
  }
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

function paidSelection(product, metadata = {}) {
  return {
    quantity: Math.max(1, Number(metadata.quantity || 1)),
    variant: { size: metadata.size || '', colour: metadata.colour || '' },
    madeToOrder: product.fulfilmentOptions?.madeToOrder === true,
    leadTimeMessage: String(product.fulfilmentOptions?.leadTimeMessage || '').trim(),
  }
}

export async function processStripeCheckoutCompleted(event) {
  const eventSession = event.data?.object
  if (!eventSession?.id) throw new Error('Stripe session is missing')
  const session = await retrieveStripeSession(eventSession.id)
  if (session.payment_status !== 'paid') return { ignored: true, reason: 'Session is not paid' }

  const websiteId = safeName(session.metadata?.websiteId)
  const { content, merch } = await getStore(websiteId)
  const product = getProduct(merch, session.metadata?.productId, true)
  const settings = await checkoutSettings(websiteId, content)
  const reservationId = session.metadata?.reservationId || ''
  const reservation = await getActiveStockReservation(reservationId)
  const selection = reservation
    ? paidSelection(product, session.metadata)
    : resolveProductSelection(product, session.metadata?.quantity, {
        size: session.metadata?.size,
        colour: session.metadata?.colour,
      })
  const customerDetails = session.customer_details || {}
  const shippingDetails = session.shipping_details || session.collected_information?.shipping_details || {}
  const discountAmount = Number(session.metadata?.discountAmount || 0)
  const discountCode = session.metadata?.discountCode || ''

  const { order, created } = await createPaidOrder({
    websiteId,
    clientName: content.brand?.name || websiteId,
    provider: 'stripe',
    providerOrderId: session.id,
    providerTransactionId: session.payment_intent || '',
    paymentMethod: 'Card / Stripe',
    currency: String(session.currency || 'gbp').toUpperCase(),
    subtotal: Number(session.metadata?.productNet || session.amount_subtotal || 0),
    shipping: Number(session.metadata?.shippingNet || session.total_details?.amount_shipping || 0),
    tax: Number(session.metadata?.taxAmount || 0),
    taxLabel: session.metadata?.taxLabel || 'Tax',
    taxRate: Number(session.metadata?.taxRate || 0),
    taxIncluded: session.metadata?.taxIncluded === 'true',
    taxNumber: session.metadata?.taxNumber || '',
    discount: discountAmount,
    discountCode,
    total: Number(session.amount_total || 0) / 100,
    customer: {
      name: customerDetails.name || shippingDetails.name || 'Customer',
      email: customerDetails.email || session.customer_email || '',
      phone: customerDetails.phone || '',
    },
    billingAddress: stripeAddress(customerDetails.address),
    shippingAddress: stripeAddress(shippingDetails.address),
    shippingMethod: product.fulfilment === 'digital'
      ? 'Digital delivery'
      : selection.madeToOrder
        ? `Made to order · ${session.metadata?.shippingLabel || 'UK delivery'}`
        : session.metadata?.shippingLabel || 'UK delivery',
    items: [
      {
        productId: product.id,
        name: product.name,
        image: product.image?.url || '',
        quantity: selection.quantity,
        unitPrice: Number(product.priceGBP),
        fulfilment: product.fulfilment,
        madeToOrder: selection.madeToOrder,
        leadTimeMessage: selection.leadTimeMessage,
        variant: selection.variant,
      },
    ],
    paidAt: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  })

  if (created) {
    if (reservation) await consumeStockReservation(reservationId)
    else await decrementProductStock(websiteId, product.id, selection.quantity, selection.variant)
    await recordDiscountUse(websiteId, discountCode)
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
        discountCode: req.query.discountCode,
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
      if (event.type === 'checkout.session.expired') {
        await releaseStockReservation(event.data?.object?.metadata?.reservationId)
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
