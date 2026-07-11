import express from 'express'
import { calculateShipping, calculateTax, getCommerceSettings } from './commerceSettingsRouter.js'
import { decrementProductStock, resolveProductSelection } from './merchValidation.js'
import { createPaidOrder } from './orderService.js'
import { sendOrderNotifications } from './orderNotificationService.js'
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
    paypalReturnUrl: commerce.paypalReturnUrl || process.env.PAYPAL_RETURN_URL,
    cancelUrl: commerce.cancelUrl || process.env.PAYPAL_CANCEL_URL,
    supportEmail: commerce.supportEmail || content.contact?.supportEmail || '',
    replyTo: commerce.replyTo || commerce.supportEmail || content.contact?.supportEmail || '',
    brandName: content.brand?.name || websiteId,
    manageUrl: process.env.ORDER_MANAGE_URL || 'https://ksjdigital.co.uk/owner/orders',
  }
}

export async function createPayPalOrder({ websiteId, productId, quantity = 1, variant = {} }) {
  const safeWebsiteId = safeName(websiteId)
  const { content, merch } = await getStore(safeWebsiteId)
  const product = getProduct(merch, productId)
  const selection = resolveProductSelection(product, quantity, variant)
  const settings = await checkoutSettings(safeWebsiteId, content)
  if (!settings.paypalEnabled) throw new Error('PayPal checkout is disabled for this website')
  if (!settings.paypalReturnUrl || !settings.cancelUrl) {
    throw new Error('PayPal return and cancel URLs are not configured')
  }

  const productSubtotal = Number(product.priceGBP) * selection.quantity
  const shipping = calculateShipping(settings, product, selection.quantity)
  const tax = calculateTax(settings, productSubtotal, shipping.amount)
  const breakdown = {
    item_total: { currency_code: 'GBP', value: productSubtotal.toFixed(2) },
    shipping: { currency_code: 'GBP', value: shipping.amount.toFixed(2) },
  }
  if (tax.enabled && !tax.included && tax.amount > 0) {
    breakdown.tax_total = { currency_code: 'GBP', value: tax.amount.toFixed(2) }
  }

  const order = await paypalRequest('/v2/checkout/orders', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': crypto.randomUUID() },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: safeWebsiteId,
          custom_id: JSON.stringify({
            w: safeWebsiteId,
            p: product.id,
            q: selection.quantity,
            s: selection.variant.size,
            c: selection.variant.colour,
            l: shipping.label,
          }),
          description: product.name,
          amount: {
            currency_code: 'GBP',
            value: tax.total.toFixed(2),
            breakdown,
          },
          items: [
            {
              name: product.name,
              description: product.description,
              quantity: String(selection.quantity),
              category: product.fulfilment === 'digital' ? 'DIGITAL_GOODS' : 'PHYSICAL_GOODS',
              unit_amount: {
                currency_code: 'GBP',
                value: Number(product.priceGBP).toFixed(2),
              },
            },
          ],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: process.env.PAYPAL_BRAND_NAME || settings.brandName || 'TwoToneTaj Merch',
            shipping_preference: product.fulfilment === 'digital' ? 'NO_SHIPPING' : 'GET_FROM_FILE',
            user_action: 'PAY_NOW',
            return_url: settings.paypalReturnUrl,
            cancel_url: settings.cancelUrl,
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

export async function capturePayPalOrder(orderId) {
  const capture = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { 'PayPal-Request-Id': crypto.randomUUID() },
  })

  if (capture.status !== 'COMPLETED') return { capture, completed: false }
  const unit = capture.purchase_units?.[0]
  const custom = JSON.parse(unit?.custom_id || '{}')
  const websiteId = safeName(custom.w)
  const { content, merch } = await getStore(websiteId)
  const settings = await checkoutSettings(websiteId, content)
  const product = getProduct(merch, custom.p)
  const selection = resolveProductSelection(product, custom.q, {
    size: custom.s,
    colour: custom.c,
  })
  const payment = unit?.payments?.captures?.[0]
  const payer = capture.payer || {}
  const shippingAddress = unit?.shipping || {}
  const amount = payment?.amount || unit?.amount || {}
  const productGrossOrNet = Number(unit?.amount?.breakdown?.item_total?.value || 0)
  const shippingGrossOrNet = Number(unit?.amount?.breakdown?.shipping?.value || 0)
  const tax = calculateTax(settings, productGrossOrNet, shippingGrossOrNet)

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
    discount: 0,
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
        ? `Made to order · ${custom.l || 'UK delivery'}`
        : custom.l || 'UK delivery',
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
    paidAt: payment?.create_time || capture.create_time || new Date().toISOString(),
  })

  if (created) {
    await decrementProductStock(websiteId, product.id, selection.quantity, selection.variant)
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

      if (req.body?.event_type === 'CHECKOUT.ORDER.APPROVED') {
        await capturePayPalOrder(req.body.resource?.id)
      }

      res.json({ received: true })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
