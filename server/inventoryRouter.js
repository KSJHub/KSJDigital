import express from 'express'
import { paths, readJson, safeName } from './storage.js'

function canAccessWebsite(session, websiteId) {
  if (!session || !websiteId) return false
  if (session.role === 'owner') return true
  return (session.websiteIds || []).map(safeName).includes(safeName(websiteId))
}

function variantLabel(variant = {}) {
  return [variant.size, variant.colour].filter(Boolean).join(' / ') || 'Standard'
}

function stockHealth(product = {}) {
  if (!product.inventory?.trackStock) return []
  const variants = Array.isArray(product.inventory?.variants) ? product.inventory.variants : []

  if (variants.length) {
    return variants.map(variant => {
      const quantity = Math.max(0, Number(variant.quantity || 0))
      const threshold = Math.max(0, Number(variant.lowStockThreshold ?? product.inventory?.lowStockThreshold ?? 2))
      return {
        productId: product.id,
        productName: product.name,
        orderTag: product.orderTag || product.sku || product.type || 'ITEM',
        variant: { size: variant.size || '', colour: variant.colour || '' },
        variantLabel: variantLabel(variant),
        quantity,
        threshold,
        status: quantity === 0 ? 'Out of stock' : quantity <= threshold ? 'Low stock' : 'In stock',
        madeToOrder: product.fulfilmentOptions?.madeToOrder === true,
      }
    })
  }

  const quantity = Math.max(0, Number(product.inventory?.quantity || 0))
  const threshold = Math.max(0, Number(product.inventory?.lowStockThreshold ?? 2))
  return [{
    productId: product.id,
    productName: product.name,
    orderTag: product.orderTag || product.sku || product.type || 'ITEM',
    variant: { size: '', colour: '' },
    variantLabel: 'Standard',
    quantity,
    threshold,
    status: quantity === 0 ? 'Out of stock' : quantity <= threshold ? 'Low stock' : 'In stock',
    madeToOrder: product.fulfilmentOptions?.madeToOrder === true,
  }]
}

function movementHistory(orders = [], products = []) {
  const tracked = new Set(products.filter(product => product.inventory?.trackStock).map(product => product.id))
  const movements = []

  for (const order of orders) {
    for (const item of order.items || []) {
      if (!tracked.has(item.productId) || item.fulfilment === 'digital' || item.madeToOrder) continue
      movements.push({
        id: `${order.id}-${item.productId}-sale`,
        websiteId: order.websiteId,
        orderNumber: order.orderNumber,
        productId: item.productId,
        productName: item.name,
        variantLabel: variantLabel(item.variant),
        quantityChange: -Math.max(1, Number(item.quantity || 1)),
        reason: 'Paid order',
        createdAt: order.paidAt || order.createdAt,
      })
    }

    for (const refund of order.refund?.history || []) {
      if (!refund.restoredStock) continue
      for (const item of order.items || []) {
        if (!tracked.has(item.productId) || item.fulfilment === 'digital' || item.madeToOrder) continue
        movements.push({
          id: `${refund.id}-${item.productId}-restore`,
          websiteId: order.websiteId,
          orderNumber: order.orderNumber,
          productId: item.productId,
          productName: item.name,
          variantLabel: variantLabel(item.variant),
          quantityChange: Math.max(1, Number(item.quantity || 1)),
          reason: 'Refund stock restoration',
          createdAt: refund.createdAt,
        })
      }
    }
  }

  return movements
    .filter(item => item.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 100)
}

export function createInventoryRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    const websiteId = safeName(req.params.websiteId)
    if (!canAccessWebsite(req.session, websiteId)) {
      return res.status(403).json({ error: 'Website access denied' })
    }

    const content = await readJson(paths.content(websiteId), {})
    const products = Array.isArray(content.merch?.products) ? content.merch.products : []
    const allOrders = await readJson(paths.orders(), [])
    const orders = allOrders.filter(order => safeName(order.websiteId) === websiteId)
    const stock = products.flatMap(stockHealth)
    const alerts = stock.filter(item => item.status !== 'In stock')

    res.json({
      websiteId,
      summary: {
        trackedProducts: products.filter(product => product.inventory?.trackStock).length,
        readyUnits: stock.reduce((total, item) => total + item.quantity, 0),
        lowStock: alerts.filter(item => item.status === 'Low stock').length,
        outOfStock: alerts.filter(item => item.status === 'Out of stock').length,
      },
      stock,
      alerts,
      movements: movementHistory(orders, products),
    })
  })

  return router
}
