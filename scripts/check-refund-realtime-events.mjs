import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/refundService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishRefundEvent('refund.completed'",
  "publishRefundEvent('refund.stock-restored'",
  "publishRefundEvent('refund.stock-restore-failed'",
  'itemCount:',
  'unitCount:',
  'restorableItemCount:',
  'restorableUnitCount:',
  'fullRefund:',
  'stockRestoreRequested:',
  'stockRestored:',
  'stockRestoreFailed:',
  'function restorableOrderItems(order = {})',
  'const restorableItems = restorableOrderItems(order)',
  'if (input.restoreStock === true && restorableItems.length > 0)',
]) {
  if (!source.includes(token)) failures.push(`Missing refund realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function refundEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishRefundEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'id:',
  'orderId:',
  'orderNumber:',
  'websiteId:',
  'provider:',
  'providerOrderId:',
  'providerTransactionId:',
  'providerRefundId:',
  'requestId:',
  'amount:',
  'remaining:',
  'total:',
  'currency:',
  'reason:',
  'customer:',
  'email:',
  'phone:',
  'billingAddress:',
  'shippingAddress:',
  'productId:',
  'name:',
  'sku:',
  'variant:',
  'size:',
  'colour:',
  'message:',
  'warning:',
  'stockRestoreError:',
  'createdAt:',
  'updatedAt:',
  '...order',
  '...item',
  '...input',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Refund realtime payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishRefundEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Refund events must publish aggregate payloads without actor-derived metadata')
}

const recordRefund = source.indexOf('let updated = await recordOrderRefund(')
const completedPublish = source.indexOf("await publishRefundEvent('refund.completed'")
if (recordRefund < 0 || completedPublish < recordRefund) failures.push('Refund completed events must publish after local refund persistence')

const restoreGuard = source.indexOf('if (input.restoreStock === true && restorableItems.length > 0)')
const restoreCall = source.indexOf('await restoreProductStock(', restoreGuard)
const restoredWrite = source.indexOf('updated = await markRefundStockRestored(', restoreGuard)
const restoredPublish = source.indexOf("await publishRefundEvent('refund.stock-restored'", restoreGuard)
const failedWrite = source.indexOf('updated = (await markRefundStockRestoreFailed(', restoreGuard)
const failedPublish = source.indexOf("await publishRefundEvent('refund.stock-restore-failed'", restoreGuard)

if (restoreGuard < 0) failures.push('Refund stock restoration must suppress requests with no restorable items')
if (restoreCall < restoreGuard) failures.push('Refund stock restoration guard must run before inventory mutation')
if (restoredWrite < restoreGuard) failures.push('Refund stock restoration guard must run before restoration persistence')
if (restoredPublish < restoreGuard) failures.push('Refund stock restoration guard must run before restored publication')
if (failedWrite < restoreGuard) failures.push('Refund stock restoration guard must run before failure persistence')
if (failedPublish < restoreGuard) failures.push('Refund stock restoration guard must run before failure publication')
if (restoredWrite < 0 || restoredPublish < restoredWrite) failures.push('Refund stock-restored events must publish after restoration persistence')
if (failedWrite < 0 || failedPublish < failedWrite) failures.push('Refund stock-restore-failed events must publish after failure persistence')

const loopMarker = 'for (const item of restorableItems)'
if (!source.includes(loopMarker)) failures.push('Refund stock restoration must process only restorable items')

if (source.includes("publishRefundEvent('order.")) failures.push('Refund service must not duplicate canonical order lifecycle events')
if (source.includes("publishRefundEvent('inventory.")) failures.push('Refund service must not duplicate canonical inventory lifecycle events')

if (failures.length) {
  console.error('Refund real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Refund real-time event checks passed')
