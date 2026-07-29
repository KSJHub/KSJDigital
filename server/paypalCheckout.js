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

function apiBase() {
  return process.env.PAYPAL_ENVIRONMENT === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function addQueryParam(url, key, value) {
  const parsed = new URL(url)
  parsed.searchParams.set(key, value)
  return parsed.toString()
}

async function accessToken() {
  const credentials = Buffer.from(
    `${requiredEnv('PAYPAL_CLIENT_ID')}:${requiredEnv('PAYPAL_CLIENT_SECRET')}`,
  ).toString('base64')
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error_description || 'PayPal authentication failed')
  return data.access_token
}

async function paypalRequest(path, options = {}) {
  const token = await accessToken()
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || data?.details?.[0]?.description || `PayPal request failed: ${response.status}`)
  }
  return data
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
    paypalReturnUrl: commerce.paypalReturnUrl || process.env.PAYPAL_RETURN_URL,
    cancelUrl: commerce.cancelUrl || process.env.PAYPAL_CANCEL_URL,
    supportEmail: commerce.supportEmail || content.contact?.supportEmail || '',
    replyTo: commerce.replyTo || commerce.supportEmail || content.contact?.supportEmail || '',
    brandName: content.brand?.name || websiteId,
    manageUrl: process.env.ORDER_MANAGE_URL || 'https://ksjdigital.co.uk/owner/orders',
  }
}

export async function createPayPalOrder({ websiteId, productId, quantity = 1, variant = {}, discountCode = '' }) {
  const safeWebsiteId = safeName(websiteId)
  const { content, merch } = await getStore(safeWebsiteId)
  const product = getProduct(merch, productId)
  const selection = resolveProductSelection(product, quantity, variant)
  const settings = await checkoutSettings(safeWebsiteId, content)
  if (!settings.paypalEnabled) throw new Error('PayPal checkout is disabled for this website')
  if (!settings.paypalReturnUrl || !settings.cancelUrl) {
    throw new Error('PayPal return and cancel URLs are not configured')
  }

  const unitPrice = Number(product.priceGBP)
  const originalSubtotal = unitPrice * selection.quantity
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
    provider: 'paypal',
  })
  const reservationId = reservation?.id || ''
  const breakdown = {
    item_total: { currency_code: 'GBP', value: discountedSubtotal.toFixed(2) },
    shipping: { currency_code: 'GBP', value: shipping.amount.toFixed(2) },
  }
  if (tax.enabled && !tax.included && tax.amount > 0) {
    breakdown.tax_total = { currency_code: 'GBP', value: tax.amount.toFixed(2) }
  }

  const hasDiscount = discount.amount > 0
  try {
    const order = await paypalRequest('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': crypto.randomUUID() },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: safeWebsiteId,
          custom_id: JSON.stringify({
            w: safeWebsiteId,
            p: product.id,
            q: selection.quantity,
            s: selection.variant.size,
            c: selection.variant.colour,
            l: shipping.label,
            d: discount.code,
            a: discount.amount,
            r: reservationId,
            u: unitPrice,
          }),
          description: product.name,
          amount: {
            currency_code: 'GBP',
            value: tax.total.toFixed(2),
            breakdown,
          },
          items: [{
            name: hasDiscount ? `${product.name} × ${selection.quantity}` : product.name,
            description: hasDiscount ? `${product.description || ''} Discount ${discount.code} applied.`.trim() : product.description,
            quantity: hasDiscount ? '1' : String(selection.quantity),
            category: product.fulfilment === 'digital' ? 'DIGITAL_GOODS' : 'PHYSICAL_GOODS',
            unit_amount: {
              currency_code: 'GBP',
              value: (discountedSubtotal / (hasDiscount ? 1 : selection.quantity)).toFixed(2),
            },
          }],
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: process.env.PAYPAL_BRAND_NAME || settings.brandName || 'TwoToneTaj Merch',
              shipping_preference: product.fulfilment === 'digital' ? 'NO_SHIPPING' : 'GET_FROM_FILE',
              user_action: 'PAY_NOW',
              return_url: settings.paypalReturnUrl,
              cancel_url: reservationId ? addQueryParam(settings.cancelUrl, 'reservation_id', reservationId) : settings.cancelUrl,
            },
          },
        },
      }),
    })
    return {
      id: order.id,
      status: order.status,
      approvalUrl: order.links?.find(link => link.rel === 'payer-action' || link.rel === 'approve')?.href || '',
    }
  } catch (error) {
    if (reservationId) await releaseStockReservation(reservationId)
    throw error
  }
}

function addressFromPayPal(address = {}) {
  return {
    line1: address.address_line_1 || '',
    line2: address.address_line_2 || '',
    city: address.admin_area_2 || '',
    region: address.admin_area_1 || '',
    postalCode: address.postal_code || '',
    countryCode: address.country_code || '',
  }
}

function paidSelection(product, custom = {}) {
  return {
    quantity: Math.max(1, Number(custom.q || 1)),
    variant: { size: custom.s || '', colour: custom.c || '' },
    madeToOrder: product.fulfilmentOptions?.madeToOrder === true,
    leadTimeMessage: String(product.fulfilmentOptions?.leadTimeMessage || '').trim(),
  }
}

function lockedPayPalName(unit, quantity, fallback) {
  const itemName = String(unit?.items?.[0]?.name || unit?.description || fallback || '').trim()
  const suffix = ` × ${quantity}`
  return itemName.endsWith(suffix) ? itemName.slice(0, -suffix.length) : itemName
}

async function findCapturedPayPalOrder(orderId) {
  const orders = await readJson(paths.orders(), [])
  return orders.find(order => order.provider === 'paypal' && order.providerOrderId === orderId) || null
}

export async function capturePayPalOrder(orderId) {
  const providerOrderId = String(orderId || '').trim()
  if (!providerOrderId) throw new Error('PayPal order identity is missing')

  const persistedOrder = await findCapturedPayPalOrder(providerOrderId)
  if (persistedOrder) return { order: persistedOrder, created: false, completed: true, replayed: true }

  const safeOrderId = encodeURIComponent(providerOrderId)
  const existing = await paypalRequest(`/v2/checkout/orders/${safeOrderId}`)
  const existingUnit = existing.purchase_units?.[0]
  const custom = JSON.parse(existingUnit?.custom_id || '{}')
  const reservationId = custom.r || ''
  const reservation = reservationId ? await getActiveStockReservation(reservationId) : null

  if (existing.status !== 'COMPLETED' && reservationId && !reservation) {
    throw new Error('This PayPal checkout expired before payment was captured. No payment was taken.')
  }

  const capture = existing.status === 'COMPLETED'
    ? existing
    : await paypalRequest(`/v2/checkout/orders/${safeOrderId}/capture`, {
        method: 'POST',
        headers: { 'PayPal-Request-Id': `capture-${providerOrderId}` },
      })

  if (capture.status !== 'COMPLETED') return { capture, completed: false }
  const unit = capture.purchase_units?.[0]
  const capturedCustom = JSON.parse(unit?.custom_id || '{}')
  const websiteId = safeName(capturedCustom.w)
  const { content, merch } = await getStore(websiteId)
  const settings = await checkoutSettings(websiteId, content)
  const product = getProduct(merch, capturedCustom.p, true)
  const selection = reservation
    ? paidSelection(product, capturedCustom)
    : resolveProductSelection(product, capturedCustom.q, {
        size: capturedCustom.s,
        colour: capturedCustom.c,
      })
  const payment = unit?.payments?.captures?.[0]
  const payer = capture.payer || {}
  const shippingAddress = unit?.shipping || {}
  const amount = payment?.amount || unit?.amount || {}
  const productGrossOrNet = Number(unit?.amount?.breakdown?.item_total?.value || 0)
  const shippingGrossOrNet = Number(unit?.amount?.breakdown?.shipping?.value || 0)
  const tax = calculateTax(settings, productGrossOrNet, shippingGrossOrNet)
  const discountCode = capturedCustom.d || ''
  const discountAmount = Number(capturedCustom.a || 0)
  const lockedName = lockedPayPalName(unit, selection.quantity, product.name)
  const lockedUnitPrice = Number(capturedCustom.u || product.priceGBP)

  const { order, created } = await createPaidOrder({
    websiteId,
    clientName: content.brand?.name || websiteId,
    provider: 'paypal',
    providerOrderId: capture.id,
    providerTransactionId: payment?.id || '',
    paymentMethod: 'PayPal',
    currency: amount.currency_code || 'GBP',
    subtotal: tax.productNet,
    shipping: tax.shippingNet,
    tax: tax.amount,
    taxLabel: tax.label,
    taxRate: tax.rate,
    taxIncluded: tax.included,
    taxNumber: tax.number,
    discount: discountAmount,
    discountCode,
    total: Number(amount.value || 0),
    customer: {
      name: `${payer.name?.given_name || ''} ${payer.name?.surname || ''}`.trim() || shippingAddress.name?.full_name || 'Customer',
      email: payer.email_address || '',
      phone: payer.phone?.phone_number?.national_number || '',
    },
    shippingAddress: addressFromPayPal(shippingAddress.address),
    shippingMethod: product.fulfilment === 'digital'
      ? 'Digital delivery'
      : selection.madeToOrder
        ? `Made to order · ${capturedCustom.l || 'UK delivery'}`
        : capturedCustom.l || 'UK delivery',
    items: [{
      productId: product.id,
      name: lockedName,
      image: product.image?.url || '',
      quantity: selection.quantity,
      unitPrice: lockedUnitPrice,
      fulfilment: product.fulfilment,
      madeToOrder: selection.madeToOrder,
      leadTimeMessage: selection.leadTimeMessage,
      variant: selection.variant,
    }],
    paidAt: payment?.create_time || capture.create_time || new Date().toISOString(),
  })

  if (created) {
    if (reservation) await consumeStockReservation(reservationId)
    else await decrementProductStock(websiteId, product.id, selection.quantity, selection.variant)
    await recordDiscountUse(websiteId, discountCode)
    await sendOrderNotifications(order, settings)
  }
  return { order, created, completed: true }
}

export async function verifyPayPalWebhook(headers, body) {
  const data = await paypalRequest('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: requiredEnv('PAYPAL_WEBHOOK_ID'),
      webhook_event: body,
    }),
  })
  return data.verification_status === 'SUCCESS'
}

export function createPayPalRouter() {
  const router = express.Router()

  router.get('/start', async (req, res) => {
    try {
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

  router.post('/orders', async (req, res) => {
    try {
      res.json(await createPayPalOrder(req.body || {}))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  router.post('/orders/:id/capture', async (req, res) => {
    try {
      res.json(await capturePayPalOrder(req.params.id))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  router.post('/webhook', async (req, res) => {
    try {
      const verified = await verifyPayPalWebhook(req.headers, req.body)
      if (!verified) return res.status(400).json({ error: 'PayPal webhook verification failed' })
      if (!req.body?.id || !req.body?.event_type) throw new Error('PayPal webhook event identity is missing')
      if (req.body.event_type === 'CHECKOUT.ORDER.APPROVED') {
        const orderId = req.body.resource?.id
        if (!orderId) throw new Error('PayPal order identity is missing')
        const result = await capturePayPalOrder(orderId)
        if (result.replayed) return res.json({ received: true, replayed: true })
      }
      res.json({ received: true })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
