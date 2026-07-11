import { paths, readJson, safeName, writeJson } from './storage.js'

const ORDER_STATUSES = new Set([
  'New',
  'Processing',
  'Awaiting Stock',
  'Dispatched',
  'Delivered',
  'Cancelled',
  'Refunded',
])

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
    item.orderTag ||
      item.customTag ||
      item.sku ||
      item.type ||
      productIdTag(item.productId) ||
      item.category ||
      item.name,
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
    }
  })
}

function normaliseItems(items = []) {
  return items.map(item => {
    const orderTag = deriveOrderTag(item)
    return {
      productId: clean(item.productId),
      name: clean(item.name),
      image: clean(item.image),
      category: clean(item.category),
      type: clean(item.type),
      orderTag,
      sku: clean(item.sku) || orderTag,
      quantity: Math.max(1, Number(item.quantity || 1)),
      unitPrice: roundMoney(item.unitPrice),
      total: roundMoney(Number(item.quantity || 1) * Number(item.unitPrice || 0)),
      variant: {
        size: clean(item.variant?.size),
        colour: clean(item.variant?.colour),
        ...(item.variant || {}),
      },
      fulfilment: item.fulfilment === 'digital' ? 'digital' : 'physical',
    }
  })
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
  if (provider === 'stripe') {
    return process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'live'
  }
  if (provider === 'paypal') {
    return process.env.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'test'
  }
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

export async function findOrderByProviderReference(provider, providerOrderId) {
  const orders = await readJson(paths.orders(), [])
  return orders.find(
    order => order.provider === provider && order.providerOrderId === providerOrderId,
  )
}

export async function createPaidOrder(input = {}) {
  const errors = validateOrderInput(input)
  if (errors.length) {
    const error = new Error(errors.join('; '))
    error.code = 'INVALID_ORDER'
    throw error
  }

  const existing = await findOrderByProviderReference(input.provider, input.providerOrderId)
  if (existing) return { order: existing, created: false }

  const createdAt = new Date(input.paidAt || Date.now())
  const enrichedItems = await enrichItemsFromCatalogue(input.websiteId, input.items)
  const items = normaliseItems(enrichedItems)
  const environment = resolveEnvironment(input)
  const order = {
    id: crypto.randomUUID(),
    orderNumber: await nextOrderNumber(input.websiteId, items, environment, createdAt),
    environment,
    isTestOrder: environment === 'test',
    websiteId: safeName(input.websiteId),
    clientName: clean(input.clientName),
    provider: clean(input.provider).toLowerCase(),
    providerOrderId: clean(input.providerOrderId),
    providerTransactionId: clean(input.providerTransactionId),
    paymentStatus: 'Paid',
    paymentMethod: clean(input.paymentMethod),
    currency: clean(input.currency).toUpperCase(),
    subtotal: roundMoney(input.subtotal),
    shipping: roundMoney(input.shipping),
    tax: roundMoney(input.tax),
    discount: roundMoney(input.discount),
    total: roundMoney(input.total),
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
    notifications: {
      buyerEmail: 'Pending',
      clientEmail: 'Pending',
      discord: 'Pending',
    },
    createdAt: createdAt.toISOString(),
    paidAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  }

  const orders = await readJson(paths.orders(), [])
  await writeJson(paths.orders(), [order, ...orders])
  await appendOrderEvent(order, 'order.created', 'Paid order created from verified provider event')
  return { order, created: true }
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

export async function purgeTestOrders(websiteId = '') {
  const safeWebsiteId = websiteId ? safeName(websiteId) : ''
  const orders = await readJson(paths.orders(), [])
  const removed = orders.filter(
    order => order.isTestOrder && (!safeWebsiteId || order.websiteId === safeWebsiteId),
  )
  const removedIds = new Set(removed.map(order => order.id))
  const keptOrders = orders.filter(order => !removedIds.has(order.id))
  const events = await readJson(paths.orderEvents(), [])
  const notifications = await readJson(paths.notificationLog(), [])

  await Promise.all([
    writeJson(paths.orders(), keptOrders),
    writeJson(paths.orderEvents(), events.filter(event => !removedIds.has(event.orderId))),
    writeJson(paths.notificationLog(), notifications.filter(log => !removedIds.has(log.orderId))),
  ])

  return { removed: removed.length, websiteId: safeWebsiteId || 'all' }
}

export async function updateOrderStatus(orderId, status, details = {}) {
  if (!ORDER_STATUSES.has(status)) throw new Error('Invalid fulfilment status')
  const orders = await readJson(paths.orders(), [])
  const existing = orders.find(order => order.id === orderId || order.orderNumber === orderId)
  if (!existing) return null

  const updated = {
    ...existing,
    fulfilmentStatus: status,
    tracking: details.tracking ?? existing.tracking,
    internalNote: clean(details.internalNote) || existing.internalNote,
    updatedAt: new Date().toISOString(),
  }

  await writeJson(
    paths.orders(),
    orders.map(order => (order.id === existing.id ? updated : order)),
  )
  await appendOrderEvent(updated, 'order.status_changed', `Fulfilment changed to ${status}`)
  return updated
}

export async function updateNotificationStatus(orderId, channel, status, errorMessage = '') {
  const orders = await readJson(paths.orders(), [])
  const existing = orders.find(order => order.id === orderId)
  if (!existing) return null

  const updated = {
    ...existing,
    notifications: {
      ...existing.notifications,
      [channel]: status,
    },
    updatedAt: new Date().toISOString(),
  }

  await writeJson(paths.orders(), orders.map(order => (order.id === orderId ? updated : order)))
  const log = await readJson(paths.notificationLog(), [])
  await writeJson(paths.notificationLog(), [
    {
      id: crypto.randomUUID(),
      orderId,
      orderNumber: existing.orderNumber,
      channel,
      status,
      error: clean(errorMessage),
      createdAt: new Date().toISOString(),
    },
    ...log,
  ])
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
  return event
}
