import express from 'express'
import { getCommerceSettings } from './commerceSettingsRouter.js'
import { sendRefundNotification } from './orderNotificationService.js'
import { getOrder } from './orderService.js'
import { processOrderRefund } from './refundService.js'

function canAccessOrder(session, order) {
  if (!session || !order) return false
  if (session.role === 'owner') return true
  return (session.websiteIds || []).includes(order.websiteId)
}

export function createRefundRouter() {
  const router = express.Router()

  router.post('/:id', async (req, res) => {
    const order = await getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (!canAccessOrder(req.session, order)) {
      return res.status(403).json({ error: 'Order access denied' })
    }
    if (req.session.role !== 'owner' && !req.session.canEdit) {
      return res.status(403).json({ error: 'Edit permission required' })
    }

    try {
      const result = await processOrderRefund(order.id, {
        amount: req.body?.amount,
        fullRefund: req.body?.fullRefund === true,
        reason: req.body?.reason,
        restoreStock: req.body?.restoreStock === true,
      })

      const settings = await getCommerceSettings(order.websiteId)
      const notification = await sendRefundNotification(result.order, {
        ...settings,
        brandName: order.clientName || order.websiteId,
        latestRefund: result.order.refund?.history?.at(-1),
      })

      res.json({
        ...result,
        notification,
        warning: [
          result.warning,
          notification.status === 'Failed'
            ? 'Refund completed, but the customer email failed and can be retried from the order.'
            : '',
        ].filter(Boolean).join(' '),
      })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
