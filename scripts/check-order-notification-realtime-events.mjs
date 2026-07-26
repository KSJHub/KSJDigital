import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/orderNotificationService.js', import.meta.url), 'utf8')
const orderService = await fs.readFile(new URL('../server/orderService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishDomainEvent('order-notification.delivery-recorded'",
  'sent:',
  'failed:',
  'emailChannel,',
  'webhookChannel:',
  'buyerFacing:',
  'operationalChannel:',
]) {
  if (!source.includes(token)) failures.push(`Missing order notification realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function notificationEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishNotificationDelivery', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'order.id',
  'orderNumber',
  'customer',
  'email:',
  'phone:',
  'channel,',
  'status,',
  'error:',
  'message:',
  'result:',
  'provider',
  'response',
  'recipient',
  'subject',
  'text',
  'webhookUrl',
  'settings',
  'actor',
  'session',
  'request',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Order notification realtime payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishNotificationDelivery(channel, status) {\n  await publishDomainEvent('order-notification.delivery-recorded', notificationEventPayload(channel, status))\n}")) {
  failures.push('Order notification events must publish through the aggregate payload helper')
}

const updateAt = source.indexOf('const updated = await updateNotificationStatus(order.id, channel, status, errorMessage)')
const publishAt = source.indexOf('await publishNotificationDelivery(channel, status)')
if (updateAt < 0 || publishAt < updateAt) {
  failures.push('Order notification event must publish after notification status persistence')
}

if (!source.includes('if (!updated) return false\n    await publishNotificationDelivery(channel, status)')) {
  failures.push('Order notification event must not publish when persistence did not update an order')
}

for (const token of [
  'await writeJson(paths.orders(), orders.map(order => (order.id === orderId ? updated : order)))',
  'await writeJson(paths.notificationLog(), [{',
]) {
  if (!orderService.includes(token)) failures.push(`Order notification persistence marker is missing: ${token}`)
}

for (const forbiddenTopic of [
  "publishDomainEvent('order.created'",
  "publishDomainEvent('order.status-changed'",
  "publishDomainEvent('notification.",
]) {
  if (source.includes(forbiddenTopic)) failures.push(`Order notification service must not duplicate another module topic: ${forbiddenTopic}`)
}

if (failures.length) {
  console.error('Order notification real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Order notification real-time event checks passed')
