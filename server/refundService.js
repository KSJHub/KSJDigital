import { restoreProductStock } from './merchValidation.js'
import { getOrder, recordOrderRefund } from './orderService.js'

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function paypalApiBase() {
  return process.env.PAYPAL_ENVIRONMENT === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

async function paypalAccessToken() {
  const credentials = Buffer.from(
    `${requiredEnv('PAYPAL_CLIENT_ID')}:${requiredEnv('PAYPAL_CLIENT_SECRET')}`,
  ).toString('base64')
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error_description || 'PayPal authentication failed')
  return data.access_token
}

async function refundStripe(order, amount, reason) {
  if (!order.providerTransactionId) throw new Error('Stripe payment reference is missing')
  const body = new URLSearchParams()
  body.set('payment_intent', order.providerTransactionId)
  body.set('amount', String(Math.round(amount * 100)))
  if (reason) body.set('metadata[reason]', reason)
  body.set('metadata[orderNumber]', order.orderNumber)

  const response = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEnv('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Stripe refund failed')
  if (data.status === 'failed' || data.failure_reason) {
    throw new Error(data.failure_reason || 'Stripe refund failed')
  }
  return { id: data.id, status: data.status || 'succeeded' }
}

async function refundPayPal(order, amount, reason) {
  if (!order.providerTransactionId) throw new Error('PayPal capture reference is missing')
  const token = await paypalAccessToken()
  const response = await fetch(
    `${paypalApiBase()}/v2/payments/captures/${encodeURIComponent(order.providerTransactionId)}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        amount: { currency_code: order.currency || 'GBP', value: amount.toFixed(2) },
        note_to_payer: reason || `Refund for order ${order.orderNumber}`,
      }),
    },
  )
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.details?.[0]?.description || data?.message || 'PayPal refund failed')
  }
  return { id: data.id, status: data.status || 'COMPLETED' }
}

export async function processOrderRefund(orderId, input = {}) {
  const order = await getOrder(orderId)
  if (!order) throw new Error('Order not found')
  if (!['stripe', 'paypal'].includes(order.provider)) throw new Error('This payment provider does not support managed refunds')

  const alreadyRefunded = roundMoney(order.refund?.totalAmount || 0)
  const remaining = roundMoney(Number(order.total || 0) - alreadyRefunded)
  if (remaining <= 0) throw new Error('This order has already been fully refunded')

  const requested = input.fullRefund === true || input.amount === '' || input.amount == null
    ? remaining
    : roundMoney(input.amount)
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('Refund amount must be greater than zero')
  if (requested > remaining) throw new Error(`Refund cannot exceed the remaining ${order.currency || 'GBP'} ${remaining.toFixed(2)}`)

  const fullRefund = requested >= remaining
  if (input.restoreStock === true && !fullRefund) {
    throw new Error('Stock can only be restored with a full refund')
  }
  if (input.restoreStock === true && order.refund?.stockRestored === true) {
    throw new Error('Stock has already been restored for this order')
  }

  const providerResult = order.provider === 'stripe'
    ? await refundStripe(order, requested, String(input.reason || '').trim())
    : await refundPayPal(order, requested, String(input.reason || '').trim())

  let restoredStock = false
  if (input.restoreStock === true) {
    for (const item of order.items || []) {
      if (item.fulfilment !== 'digital' && !item.madeToOrder) {
        await restoreProductStock(order.websiteId, item.productId, item.quantity, item.variant)
      }
    }
    restoredStock = true
  }

  const updated = await recordOrderRefund(order.id, {
    amount: requested,
    reason: input.reason,
    providerRefundId: providerResult.id,
    restoredStock,
  })
  return { order: updated, providerRefund: providerResult, fullRefund }
}
