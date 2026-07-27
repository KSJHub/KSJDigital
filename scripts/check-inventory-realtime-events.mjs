import fs from 'node:fs/promises'

const files = {
  stock: await fs.readFile(new URL('../server/merchValidation.js', import.meta.url), 'utf8'),
  reservations: await fs.readFile(new URL('../server/stockReservations.js', import.meta.url), 'utf8'),
  router: await fs.readFile(new URL('../server/inventoryRouter.js', import.meta.url), 'utf8'),
}
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishInventoryEvent('inventory.stock-adjusted'",
  "publishInventoryEvent('inventory.basket-stock-decremented'",
  'direction:',
  'quantity:',
  'totalQuantity:',
  'hasVariants:',
  'selectedVariant:',
  'lowStock:',
  'outOfStock:',
  'checkoutEnabled:',
  'itemCount:',
  'unitCount:',
  'trackedProductCount:',
  'outOfStockProductCount:',
]) {
  if (!files.stock.includes(token)) failures.push(`Missing inventory stock realtime marker: ${token}`)
}

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishReservationEvent('inventory.stock-reserved'",
  "publishReservationEvent('inventory.reservation-consumed'",
  "publishReservationEvent('inventory.reservation-released'",
  "publishReservationEvent('inventory.reservations-expired'",
  'activeReservationCount:',
  'expiredReservationCount:',
  'restoredUnitCount:',
  'expiresWithinMinutes:',
  'stockRestored:',
]) {
  if (!files.reservations.includes(token)) failures.push(`Missing inventory reservation realtime marker: ${token}`)
}

if (/router\.(post|put|patch|delete)\(/.test(files.router)) {
  failures.push('Inventory dashboard router must remain read-only; mutations belong in canonical services')
}

const stockPayloadStart = files.stock.indexOf('function inventoryEventPayload(')
const stockPayloadEnd = files.stock.indexOf('\n}\n\nasync function publishInventoryEvent', stockPayloadStart)
const stockPayload = stockPayloadStart >= 0 && stockPayloadEnd > stockPayloadStart ? files.stock.slice(stockPayloadStart, stockPayloadEnd) : ''

const reservationPublishBlocks = [
  "publishReservationEvent('inventory.stock-reserved'",
  "publishReservationEvent('inventory.reservation-consumed'",
  "publishReservationEvent('inventory.reservation-released'",
  "publishReservationEvent('inventory.reservations-expired'",
].map(marker => {
  const start = files.reservations.indexOf(marker)
  return start >= 0 ? files.reservations.slice(start, files.reservations.indexOf('})', start) + 2) : ''
}).join('\n')

for (const forbidden of [
  'productId:',
  'websiteId:',
  'reservationId:',
  'id:',
  'sku:',
  'orderTag:',
  'productName:',
  'provider:',
  'size:',
  'colour:',
  'variant:',
  'price:',
  'priceGBP:',
  'cost:',
  'supplier:',
  'customer:',
  'orderNumber:',
  'email:',
  'actor:',
  'session:',
  'request:',
  '...product',
  '...reservation',
  '...record',
]) {
  if (stockPayload.includes(forbidden) || reservationPublishBlocks.includes(forbidden)) {
    failures.push(`Inventory realtime payload exposes forbidden data: ${forbidden}`)
  }
}

if (!files.stock.includes("async function publishInventoryEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Inventory events must publish aggregate payloads without actor-derived metadata')
}
if (!files.reservations.includes("async function publishReservationEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Reservation events must publish aggregate payloads without actor-derived metadata')
}

const stockWrite = files.stock.indexOf('await writeJson(paths.content(safeWebsiteId)')
const stockPublish = files.stock.indexOf("await publishInventoryEvent('inventory.stock-adjusted'")
if (stockWrite < 0 || stockPublish < stockWrite) failures.push('Stock adjustment events must publish after persistence')

const basketStart = files.stock.indexOf('export async function decrementBasketStock(')
const basketEnd = files.stock.indexOf('\nexport async function decrementProductStock', basketStart)
const basketSource = basketStart >= 0 && basketEnd > basketStart ? files.stock.slice(basketStart, basketEnd) : ''
const emptyBasketGuard = basketSource.indexOf('if (!Array.isArray(items) || items.length === 0) return products')
const unchangedBasketGuard = basketSource.indexOf('if (changedItemCount === 0) return products')
const basketWrite = basketSource.indexOf('await writeJson(paths.content(safeWebsiteId)')
const basketPublish = basketSource.indexOf("await publishInventoryEvent('inventory.basket-stock-decremented'")

if (emptyBasketGuard < 0 || emptyBasketGuard > basketWrite || emptyBasketGuard > basketPublish) {
  failures.push('Empty baskets must return before inventory persistence and publication')
}
if (unchangedBasketGuard < 0 || unchangedBasketGuard > basketWrite || unchangedBasketGuard > basketPublish) {
  failures.push('Baskets without tracked stock changes must return before persistence and publication')
}
if (!basketSource.includes('itemCount: changedItemCount') || !basketSource.includes('unitCount: changedUnitCount')) {
  failures.push('Basket inventory events must count only items and units whose tracked stock changed')
}
if (basketWrite < 0 || basketPublish < basketWrite) failures.push('Basket stock events must publish after persistence')

for (const [writeToken, publishToken, label] of [
  ['await writeJson(paths.stockReservations(), active)', "await publishReservationEvent('inventory.stock-reserved'", 'reservation creation'],
  ['await writeJson(paths.stockReservations(), active)', "await publishReservationEvent('inventory.reservation-consumed'", 'reservation consumption'],
  ['await writeJson(paths.stockReservations(), active)', "await publishReservationEvent('inventory.reservation-released'", 'reservation release'],
  ['await writeJson(paths.stockReservations(), active)', "await publishReservationEvent('inventory.reservations-expired'", 'expired reservation cleanup'],
]) {
  const publishAt = files.reservations.indexOf(publishToken)
  const writeAt = files.reservations.lastIndexOf(writeToken, publishAt)
  if (writeAt < 0 || publishAt < writeAt) failures.push(`${label} events must publish after persistence`)
}

const expiryStart = files.reservations.indexOf('async function restoreExpiredLocked(')
const expiryEnd = files.reservations.indexOf('\nexport async function cleanupExpiredReservations', expiryStart)
const expirySource = expiryStart >= 0 && expiryEnd > expiryStart
  ? files.reservations.slice(expiryStart, expiryEnd)
  : ''
if (!expirySource.includes("if (expired.length) {\n    const expiredIds")) {
  failures.push('Expired reservation cleanup must not publish or persist when no reservations expired')
}

if (failures.length) {
  console.error('Inventory real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Inventory real-time event checks passed')
