import crypto from 'node:crypto'
import { decrementProductStock, restoreProductStock } from './merchValidation.js'
import { paths, readJson, writeJson } from './storage.js'

const RESERVATION_MS = 30 * 60 * 1000
let reservationQueue = Promise.resolve()

function serialise(action) {
  const next = reservationQueue.then(action, action)
  reservationQueue = next.catch(() => {})
  return next
}

async function readReservations() {
  return readJson(paths.stockReservations(), [])
}

async function restoreExpiredLocked(now = Date.now()) {
  const records = await readReservations()
  const expired = records.filter(record => record.status === 'reserved' && new Date(record.expiresAt).getTime() <= now)

  for (const record of expired) {
    await restoreProductStock(record.websiteId, record.productId, record.quantity, record.variant)
  }

  if (expired.length) {
    const expiredIds = new Set(expired.map(record => record.id))
    await writeJson(paths.stockReservations(), records.filter(record => !expiredIds.has(record.id)))
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
    const reservation = {
      id: crypto.randomUUID(),
      websiteId,
      productId: product.id,
      quantity: Math.max(1, Number(quantity || 1)),
      variant: {
        size: String(variant.size || '').trim(),
        colour: String(variant.colour || '').trim(),
      },
      provider: String(provider || '').toLowerCase(),
      status: 'reserved',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + RESERVATION_MS).toISOString(),
    }

    const records = await readReservations()
    await writeJson(paths.stockReservations(), [reservation, ...records])
    return reservation
  })
}

export async function consumeStockReservation(reservationId) {
  if (!reservationId) return false
  return serialise(async () => {
    const records = await readReservations()
    const exists = records.some(record => record.id === reservationId)
    if (!exists) return false
    await writeJson(paths.stockReservations(), records.filter(record => record.id !== reservationId))
    return true
  })
}

export async function releaseStockReservation(reservationId) {
  if (!reservationId) return false
  return serialise(async () => {
    const records = await readReservations()
    const record = records.find(item => item.id === reservationId)
    if (!record) return false

    await restoreProductStock(record.websiteId, record.productId, record.quantity, record.variant)
    await writeJson(paths.stockReservations(), records.filter(item => item.id !== reservationId))
    return true
  })
}

const cleanupTimer = setInterval(() => {
  cleanupExpiredReservations().catch(error => {
    console.error('Unable to clean expired stock reservations:', error)
  })
}, 5 * 60 * 1000)
cleanupTimer.unref?.()
