import express from 'express'
import { getCommerceSettings } from './commerceSettingsRouter.js'
import { sendDispatchNotification } from './orderNotificationService.js'
import { getOrder, updateOrderStatus } from './orderService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

const TRACKING_URLS = {
  'Royal Mail': number => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(number)}`,
  Evri: number => `https://www.evri.com/track/parcel/${encodeURIComponent(number)}`,
  DPD: number => `https://track.dpd.co.uk/parcels/${encodeURIComponent(number)}`,
  DHL: number => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(number)}`,
  UPS: number => `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`,
  FedEx: number => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`,
}

function canAccessOrder(session, order) {
  if (!session || !order) return false
  if (session.role === 'owner') return true
  return (session.websiteIds || []).includes(order.websiteId)
}

function clean(value = '', maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength)
}

function trackingDetails(input = {}, status = '') {
  const courier = clean(input.courier, 80)
  const number = clean(input.number, 120)
  const customUrl = clean(input.url, 1000)

  if (status === 'Dispatched' && (!courier || !number)) {
    throw new Error('Courier and tracking number are required before dispatch')
  }

  let url = customUrl
  if (!url && courier && number && TRACKING_URLS[courier]) url = TRACKING_URLS[courier](number)
  if (url) {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('Tracking URL is invalid')
    }
    if (parsed.protocol !== 'https:') throw new Error('Tracking URL must use HTTPS')
  }

  return {
    courier,
    number,
    url,
    dispatchedAt: input.dispatchedAt || (status === 'Dispatched' ? new Date().toISOString() : ''),
  }
}

function dispatchStateChanged(previous = {}, updated = {}) {
  return previous.fulfilmentStatus !== updated.fulfilmentStatus
    || JSON.stringify(previous.tracking ?? null) !== JSON.stringify(updated.tracking ?? null)
    || String(previous.internalNote || '') !== String(updated.internalNote || '')
}

function dispatchEventPayload(order = {}, details = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  return {
    itemCount: items.length,
    unitCount: items.reduce((total, item) => total + Math.max(1, Number(item.quantity || 1)), 0),
    physicalItemCount: items.filter(item => item.fulfilment !== 'digital').length,
    madeToOrderItemCount: items.filter(item => item.madeToOrder === true).length,
    fulfilmentStatus: String(order.fulfilmentStatus || '').toLowerCase(),
    hasTracking: Boolean(order.tracking?.number),
    hasTrackingUrl: Boolean(order.tracking?.url),
    notificationRequested: details.notificationRequested === true,
    notificationSucceeded: details.notificationSucceeded === true,
    notificationFailed: details.notificationFailed === true,
    repeatNotification: details.repeatNotification === true,
  }
}

async function publishDispatchEvent(payload) {
  await publishDomainEvent('dispatch.processed', payload)
}

export function createDispatchRouter() {
  const router = express.Router()

  router.patch('/:id/status', async (req, res) => {
    const order = await getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (!canAccessOrder(req.session, order)) return res.status(403).json({ error: 'Order access denied' })
    if (req.session.role !== 'owner' && !req.session.canEdit) {
      return res.status(403).json({ error: 'Edit permission required' })
    }

    try {
      const status = req.body?.status
      const suppliedTracking = req.body?.tracking || {}
      const tracking = status === 'Dispatched'
        ? trackingDetails({ ...(order.tracking || {}), ...suppliedTracking }, status)
        : req.body?.tracking
          ? trackingDetails({ ...(order.tracking || {}), ...suppliedTracking }, status)
          : order.tracking

      let updated = await updateOrderStatus(order.id, status, {
        tracking,
        internalNote: clean(req.body?.internalNote, 2000),
      })

      const shouldNotify =
        status === 'Dispatched' &&
        (order.fulfilmentStatus !== 'Dispatched' || req.body?.sendDispatchEmail === true)
      const stateChanged = dispatchStateChanged(order, updated)

      let notification = null
      if (shouldNotify) {
        const settings = await getCommerceSettings(order.websiteId)
        notification = await sendDispatchNotification(updated, {
          ...settings,
          brandName: order.clientName || order.websiteId,
        })
        updated = await getOrder(order.id)
      }

      if (stateChanged || shouldNotify) {
        await publishDispatchEvent(dispatchEventPayload(updated, {
          notificationRequested: shouldNotify,
          notificationSucceeded: notification?.status === 'Sent',
          notificationFailed: notification?.status === 'Failed',
          repeatNotification: order.fulfilmentStatus === 'Dispatched' && req.body?.sendDispatchEmail === true,
        }))
      }

      res.json({
        order: updated,
        notification,
        warning: notification?.status === 'Failed'
          ? 'Order was dispatched, but the customer email failed and can be retried.'
          : '',
      })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
