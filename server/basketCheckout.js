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
import { paths, readJson, safeName, writeJson } from './storage.js'

const STRIPE_API = 'https://api.stripe.com/v1'

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function clean(value = '') {
  return typeof value === 'string' ? value.trim() : value
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function paypalApiBase() {
  return process.env.PAYPAL_ENVIRONMENT === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

async function paypalAccessToken() {
  const credentials = Buffer.from(
    `${requiredEnv('PAYPAL_CLIENT_ID')}:${requiredEnv('PAYPAL_CLIENT_SECRET')}`,
  ).toString('base64')
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
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
  const token = await paypalAccessToken()
  const response = await fetch(`${paypalApiBase()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.details?.[0]?.description || data?.message || `PayPal request failed: ${response.status}`)
  return data
}

async function stripeRequest(path, entries = []) {
  const body = new URLSearchParams()
  entries.forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') body.append(key, String(value))
  })
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEnv('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || `Stripe request failed: ${response.status}`)
  return data
}

async function retrieveStripeSession(sessionId) {
  const response = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
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

function paypalAddress(address = {}) {
  return {
    line1: address.address_line_1 || '',
    line2: address.address_line_2 || '',
    city: address.admin_area_2 || '',
    region: address.admin_area_1 || '',
    postalCode: address.postal_code || '',
    countryCode: address.country_code || '',
  }
}

async function storeData(websiteId) {
  const safeWebsiteId = safeName(websiteId)
  const content = await readJson(paths.content(safeWebsiteId), {})
  const products = Array.isArray(content.merch?.products) ? content.merch.products : []
  if (!products.length) throw new Error('Merch catalogue is unavailable')
  const settings = await getCommerceSettings(safeWebsiteId)
  return { safeWebsiteId, content, products, settings }
}

function productById(products, productId) {
  const product = products.find(item => item.id === productId)
  if (!product) throw new Error('A basket product was not found')
  if (product.availability !== 'available') throw new Error(`${product.name || 'A product'} is unavailable`)
  if (Number(product.priceGBP) <= 0) throw new Error(`${product.name || 'A product'} has an invalid price`)
  return product
}

function validateBasketItems(products, input = []) {
  if (!Array.isArray(input) || !input.length) throw new Error('Basket is empty')
  if (input.length > 25) throw new Error('Basket contains too many lines')
  return input.map(raw => {
    const product = productById(products, clean(raw.productId))
    const selection = resolveProductSelection(product, raw.quantity, raw.variant || {})
    return {
      productId: product.id,
      name: product.name,
      image: product.image?.url || '',
      quantity: selection.quantity,
      unitPrice: Number(product.priceGBP),
      fulfilment: product.fulfilment === 'digital' ? 'digital' : 'physical',
      madeToOrder: selection.madeToOrder,
      leadTimeMessage: selection.leadTimeMessage,
      variant: selection.variant,
    }
  })
}

function basketTotals(settings, items, discountCode) {
  const originalSubtotal = roundMoney(items.reduce((total, item) => total + item.unitPrice * item.quantity, 0))
  const discount = resolveDiscount(settings, discountCode, originalSubtotal)
  const discountedSubtotal = roundMoney(Math.max(0, originalSubtotal - discount.amount))
  const hasPhysical = items.some(item => item.fulfilment !== 'digital')
  const shippingProduct = {
    fulfilment: hasPhysical ? 'physical' : 'digital',
    priceGBP: discountedSubtotal,
  }
  const shipping = calculateShipping(settings, shippingProduct, 1)
  const tax = calculateTax(settings, discountedSubtotal, shipping.amount)
  return { originalSubtotal, discountedSubtotal, discount, shipping, tax }
}

async function saveBasket(record) {
  const baskets = await readJson(paths.checkoutBaskets(), [])
  await writeJson(paths.checkoutBaskets(), [record, ...baskets.filter(item => item.id !== record.id)].slice(0, 500))
  return record
}

async function getBasket(id) {
  const baskets = await readJson(paths.checkoutBaskets(), [])
  const basket = baskets.find(item => item.id === id)
  if (!basket) throw new Error('Checkout basket was not found')
  return basket
}

async function markBasketCompleted(id, orderId) {
  const baskets = await readJson(paths.checkoutBaskets(), [])
  await writeJson(paths.checkoutBaskets(), baskets.map(item => item.id === id
    ? { ...item, status: 'completed', orderId, completedAt: new Date().toISOString() }
    : item))
}

async function checkoutSettings(websiteId, content, settings) {
  return {
    ...settings,
    successUrl: settings.successUrl || process.env.STRIPE_SUCCESS_URL,
    cancelUrl: settings.cancelUrl || process.env.STRIPE_CANCEL_URL || process.env.PAYPAL_CANCEL_URL,
    paypalReturnUrl: settings.paypalReturnUrl || process.env.PAYPAL_RETURN_URL,
    supportEmail: settings.supportEmail || content.contact?.supportEmail || '',
    businessEmail: content.contact?.businessEmail || '',
    replyTo: settings.replyTo || settings.supportEmail || content.contact?.supportEmail || '',
    brandName: content.brand?.name || websiteId,
    manageUrl: process.env.ORDER_MANAGE_URL || 'https://ksjdigital.co.uk/owner/orders',
  }
}

async function createBasketRecord({ websiteId, items, discountCode = '', provider }) {
  const { safeWebsiteId, content, products, settings } = await storeData(websiteId)
  const safeSettings = await checkoutSettings(safeWebsiteId, content, settings)
  if (provider === 'stripe' && !safeSettings.stripeEnabled) throw new Error('Stripe checkout is disabled for this website')
  if (provider === 'paypal' && !safeSettings.paypalEnabled) throw new Error('PayPal checkout is disabled for this website')
  const lockedItems = validateBasketItems(products, items)
  const totals = basketTotals(safeSettings, lockedItems, discountCode)
  const id = crypto.randomUUID()
  const record = {
    id,
    websiteId: safeWebsiteId,
    provider,
    status: 'pending',
    items: lockedItems,
    totals,
    settings: {
      brandName: safeSettings.brandName,
      supportEmail: safeSettings.supportEmail,
      businessEmail: safeSettings.businessEmail,
      replyTo: safeSettings.replyTo,
      orderEmail: safeSettings.orderEmail,
      discordWebhookUrl: safeSettings.discordWebhookUrl,
      deliveryMessage: safeSettings.deliveryMessage,
      returnsMessage: safeSettings.returnsMessage,
      manageUrl: safeSettings.manageUrl,
    },
    createdAt: new Date().toISOString(),
  }
  await saveBasket(record)
  return { record, settings: safeSettings }
}

export async function createBasketStripeSession(payload = {}) {
  const { record, settings } = await createBasketRecord({ ...payload, provider: 'stripe' })
  if (!settings.successUrl || !settings.cancelUrl) throw new Error('Stripe success and cancel URLs are not configured')
  const totalQuantity = record.items.reduce((sum, item) => sum + item.quantity, 0)
  const entries = [
    ['mode', 'payment'],
    ['success_url', `${settings.successUrl}${settings.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}&basket=1`],
    ['cancel_url', settings.cancelUrl],
    ['customer_creation', 'always'],
    ['billing_address_collection', 'auto'],
    ['line_items[0][quantity]', 1],
    ['line_items[0][price_data][currency]', 'gbp'],
    ['line_items[0][price_data][unit_amount]', Math.round(record.totals.discountedSubtotal * 100)],
    ['line_items[0][price_data][product_data][name]', `${settings.brandName || 'Store'} basket · ${totalQuantity} item${totalQuantity === 1 ? '' : 's'}`],
    ['line_items[0][price_data][product_data][description]', record.items.map(item => `${item.quantity}× ${item.name}`).join(', ').slice(0, 500)],
    ['metadata[basketId]', record.id],
    ['metadata[websiteId]', record.websiteId],
  ]
  if (record.totals.tax.enabled && !record.totals.tax.included && record.totals.tax.amount > 0) {
    entries.push(['line_items[1][quantity]', 1])
    entries.push(['line_items[1][price_data][currency]', 'gbp'])
    entries.push(['line_items[1][price_data][unit_amount]', Math.round(record.totals.tax.amount * 100)])
    entries.push(['line_items[1][price_data][product_data][name]', `${record.totals.tax.label} (${record.totals.tax.rate}%)`])
  }
  if (record.items.some(item => item.fulfilment !== 'digital')) {
    entries.push(['shipping_address_collection[allowed_countries][0]', 'GB'])
    entries.push(['shipping_options[0][shipping_rate_data][type]', 'fixed_amount'])
    entries.push(['shipping_options[0][shipping_rate_data][display_name]', record.totals.shipping.label])
    entries.push(['shipping_options[0][shipping_rate_data][fixed_amount][amount]', Math.round(record.totals.shipping.amount * 100)])
    entries.push(['shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'gbp'])
  }
  const session = await stripeRequest('/checkout/sessions', entries)
  await saveBasket({ ...record, providerOrderId: session.id })
  return { id: session.id, url: session.url }
}

export async function createBasketPayPalOrder(payload = {}) {
  const { record, settings } = await createBasketRecord({ ...payload, provider: 'paypal' })
  if (!settings.paypalReturnUrl || !settings.cancelUrl) throw new Error('PayPal return and cancel URLs are not configured')
  const totalQuantity = record.items.reduce((sum, item) => sum + item.quantity, 0)
  const order = await paypalRequest('/v2/checkout/orders', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': record.id },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: record.websiteId,
        custom_id: record.id,
        description: `${settings.brandName || 'Store'} basket · ${totalQuantity} items`,
        amount: {
          currency_code: 'GBP',
          value: record.totals.tax.total.toFixed(2),
          breakdown: {
            item_total: { currency_code: 'GBP', value: record.totals.discountedSubtotal.toFixed(2) },
            shipping: { currency_code: 'GBP', value: record.totals.shipping.amount.toFixed(2) },
            ...(record.totals.tax.enabled && !record.totals.tax.included && record.totals.tax.amount > 0
              ? { tax_total: { currency_code: 'GBP', value: record.totals.tax.amount.toFixed(2) } }
              : {}),
          },
        },
        items: [{
          name: `${settings.brandName || 'Store'} basket`,
          description: record.items.map(item => `${item.quantity}× ${item.name}`).join(', ').slice(0, 120),
          quantity: '1',
          category: record.items.some(item => item.fulfilment !== 'digital') ? 'PHYSICAL_GOODS' : 'DIGITAL_GOODS',
          unit_amount: { currency_code: 'GBP', value: record.totals.discountedSubtotal.toFixed(2) },
        }],
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: process.env.PAYPAL_BRAND_NAME || settings.brandName || 'Store',
            shipping_preference: record.items.some(item => item.fulfilment !== 'digital') ? 'GET_FROM_FILE' : 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: `${settings.paypalReturnUrl}${settings.paypalReturnUrl.includes('?') ? '&' : '?'}basket=1`,
            cancel_url: settings.cancelUrl,
          },
        },
      },
    }),
  })
  await saveBasket({ ...record, providerOrderId: order.id })
  return {
    id: order.id,
    approvalUrl: order.links?.find(link => link.rel === 'payer-action' || link.rel === 'approve')?.href || '',
  }
}

async function finaliseBasket(record, payment) {
  const existingOrderId = record.orderId
  if (record.status === 'completed' && existingOrderId) {
    const orders = await readJson(paths.orders(), [])
    const existing = orders.find(order => order.id === existingOrderId)
    if (existing) return { order: existing, created: false, completed: true }
  }

  const { order, created } = await createPaidOrder({
    websiteId: record.websiteId,
    clientName: record.settings.brandName || record.websiteId,
    provider: record.provider,
    providerOrderId: payment.providerOrderId,
    providerTransactionId: payment.providerTransactionId,
    paymentMethod: payment.paymentMethod,
    currency: payment.currency || 'GBP',
    subtotal: record.totals.tax.productNet,
    shipping: record.totals.tax.shippingNet,
    tax: record.totals.tax.amount,
    taxLabel: record.totals.tax.label,
    taxRate: record.totals.tax.rate,
    taxIncluded: record.totals.tax.included,
    taxNumber: record.totals.tax.number,
    discount: record.totals.discount.amount,
    discountCode: record.totals.discount.code,
    total: payment.total,
    customer: payment.customer,
    billingAddress: payment.billingAddress || null,
    shippingAddress: payment.shippingAddress || null,
    shippingMethod: record.items.some(item => item.madeToOrder)
      ? `Made to order · ${record.totals.shipping.label}`
      : record.totals.shipping.label,
    items: record.items,
    paidAt: payment.paidAt,
  })

  if (created) {
    for (const item of record.items) {
      if (!item.madeToOrder) {
        await decrementProductStock(record.websiteId, item.productId, item.quantity, item.variant)
      }
    }
    await recordDiscountUse(record.websiteId, record.totals.discount.code)
    await sendOrderNotifications(order, record.settings)
  }
  await markBasketCompleted(record.id, order.id)
  return { order, created, completed: true }
}

export async function completeBasketStripeSession(sessionId) {
  const session = await retrieveStripeSession(sessionId)
  if (session.payment_status !== 'paid') throw new Error('Stripe payment is not complete')
  const basketId = session.metadata?.basketId
  if (!basketId) throw new Error('Stripe basket reference is missing')
  const record = await getBasket(basketId)
  const customer = session.customer_details || {}
  const shipping = session.shipping_details || session.collected_information?.shipping_details || {}
  return finaliseBasket(record, {
    providerOrderId: session.id,
    providerTransactionId: session.payment_intent || '',
    paymentMethod: 'Card / Stripe',
    currency: String(session.currency || 'gbp').toUpperCase(),
    total: Number(session.amount_total || 0) / 100,
    customer: {
      name: customer.name || shipping.name || 'Customer',
      email: customer.email || session.customer_email || '',
      phone: customer.phone || '',
    },
    billingAddress: stripeAddress(customer.address),
    shippingAddress: stripeAddress(shipping.address),
    paidAt: new Date().toISOString(),
  })
}

export async function captureBasketPayPalOrder(orderId) {
  const current = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`)
  const capture = current.status === 'COMPLETED'
    ? current
    : await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        headers: { 'PayPal-Request-Id': `basket-capture-${orderId}` },
      })
  if (capture.status !== 'COMPLETED') return { completed: false }
  const unit = capture.purchase_units?.[0]
  const record = await getBasket(unit?.custom_id)
  const payment = unit?.payments?.captures?.[0]
  const payer = capture.payer || {}
  const shipping = unit?.shipping || {}
  return finaliseBasket(record, {
    providerOrderId: capture.id,
    providerTransactionId: payment?.id || '',
    paymentMethod: 'PayPal',
    currency: payment?.amount?.currency_code || 'GBP',
    total: Number(payment?.amount?.value || unit?.amount?.value || 0),
    customer: {
      name: `${payer.name?.given_name || ''} ${payer.name?.surname || ''}`.trim() || shipping.name?.full_name || 'Customer',
      email: payer.email_address || '',
      phone: payer.phone?.phone_number?.national_number || '',
    },
    shippingAddress: paypalAddress(shipping.address),
    paidAt: payment?.create_time || capture.create_time || new Date().toISOString(),
  })
}

export function createBasketCheckoutRouter() {
  const router = express.Router()
  router.post('/stripe', async (req, res) => {
    try {
      res.json(await createBasketStripeSession(req.body || {}))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })
  router.post('/stripe/:id/complete', async (req, res) => {
    try {
      res.json(await completeBasketStripeSession(req.params.id))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })
  router.post('/paypal', async (req, res) => {
    try {
      res.json(await createBasketPayPalOrder(req.body || {}))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })
  router.post('/paypal/:id/capture', async (req, res) => {
    try {
      res.json(await captureBasketPayPalOrder(req.params.id))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })
  return router
}
