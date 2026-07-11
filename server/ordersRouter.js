import express from 'express'
import { getCommerceSettings } from './commerceSettingsRouter.js'
import { sendDispatchNotification } from './orderNotificationService.js'
import { getOrder, listOrders, purgeTestOrders, updateOrderStatus } from './orderService.js'

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

function trackingDetails(input = {}, status = '') {
  const courier = String(input.courier || '').trim()
  const number = String(input.number || '').trim()
  const customUrl = String(input.url || '').trim()

  if (status === 'Dispatched' && (!courier || !number)) {
    throw new Error('Courier and tracking number are required before dispatch')
  }

  let url = customUrl
  if (!url && courier && number && TRACKING_URLS[courier]) url = TRACKING_URLS[courier](number)
  if (url) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') throw new Error('Tracking URL must use HTTPS')
  }

  return {
    courier,
    number,
    url,
    dispatchedAt: status === 'Dispatched' ? new Date().toISOString() : input.dispatchedAt || '',
  }
}

export function createOrdersRouter() {
  const router = express.Router()

  router.get('/', async (req, res) => {
    const websiteIds = req.session?.role === 'owner' ? null : req.session?.websiteIds || []
    res.json(await listOrders(websiteIds))
  })

  router.delete('/test-data', async (req, res) => {
    if (req.session?.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' })
    }
    res.json(await purgeTestOrders(req.body?.websiteId || ''))
  })

  router.get('/:id', async (req, res) => {
    const order = await getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (!canAccessOrder(req.session, order)) return res.status(403).json({ error: 'Order access denied' })
    res.json(order)
  })

  router.patch('/:id/status', async (req, res) => {
    const order = await getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (!canAccessOrder(req.session, order)) return res.status(403).json({ error: 'Order access denied' })
    if (req.session.role !== 'owner' && !req.session.canEdit) {
      return res.status(403).json({ error: 'Edit permission required' })
    }

    try {
      const status = req.body?.status
      const tracking = req.body?.tracking
        ? trackingDetails(req.body.tracking, status)
        : order.tracking
      let updated = await updateOrderStatus(req.params.id, status, {
        tracking,
        internalNote: req.body?.internalNote,
      })

      const shouldNotify =
        status === 'Dispatched' &&
        (order.fulfilmentStatus !== 'Dispatched' || req.body?.sendDispatchEmail === true)

      if (shouldNotify) {
        const settings = await getCommerceSettings(order.websiteId)
        await sendDispatchNotification(updated, {
          ...settings,
          brandName: order.clientName || order.websiteId,
        })
        updated = await getOrder(order.id)
      }

      res.json(updated)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
