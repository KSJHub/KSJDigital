import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/orderService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "['order.created', 'order.created']",
  "['order.refunded', 'order.refunded']",
  "['order.status_changed', 'order.status-changed']",
  "publishOrderEvent('order.test-data-purged'",
  'itemCount:',
  'unitCount:',
  'physicalItemCount:',
  'digitalItemCount:',
  'madeToOrderItemCount:',
  'isTestOrder:',
  'paymentStatus:',
  'fulfilmentStatus:',
  'hasTracking:',
  'fullyRefunded:',
  'stockRestored:',
  'removedOrderCount:',
  'remainingOrderCount:',
  'scoped:',
]) {
  if (!source.includes(token)) failures.push(`Missing order realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function orderEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishOrderEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''
const purgeStart = source.indexOf("await publishOrderEvent('order.test-data-purged'")
const purgeEnd = source.indexOf('\n  })', purgeStart)
const purgeSource = purgeStart >= 0 && purgeEnd > purgeStart ? source.slice(purgeStart, purgeEnd) : ''

for (const forbidden of [
  'id:',
  'orderId:',
  'orderNumber:',
  'websiteId:',
  'clientName:',
  'provider:',
  'providerOrderId:',
  'providerTransactionId:',
  'paymentMethod:',
  'currency:',
  'subtotal:',
  'shipping:',
  'tax:',
  'discount:',
  'total:',
  'customer:',
  'email:',
  'phone:',
  'billingAddress:',
  'shippingAddress:',
  'customerNote:',
  'internalNote:',
  'tracking:',
  'number:',
  'courier:',
  'url:',
  'message:',
  'metadata:',
  'createdAt:',
  'updatedAt:',
  'paidAt:',
  '...order',
  '...event',
  '...metadata',
]) {
  if (payloadSource.includes(forbidden) || purgeSource.includes(forbidden)) {
    failures.push(`Order realtime payload exposes forbidden data: ${forbidden}`)
  }
}

if (!source.includes("async function publishOrderEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Order events must publish aggregate payloads without actor-derived metadata')
}

const eventWrite = source.indexOf('await writeJson(paths.orderEvents(), [event, ...events])')
const eventPublish = source.indexOf('if (topic) await publishOrderEvent(topic, orderEventPayload(order))')
if (eventWrite < 0 || eventPublish < eventWrite) failures.push('Order lifecycle events must publish after journal persistence')

const purgeWrite = source.indexOf('await Promise.all([')
const purgePublish = source.indexOf("await publishOrderEvent('order.test-data-purged'")
if (purgeWrite < 0 || purgePublish < purgeWrite) failures.push('Order purge events must publish after all persistence completes')

if (source.includes("publishOrderEvent('order.notification")) {
  failures.push('Order notification logging must remain covered by the canonical notification module')
}

if (failures.length) {
  console.error('Order real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Order real-time event checks passed')
