import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/dispatchRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishDomainEvent('dispatch.processed'",
  'itemCount:',
  'unitCount:',
  'physicalItemCount:',
  'madeToOrderItemCount:',
  'fulfilmentStatus:',
  'hasTracking:',
  'hasTrackingUrl:',
  'notificationRequested:',
  'notificationSucceeded:',
  'notificationFailed:',
  'repeatNotification:',
  'function dispatchStateChanged(previous = {}, updated = {})',
  'const stateChanged = dispatchStateChanged(order, updated)',
  'if (stateChanged || shouldNotify) {',
]) {
  if (!source.includes(token)) failures.push(`Missing dispatch realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function dispatchEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishDispatchEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'id:',
  'orderId:',
  'orderNumber:',
  'websiteId:',
  'clientName:',
  'customer:',
  'email:',
  'phone:',
  'address:',
  'courier:',
  'number:',
  'url:',
  'tracking:',
  'internalNote:',
  'provider:',
  'providerOrderId:',
  'providerTransactionId:',
  'price:',
  'total:',
  'currency:',
  'message:',
  'error:',
  'request:',
  'session:',
  'actor:',
  'createdAt:',
  'updatedAt:',
  'dispatchedAt:',
  '...order',
  '...tracking',
  '...notification',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Dispatch realtime payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishDispatchEvent(payload) {\n  await publishDomainEvent('dispatch.processed', payload)\n}")) {
  failures.push('Dispatch events must publish aggregate payloads without request or actor metadata')
}

const statusUpdate = source.indexOf('let updated = await updateOrderStatus(')
const stateCheck = source.indexOf('const stateChanged = dispatchStateChanged(order, updated)')
const notificationAttempt = source.indexOf('notification = await sendDispatchNotification(')
const publishGuard = source.indexOf('if (stateChanged || shouldNotify) {')
const publishAt = source.indexOf('await publishDispatchEvent(dispatchEventPayload(updated')
if (statusUpdate < 0 || publishAt < statusUpdate) {
  failures.push('Dispatch events must publish after the order status is persisted')
}
if (stateCheck < statusUpdate || publishGuard < stateCheck || publishAt < publishGuard) {
  failures.push('Dispatch events must be suppressed unless state changed or a notification was requested')
}
if (notificationAttempt < 0 || publishAt < notificationAttempt) {
  failures.push('Dispatch events must publish after any requested notification attempt completes')
}

const stateHelperStart = source.indexOf('function dispatchStateChanged(')
const stateHelperEnd = source.indexOf('\n}\n\nfunction dispatchEventPayload', stateHelperStart)
const stateHelper = stateHelperStart >= 0 && stateHelperEnd > stateHelperStart
  ? source.slice(stateHelperStart, stateHelperEnd)
  : ''
for (const token of [
  'previous.fulfilmentStatus !== updated.fulfilmentStatus',
  'JSON.stringify(previous.tracking ?? null) !== JSON.stringify(updated.tracking ?? null)',
  "String(previous.internalNote || '') !== String(updated.internalNote || '')",
]) {
  if (!stateHelper.includes(token)) failures.push(`Dispatch semantic comparison is missing: ${token}`)
}

for (const forbiddenTopic of [
  "publishDomainEvent('order.",
  "publishDomainEvent('notification.",
]) {
  if (source.includes(forbiddenTopic)) failures.push(`Dispatch router must not duplicate another module topic: ${forbiddenTopic}`)
}

if (failures.length) {
  console.error('Dispatch real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Dispatch real-time event checks passed')
