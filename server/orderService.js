import crypto from 'node:crypto'
import { paths, readJson, safeName, writeJson } from './storage.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

const ORDER_STATUSES = new Set([
  'New',
  'Processing',
  'Awaiting Stock',
  'Dispatched',
  'Delivered',
  'Cancelled',
  'Refunded',
])

const ORDER_EVENT_TOPICS = new Map([
  ['order.created', 'order.created'],
  ['order.refunded', 'order.refunded'],
  ['order.status_changed', 'order.status-changed'],
])

let orderCreationQueue = Promise.resolve()

async function serialiseOrderCreation(action) {
  const previous = orderCreationQueue
  let release
  orderCreationQueue = new Promise(resolve => {
    release = resolve
  })

  await previous
  try {
    return await action()
  } finally {
    release()
  }
}

function clean(value = '') {
  return typeof value === 'string' ? value.trim() : value
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function compactCode(value = '', fallback = 'ITEM') {
  const normalised = String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
  return normalised || fallback
}

function productIdTag(productId = '') {
  const tokens = String(productId)
    .split(/[_-]+/)
    .filter(Boolean)
    .filter(token => !['product', 'item', 'merch'].includes(token.toLowerCase()))
    .filter(token => !/^\d+$/.test(token))
  return compactCode(tokens[0] || '', '')
}

export function deriveOrderTag(item = {}) {
  return compactCode(
    item.orderTag || item.customTag || item.sku || item.type || productIdTag(item.productId) || item.category || item.name,
    'ITEM',
  )
}

async function enrichItemsFromCatalogue(websiteId, items = []) {
  const content = await readJson(paths.content(safeName(websiteId)), {})
  const products = Array.isArray(content.merch?.products) ? content.merch.products : []
  return items.map(item => {
    const product = products.find(candidate => candidate.id === item.productId)
    if (!product) return item
    return {
      ...product,
      ...item,
      image: item.image || product.image?.url || '',
      orderTag: item.orderTag || product.orderTag || product.customTag || '',
      sku: item.sku || product.sku || '',
      category: item.category || product.category || '',
      type: item.type || product.type || '',
      madeToOrder: item.madeToOrder ?? product.fulfilmentOptions?.madeToOrder === true,
      leadTimeMessage: item.leadTimeMessage || product.fulfilmentOptions?.leadTimeMessage || '',
    }
  })
}

function normaliseItems(items = []) {
  return items.map(item => {
    const orderTag = deriveOrderTag(item)
    const quantity = Math.max(1, Number(item.quantity || 1))
    const unitPrice = roundMoney(item.unitPrice)
    return {
      productId: clean(item.productId),
      name: clean(item.name),
      image: clean(item.image),
      category: clean(item.category),
      type: clean(item.type),
      orderTag,
      sku: clean(item.sku) || orderTag,
      quantity,
      unitPrice,
      total: roundMoney(quantity * unitPrice),
      variant: { size: clean(item.variant?.size), colour: clean(item.variant?.colour), ...(item.variant || {}) },
      fulfilment: item.fulfilment === 'digital' ? 'digital' : 'physical',
      madeToOrder: item.madeToOrder === true,
      leadTimeMessage: clean(item.leadTimeMessage),
    }
  })
}

function reconcileMoney(input, items) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.total || 0), 0))
  const discount = roundMoney(input.discount)
  const tax = roundMoney(input.tax)
  const total = roundMoney(input.total)
  const taxIncluded = input.taxIncluded === true

  if (![subtotal, discount, tax, total].every(Number.isFinite)) {
    throw new Error('Order money values are invalid')
  }
  if (discount < 0 || discount > subtotal) {
    throw new Error('Order discount exceeds the product subtotal')
  }

  let shipping
  if (taxIncluded) {
    shipping = roundMoney(total - subtotal + discount)
    if (shipping < 0) throw new Error('Captured total is lower than the discounted product value')
  } else {
    shipping = roundMoney(input.shipping)
    const expected = roundMoney(subtotal - discount + shipping + tax)
    if (Math.abs(expected - total) > 0.01) {
      throw new Error(`Captured total does not match the order breakdown (${expected.toFixed(2)} expected, ${total.toFixed(2)} captured)`)
    }
  }

  return { subtotal, shipping, tax, discount, total, taxIncluded }
}

async function websiteCode(websiteId) {
  const websites = await readJson(paths.websites(), [])
  const website = websites.find(site => safeName(site.id) === safeName(websiteId))
  const configured = compactCode(website?.orderPrefix || '', '')
  if (configured) return configured.slice(0, 6)
  const fallback = safeName(websiteId).replace(/[^a-z0-9]/g, '').toUpperCase()
  return (fallback || 'KSJ').slice(0, 3)
}

function orderItemCode(items = []) {
  const tags = [...new Set(items.map(item => item.orderTag || deriveOrderTag(item)))]
  return tags.length === 1 ? tags[0] : 'MIX'
}

async function nextOrderNumber(websiteId, items, environment, createdAt = new Date()) {
  const orders = await readJson(paths.orders(), [])
  const year = createdAt.getUTCFullYear()
  const environmentPrefix = environment === 'test' ? 'TEST-' : ''
  const prefix = `${environmentPrefix}${await websiteCode(websiteId)}-${orderItemCode(items)}-${year}-`
  const highest = orders.reduce((max, order) => {
    if (!order.orderNumber?.startsWith(prefix)) return max
    const sequence = Number(order.orderNumber.slice(prefix.length))
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max
  }, 0)
  return `${prefix}${String(highest + 1).padStart(6, '0')}`
}

function resolveEnvironment(input = {}) {
  if (input.environment === 'test' || input.environment === 'live') return input.environment
  const provider = clean(input.provider).toLowerCase()
  if (provider === 'stripe') return process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'live'
  if (provider === 'paypal') return process.env.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'test'
  return 'live'
}

function validateOrderInput(input = {}) {
  const errors = []
  if (!clean(input.websiteId)) errors.push('Website ID is required')
  if (!clean(input.provider)) errors.push('Payment provider is required')
  if (!clean(input.providerOrderId)) errors.push('Provider order ID is required')
  if (!clean(input.customer?.name)) errors.push('Customer name is required')
  if (!clean(input.customer?.email)) errors.push('Customer email is required')
  if (!Array.isArray(input.items) || !input.items.length) errors.push('At least one order item is required')
  if (!clean(input.currency)) errors.push('Currency is required')
  if (Number(input.total) < 0) errors.push('Order total is invalid')
  return errors
}

function orderEventPayload(order = {}, details = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  return {
    itemCount: items.length,
    unitCount: items.reduce((total, item) => total + Math.max(1, Number(item.quantity || 1)), 0),
    physicalItemCount: items.filter(item => item.fulfilment !== 'digital').length,
    digitalItemCount: items.filter(item => item.fulfilment === 'digital').length,
    madeToOrderItemCount: items.filter(item => item.madeToOrder === true).length,
    isTestOrder: order.isTestOrder === true,
    paymentStatus: String(order.paymentStatus || '').toLowerCase(),
    fulfilmentStatus: String(order.fulfilmentStatus || '').toLowerCase(),
    hasTracking: Boolean(order.tracking?.number),
    fullyRefunded: order.refund?.fullyRefunded === true,
    stockRestored: order.refund?.stockRestored === true,
    ...details,
  }
}

async function publishOrderEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export async function findOrderByProviderReference(provider, providerOrderId) {
  const orders = await readJson(paths.orders(), [])
  return orders.find(order => order.provider === provider && order.providerOrderId === providerOrderId)
}

export async function createPaidOrder(input = {}) {
  const errors = validateOrderInput(input)
  if (errors.length) {
    const error = new Error(errors.join('; '))
    error.code = 'INVALID_ORDER'
    throw error
  }

  return serialiseOrderCreation(async () => {
    const provider = clean(input.provider).toLowerCase()
    const providerOrderId = clean(input.providerOrderId)
    const existing = await findOrderByProviderReference(provider, providerOrderId)
    if (existing) return { order: existing, created: false }

    const createdAt = new Date(input.paidAt || Date.now())
    const items = normaliseItems(await enrichItemsFromCatalogue(input.websiteId, input.items))
    const money = reconcileMoney(input, items)
    const environment = resolveEnvironment(input)
    const order = {
      id: crypto.randomUUID(),
      orderNumber: await nextOrderNumber(input.websiteId, items, environment, createdAt),
      environment,
      isTestOrder: environment === 'test',
      websiteId: safeName(input.websiteId),
      clientName: clean(input.clientName),
      provider,
      providerOrderId,
      providerTransactionId: clean(input.providerTransactionId),
      paymentStatus: 'Paid',
      paymentMethod: clean(input.paymentMethod),
      currency: clean(input.currency).toUpperCase(),
      subtotal: money.subtotal,
      shipping: money.shipping,
      tax: money.tax,
      taxLabel: clean(input.taxLabel) || 'Tax',
      taxRate: Math.max(0, Number(input.taxRate || 0)),
      taxIncluded: money.taxIncluded,
      taxNumber: clean(input.taxNumber).toUpperCase(),
      discount: money.discount,
      discountCode: clean(input.discountCode).toUpperCase(),
      total: money.total,
      customer: {
        name: clean(input.customer.name),
        email: clean(input.customer.email).toLowerCase(),
        phone: clean(input.customer.phone),
      },
      billingAddress: input.billingAddress || null,
      shippingAddress: input.shippingAddress || null,
      shippingMethod: clean(input.shippingMethod),
      customerNote: clean(input.customerNote),
      items,
      fulfilmentStatus: 'New',
      tracking: null,
      refund: null,
      notifications: { buyerEmail: 'Pending', clientEmail: 'Pending', discord: 'Pending' },
      createdAt: createdAt.toISOString(),
      paidAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    }
    const orders = await readJson(paths.orders(), [])
    await writeJson(paths.orders(), [order, ...orders])
    await appendOrderEvent(order, 'order.created', 'Paid order created from verified provider event')
    return { order, created: true }
  })
}

export async function listOrders(websiteIds = null) {
  const orders = await readJson(paths.orders(), [])
  if (!websiteIds) return orders
  const allowed = new Set(websiteIds.map(safeName))
  return orders.filter(order => allowed.has(safeName(order.websiteId)))
}

export async function getOrder(orderId) {
  const orders = await readJson(paths.orders(), [])
  return orders.find(order => order.id === orderId || order.orderNumber === orderId) || null
}

export async function recordOrderRefund(orderId, refundInput = {}) {
  const orders = await readJson(paths.orders(), [])
  const existing = orders.find(order => order.id === orderId || order.orderNumber === orderId)
  if (!existing) return null

  const amount = roundMoney(refundInput.amount)
  const previousAmount = roundMoney(existing.refund?.totalAmount || 0)
  const totalAmount = roundMoney(previousAmount + amount)
  const fullyRefunded = totalAmount >= roundMoney(existing.total)
  const entry = {
    id: clean(refundInput.providerRefundId) || crypto.randomUUID(),
    amount,
    reason: clean(refundInput.reason),
    provider: existing.provider,
    providerRefundId: clean(refundInput.providerRefundId),
    restoredStock: refundInput.restoredStock === true,
    createdAt: new Date().toISOString(),
  }
  const updated = {
    ...existing,
    paymentStatus: fullyRefunded ? 'Refunded' : 'Partially Refunded',
    fulfilmentStatus: fullyRefunded ? 'Refunded' : existing.fulfilmentStatus,
    refund: {
      totalAmount,
      remainingAmount: roundMoney(Math.max(0, Number(existing.total) - totalAmount)),
      fullyRefunded,
      stockRestored: existing.refund?.stockRestored === true || refundInput.restoredStock === true,
      history: [...(existing.refund?.history || []), entry],
    },
    updatedAt: new Date().toISOString(),
  }
  await writeJson(paths.orders(), orders.map(order => (order.id === existing.id ? updated : order)))
  await appendOrderEvent(updated, 'order.refunded', `${fullyRefunded ? 'Full' : 'Partial'} refund of ${amount.toFixed(2)} processed`, entry)
  return updated
}

export async function purgeTestOrders(websiteId = '') {
  const safeWebsiteId = websiteId ? safeName(websiteId) : ''
  const orders = await readJson(paths.orders(), [])
  const removed = orders.filter(order => order.isTestOrder && (!safeWebsiteId || order.websiteId === safeWebsiteId))
  if (removed.length === 0) return { removed: 0, websiteId: safeWebsiteId || 'all' }

  const removedIds = new Set(removed.map(order => order.id))
  const keptOrders = orders.filter(order => !removedIds.has(order.id))
  const events = await readJson(paths.orderEvents(), [])
  const notifications = await readJson(paths.notificationLog(), [])
  await Promise.all([
    writeJson(paths.orders(), keptOrders),
    writeJson(paths.orderEvents(), events.filter(event => !removedIds.has(event.orderId))),
    writeJson(paths.notificationLog(), notifications.filter(log => !removedIds.has(log.orderId))),
  ])
  await publishOrderEvent('order.test-data-purged', {
    removedOrderCount: removed.length,
    remainingOrderCount: keptOrders.length,
    scoped: Boolean(safeWebsiteId),
  })
  return { removed: removed.length, websiteId: safeWebsiteId || 'all' }
}

export async function updateOrderStatus(orderId, status, details = {}) {
  if (!ORDER_STATUSES.has(status)) throw new Error('Invalid fulfilment status')
  const orders = await readJson(paths.orders(), [])
  const existing = orders.find(order => order.id === orderId || order.orderNumber === orderId)
  if (!existing) return null

  const tracking = details.tracking ?? existing.tracking
  const internalNote = clean(details.internalNote) || existing.internalNote
  const unchanged = existing.fulfilmentStatus === status
    && JSON.stringify(existing.tracking ?? null) === JSON.stringify(tracking ?? null)
    && String(existing.internalNote || '') === String(internalNote || '')
  if (unchanged) return existing

  const updated = {
    ...existing,
    fulfilmentStatus: status,
    tracking,
    internalNote,
    updatedAt: new Date().toISOString(),
  }
  await writeJson(paths.orders(), orders.map(order => (order.id === existing.id ? updated : order)))
  await appendOrderEvent(updated, 'order.status_changed', `Fulfilment changed to ${status}`)
  return updated
}

export async function updateNotificationStatus(orderId, channel, status, errorMessage = '') {
  const orders = await readJson(paths.orders(), [])
  const existing = orders.find(order => order.id === orderId)
  if (!existing) return null
  const updated = {
    ...existing,
    notifications: { ...existing.notifications, [channel]: status },
    updatedAt: new Date().toISOString(),
  }
  await writeJson(paths.orders(), orders.map(order => (order.id === orderId ? updated : order)))
  const log = await readJson(paths.notificationLog(), [])
  await writeJson(paths.notificationLog(), [{
    id: crypto.randomUUID(),
    orderId,
    orderNumber: existing.orderNumber,
    channel,
    status,
    error: clean(errorMessage),
    createdAt: new Date().toISOString(),
  }, ...log])
  return updated
}

export async function appendOrderEvent(order, type, message, metadata = {}) {
  const events = await readJson(paths.orderEvents(), [])
  const event = {
    id: crypto.randomUUID(),
    orderId: order.id,
    orderNumber: order.orderNumber,
    websiteId: order.websiteId,
    type,
    message,
    metadata,
    createdAt: new Date().toISOString(),
  }
  await writeJson(paths.orderEvents(), [event, ...events])
  const topic = ORDER_EVENT_TOPICS.get(type)
  if (topic) await publishOrderEvent(topic, orderEventPayload(order))
  return event
}
