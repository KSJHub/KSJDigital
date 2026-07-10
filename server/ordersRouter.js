import express from 'express'
import { getOrder, listOrders, purgeTestOrders, updateOrderStatus } from './orderService.js'

function canAccessOrder(session, order) {
  if (!session || !order) return false
  if (session.role === 'owner') return true
  return (session.websiteIds || []).includes(order.websiteId)
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
      const updated = await updateOrderStatus(req.params.id, req.body?.status, {
        tracking: req.body?.tracking,
        internalNote: req.body?.internalNote,
      })
      res.json(updated)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
