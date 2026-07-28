import crypto from 'node:crypto'
import { decrementProductStock, restoreProductStock } from './merchValidation.js'
import { paths, readJson, writeJson } from './storage.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

const RESERVATION_MS = 35 * 60 * 1000
let reservationQueue = Promise.resolve()

function serialise(action) {
  const next = reservationQueue.then(action, action)
  reservationQueue = next.catch(() => {})
  return next
}

async function publishReservationEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

async function readReservations() {
  return readJson(paths.stockReservations(), [])
}

function releaseTokenHash(token = '') {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function reservationCapability(value = '') {
  const [id = '', releaseToken = ''] = String(value).split('.', 2)
  return { id, releaseToken }
}

function validReleaseToken(record, token) {
  if (!record?.releaseTokenHash || !token) return false
  const expected = Buffer.from(record.releaseTokenHash, 'hex')
  const actual = Buffer.from(releaseTokenHash(token), 'hex')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

async function restoreExpiredLocked(now = Date.now()) {
  const records = await readReservations()
  const expired = records.filter(record => record.status === 'reserved' && new Date(record.expiresAt).getTime() <= now)

  for (const record of expired) {
    await restoreProductStock(record.websiteId, record.productId, record.quantity, record.variant)
  }

  if (expired.length) {
    const expiredIds = new Set(expired.map(record => record.id))
    const active = records.filter(record => !expiredIds.has(record.id))
    await writeJson(paths.stockReservations(), active)
    await publishReservationEvent('inventory.reservations-expired', {
      expiredReservationCount: expired.length,
      restoredUnitCount: expired.reduce((total, record) => total + Math.max(1, Number(record.quantity || 1)), 0),
      activeReservationCount: active.length,
    })
  }

  return expired.length
}

export async function cleanupExpiredReservations() {
  return serialise(() => restoreExpiredLocked())
}

export async function reserveProductStock({ websiteId, product, quantity, variant = {}, provider }) {
  if (product.fulfilmentOptions?.madeToOrder === true || product.inventory?.trackStock !== true) {
    return null
  }

  return serialise(async () => {
    await restoreExpiredLocked()
    await decrementProductStock(websiteId, product.id, quantity, variant)

    const now = Date.now()
    const releaseToken = crypto.randomBytes(32).toString('hex')
    const reservation = {
      id: crypto.randomBytes(12).toString('hex'),
      websiteId,
      productId: product.id,
      quantity: Math.max(1, Number(quantity || 1)),
      variant: {
        size: String(variant.size || '').trim(),
        colour: String(variant.colour || '').trim(),
      },
      provider: String(provider || '').toLowerCase(),
      status: 'reserved',
      releaseTokenHash: releaseTokenHash(releaseToken),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + RESERVATION_MS).toISOString(),
    }

    const records = await readReservations()
    const active = [reservation, ...records]
    await writeJson(paths.stockReservations(), active)
    await publishReservationEvent('inventory.stock-reserved', {
      quantity: reservation.quantity,
      hasVariant: Boolean(reservation.variant.size || reservation.variant.colour),
      activeReservationCount: active.length,
      expiresWithinMinutes: Math.round(RESERVATION_MS / 60000),
    })
    const response = { ...reservation }
    delete response.releaseTokenHash
    response.id = `${reservation.id}.${releaseToken}`
    return response
  })
}

export async function getActiveStockReservation(reservationId) {
  const { id } = reservationCapability(reservationId)
  if (!id) return null
  return serialise(async () => {
    await restoreExpiredLocked()
    const records = await readReservations()
    return records.find(record => record.id === id && record.status === 'reserved') || null
  })
}

export async function consumeStockReservation(reservationId) {
  const { id } = reservationCapability(reservationId)
  if (!id) return false
  return serialise(async () => {
    await restoreExpiredLocked()
    const records = await readReservations()
    const record = records.find(item => item.id === id)
    if (!record) return false
    const active = records.filter(item => item.id !== id)
    await writeJson(paths.stockReservations(), active)
    await publishReservationEvent('inventory.reservation-consumed', {
      quantity: Math.max(1, Number(record.quantity || 1)),
      hasVariant: Boolean(record.variant?.size || record.variant?.colour),
      activeReservationCount: active.length,
    })
    return true
  })
}

async function releaseReservationLocked(reservationId, releaseToken = null, requireToken = false) {
  const { id } = reservationCapability(reservationId)
  const records = await readReservations()
  const record = records.find(item => item.id === id)
  if (!record) return false
  if (requireToken && !validReleaseToken(record, releaseToken)) return false

  await restoreProductStock(record.websiteId, record.productId, record.quantity, record.variant)
  const active = records.filter(item => item.id !== id)
  await writeJson(paths.stockReservations(), active)
  await publishReservationEvent('inventory.reservation-released', {
    quantity: Math.max(1, Number(record.quantity || 1)),
    hasVariant: Boolean(record.variant?.size || record.variant?.colour),
    activeReservationCount: active.length,
    stockRestored: true,
  })
  return true
}

export async function releaseStockReservation(reservationId) {
  const { id } = reservationCapability(reservationId)
  if (!id) return false
  return serialise(() => releaseReservationLocked(id))
}

export async function releasePublicStockReservation(reservationCapabilityValue) {
  const { id, releaseToken } = reservationCapability(reservationCapabilityValue)
  if (!id || !releaseToken) return false
  return serialise(() => releaseReservationLocked(id, releaseToken, true))
}

const cleanupTimer = setInterval(() => {
  cleanupExpiredReservations().catch(error => {
    console.error('Unable to clean expired stock reservations:', error)
  })
}, 5 * 60 * 1000)
cleanupTimer.unref?.()
