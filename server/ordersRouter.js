import crypto from 'node:crypto'
import express from 'express'
import { getCommerceSettings } from './commerceSettingsRouter.js'
import { sendDispatchNotification } from './orderNotificationService.js'
import { getOrder, listOrders, purgeTestOrders, updateOrderStatus } from './orderService.js'

const TRACKING_URLS = {
  'Royal Mail': number => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(number)}`,
  Evri: number => `https://www.evri.com/track/parcel/${encodeURIComponent(number)}`,
  DPD: number => `https://track.dpd.co.uk/parcels/${encodeURIComponent(number)}`,
  DHL: number => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(number)}`,
  UPS: number => `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`,
  FedEx: number => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`,
}

const publicInvoiceTokens = new Map()
const lookupAttempts = new Map()
const LOOKUP_WINDOW_MS = 10 * 60 * 1000
const LOOKUP_LIMIT = 10
const INVOICE_TOKEN_MS = 15 * 60 * 1000
const INVOICE_TOKEN_USE_LIMIT = 5

function canAccessOrder(session, order) {
  if (!session || !order) return false
  if (session.role === 'owner') return true
  return (session.websiteIds || []).includes(order.websiteId)
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function money(value, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency || 'GBP',
  }).format(Number(value || 0))
}

function addressHtml(address = {}) {
  const lines = [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.country || address.countryCode,
  ].filter(Boolean)
  return lines.length ? lines.map(line => escapeHtml(line)).join('<br>') : 'Not supplied'
}

function invoiceHtml(order, settings = {}) {
  const items = (order.items || [])
    .map(item => {
      const variant = [item.variant?.size, item.variant?.colour].filter(Boolean).join(' / ')
      const details = [item.orderTag || item.sku, variant, item.madeToOrder ? 'Made to order' : '']
        .filter(Boolean)
        .join(' · ')
      return `<tr>
        <td><strong>${escapeHtml(item.name)}</strong>${details ? `<small>${escapeHtml(details)}</small>` : ''}</td>
        <td class="number">${Number(item.quantity || 0)}</td>
        <td class="number">${escapeHtml(money(item.unitPrice, order.currency))}</td>
        <td class="number">${escapeHtml(money(item.total, order.currency))}</td>
      </tr>`
    })
    .join('')

  const issued = new Date(order.paidAt || order.createdAt || Date.now())
  const supportEmail = settings.supportEmail || settings.replyTo || ''
  const testLabel = order.isTestOrder ? '<span class="test">TEST INVOICE</span>' : ''
  const taxLabel = order.taxIncluded ? 'Tax / VAT (included)' : 'Tax / VAT'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invoice ${escapeHtml(order.orderNumber)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #111827; }
    body { margin: 0; background: #f3f4f6; }
    .toolbar { max-width: 900px; margin: 20px auto 0; display: flex; justify-content: flex-end; gap: 10px; }
    button { border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; background: #111827; color: white; }
    .invoice { max-width: 820px; margin: 20px auto; background: white; padding: 42px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
    header { display: flex; justify-content: space-between; gap: 30px; border-bottom: 2px solid #111827; padding-bottom: 22px; }
    h1 { margin: 0 0 5px; font-size: 34px; }
    h2 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 4px 0; line-height: 1.45; }
    .muted, small { color: #6b7280; }
    .test { display: inline-block; margin-top: 8px; padding: 5px 9px; background: #fef3c7; border-radius: 5px; font-weight: 700; }
    .addresses { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 34px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #f3f4f6; padding: 12px; font-size: 13px; }
    td { border-bottom: 1px solid #e5e7eb; padding: 14px 12px; vertical-align: top; }
    td small { display: block; margin-top: 5px; }
    .number { text-align: right; white-space: nowrap; }
    .totals { width: min(360px, 100%); margin: 26px 0 0 auto; }
    .totals div { display: flex; justify-content: space-between; padding: 7px 0; }
    .totals .grand { border-top: 2px solid #111827; margin-top: 8px; padding-top: 13px; font-size: 19px; font-weight: 700; }
    footer { margin-top: 38px; border-top: 1px solid #e5e7eb; padding-top: 20px; font-size: 13px; color: #6b7280; }
    @media print { body { background: white; } .toolbar { display: none; } .invoice { margin: 0; max-width: none; box-shadow: none; padding: 20px; } }
    @media (max-width: 650px) { .invoice { margin: 0; padding: 24px; } header, .addresses { display: block; } header > div + div, .addresses > div + div { margin-top: 22px; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
  <main class="invoice">
    <header>
      <div>
        <h1>INVOICE</h1>
        <p><strong>${escapeHtml(order.clientName || order.websiteId)}</strong></p>
        ${supportEmail ? `<p class="muted">${escapeHtml(supportEmail)}</p>` : ''}
        ${testLabel}
      </div>
      <div>
        <p><strong>Invoice:</strong> ${escapeHtml(order.orderNumber)}</p>
        <p><strong>Issued:</strong> ${escapeHtml(issued.toLocaleDateString('en-GB'))}</p>
        <p><strong>Payment:</strong> ${escapeHtml(order.paymentStatus || 'Paid')}</p>
        <p><strong>Method:</strong> ${escapeHtml(order.paymentMethod || order.provider)}</p>
      </div>
    </header>

    <section class="addresses">
      <div>
        <h2>Bill To</h2>
        <p><strong>${escapeHtml(order.customer?.name || 'Customer')}</strong></p>
        <p>${escapeHtml(order.customer?.email || '')}</p>
        <p>${addressHtml(order.billingAddress || order.shippingAddress)}</p>
      </div>
      <div>
        <h2>Deliver To</h2>
        <p><strong>${escapeHtml(order.customer?.name || 'Customer')}</strong></p>
        <p>${addressHtml(order.shippingAddress)}</p>
        <p class="muted">${escapeHtml(order.shippingMethod || '')}</p>
      </div>
    </section>

    <table>
      <thead><tr><th>Item</th><th class="number">Qty</th><th class="number">Unit</th><th class="number">Total</th></tr></thead>
      <tbody>${items}</tbody>
    </table>

    <section class="totals">
      <div><span>Subtotal</span><strong>${escapeHtml(money(order.subtotal, order.currency))}</strong></div>
      <div><span>Shipping</span><strong>${escapeHtml(money(order.shipping, order.currency))}</strong></div>
      <div><span>${taxLabel}</span><strong>${escapeHtml(money(order.tax, order.currency))}</strong></div>
      <div><span>Discount</span><strong>-${escapeHtml(money(order.discount, order.currency))}</strong></div>
      <div class="grand"><span>Total</span><span>${escapeHtml(money(order.total, order.currency))}</span></div>
    </section>

    <footer>
      <p>Payment reference: ${escapeHtml(order.providerTransactionId || order.providerOrderId || 'Not supplied')}</p>
      <p>This invoice was generated from the verified KSJ Digital order record.</p>
    </footer>
  </main>
</body>
</html>`
}

function trackingDetails(input = {}, status = '') {
  const courier = String(input.courier || '').trim()
  const number = String(input.number || '').trim()
  const customUrl = String(input.url || '').trim()

  if (status === 'Dispatched' && (!courier || !number)) {
    throw new Error('Courier and tracking number are required before dispatch')
  }

  let url = customUrl
  if (!url && courier && number && TRACKING_URLS[courier]) url = TRACKING_URLS[courier](number)
  if (url) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') throw new Error('Tracking URL must use HTTPS')
  }

  return {
    courier,
    number,
    url,
    dispatchedAt:
      input.dispatchedAt || (status === 'Dispatched' ? new Date().toISOString() : ''),
  }
}

function setPrivateResponseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

function cleanupPublicSecurityState(now = Date.now()) {
  for (const [key, attempts] of lookupAttempts) {
    const active = attempts.filter(time => now - time < LOOKUP_WINDOW_MS)
    if (active.length) lookupAttempts.set(key, active)
    else lookupAttempts.delete(key)
  }

  for (const [token, record] of publicInvoiceTokens) {
    if (record.expiresAt < now || record.uses >= INVOICE_TOKEN_USE_LIMIT) {
      publicInvoiceTokens.delete(token)
    }
  }
}

function allowPublicLookup(req) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown'
  const now = Date.now()
  cleanupPublicSecurityState(now)
  const attempts = lookupAttempts.get(key) || []
  if (attempts.length >= LOOKUP_LIMIT) return false
  attempts.push(now)
  lookupAttempts.set(key, attempts)
  return true
}

function safePublicOrder(order, invoiceToken) {
  return {
    orderNumber: order.orderNumber,
    websiteId: order.websiteId,
    clientName: order.clientName,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    currency: order.currency,
    total: order.total,
    shippingMethod: order.shippingMethod,
    items: (order.items || []).map(item => ({
      name: item.name,
      quantity: item.quantity,
      variant: item.variant,
      madeToOrder: item.madeToOrder === true,
      leadTimeMessage: item.leadTimeMessage || '',
    })),
    tracking: order.tracking
      ? {
          courier: order.tracking.courier || '',
          number: order.tracking.number || '',
          url: order.tracking.url || '',
          dispatchedAt: order.tracking.dispatchedAt || '',
        }
      : null,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    updatedAt: order.updatedAt,
    invoiceUrl: `/api/public/orders/invoice/${invoiceToken}`,
  }
}

export function createPublicOrdersRouter() {
  const router = express.Router()

  router.use((req, res, next) => {
    setPrivateResponseHeaders(res)
    next()
  })

  router.post('/lookup', async (req, res) => {
    if (!allowPublicLookup(req)) {
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
    }

    const websiteId = String(req.body?.websiteId || '').trim().toLowerCase()
    const orderNumber = String(req.body?.orderNumber || '').trim().toUpperCase()
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!websiteId || !orderNumber || !email) {
      return res.status(400).json({ error: 'Order number and email are required.' })
    }
    if (websiteId.length > 100 || orderNumber.length > 100 || email.length > 254) {
      return res.status(400).json({ error: 'Order details could not be verified.' })
    }

    const order = await getOrder(orderNumber)
    const matches =
      order &&
      order.websiteId === websiteId &&
      String(order.customer?.email || '').trim().toLowerCase() === email

    if (!matches) {
      return res.status(404).json({ error: 'Order details could not be verified.' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    publicInvoiceTokens.set(token, {
      orderId: order.id,
      expiresAt: Date.now() + INVOICE_TOKEN_MS,
      uses: 0,
    })
    res.json(safePublicOrder(order, token))
  })

  router.get('/invoice/:token', async (req, res) => {
    cleanupPublicSecurityState()
    const token = String(req.params.token || '')
    const record = publicInvoiceTokens.get(token)
    if (!record || record.expiresAt < Date.now() || record.uses >= INVOICE_TOKEN_USE_LIMIT) {
      publicInvoiceTokens.delete(token)
      return res.status(404).send('Invoice link has expired. Please verify the order again.')
    }

    record.uses += 1
    publicInvoiceTokens.set(token, record)
    const order = await getOrder(record.orderId)
    if (!order) {
      publicInvoiceTokens.delete(token)
      return res.status(404).send('Invoice not found')
    }

    const settings = await getCommerceSettings(order.websiteId)
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    )
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `inline; filename="invoice-${order.orderNumber}.html"`)
    res.send(invoiceHtml(order, settings))
  })

  return router
}

export function createOrdersRouter() {
  const router = express.Router()

  router.get('/', async (req, res) => {
    const websiteIds = req.session?.role === 'owner' ? null : req.session?.websiteIds || []
    res.json(await listOrders(websiteIds))
  })

  router.delete('/test-data', async (req, res) => {
    if (req.session?.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' })
    }
    res.json(await purgeTestOrders(req.body?.websiteId || ''))
  })

  router.get('/:id/invoice', async (req, res) => {
    const order = await getOrder(req.params.id)
    if (!order) return res.status(404).send('Order not found')
    if (!canAccessOrder(req.session, order)) return res.status(403).send('Order access denied')

    const settings = await getCommerceSettings(order.websiteId)
    setPrivateResponseHeaders(res)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `inline; filename="invoice-${order.orderNumber}.html"`)
    res.send(invoiceHtml(order, settings))
  })

  router.get('/:id', async (req, res) => {
    const order = await getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (!canAccessOrder(req.session, order)) return res.status(403).json({ error: 'Order access denied' })
    res.json(order)
  })

  router.patch('/:id/status', async (req, res) => {
    const order = await getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (!canAccessOrder(req.session, order)) return res.status(403).json({ error: 'Order access denied' })
    if (req.session.role !== 'owner' && !req.session.canEdit) {
      return res.status(403).json({ error: 'Edit permission required' })
    }

    try {
      const status = req.body?.status
      const tracking = req.body?.tracking
        ? trackingDetails({ ...(order.tracking || {}), ...req.body.tracking }, status)
        : order.tracking
      let updated = await updateOrderStatus(req.params.id, status, {
        tracking,
        internalNote: req.body?.internalNote,
      })

      const shouldNotify =
        status === 'Dispatched' &&
        (order.fulfilmentStatus !== 'Dispatched' || req.body?.sendDispatchEmail === true)

      if (shouldNotify) {
        const settings = await getCommerceSettings(order.websiteId)
        await sendDispatchNotification(updated, {
          ...settings,
          brandName: order.clientName || order.websiteId,
        })
        updated = await getOrder(order.id)
      }

      res.json(updated)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
