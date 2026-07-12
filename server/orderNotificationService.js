import {
  buildBuyerOrderEmail,
  buildClientOrderEmail,
  buildDiscordOrderPayload,
} from './orderNotifications.js'
import { updateNotificationStatus } from './orderService.js'

async function sendResendEmail(message, settings = {}) {
  const apiKey = process.env.RESEND_API_KEY
  const from = settings.from || process.env.ORDER_EMAIL_FROM

  if (!apiKey) throw new Error('RESEND_API_KEY is not configured')
  if (!from) throw new Error('ORDER_EMAIL_FROM is not configured')
  if (!message.to) throw new Error('Email recipient is not configured')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      reply_to: message.replyTo || undefined,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Email provider rejected request: ${response.status} ${detail}`)
  }

  return response.json()
}

async function sendDiscordWebhook(payload, webhookUrl) {
  if (!webhookUrl) throw new Error('Discord order webhook is not configured')
  const url = new URL(webhookUrl)
  const validDiscordHost =
    url.hostname === 'discord.com' ||
    url.hostname.endsWith('.discord.com') ||
    url.hostname === 'discordapp.com' ||
    url.hostname.endsWith('.discordapp.com')

  if (url.protocol !== 'https:' || !validDiscordHost) {
    throw new Error('Discord webhook URL is invalid')
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Discord rejected request: ${response.status} ${detail}`)
  }
}

async function recordStatus(order, channel, status, errorMessage = '') {
  try {
    await updateNotificationStatus(order.id, channel, status, errorMessage)
  } catch (error) {
    console.error(`Unable to record ${channel} notification status for ${order.orderNumber}:`, error)
  }
}

async function deliver(order, channel, action) {
  try {
    const result = await action()
    await recordStatus(order, channel, 'Sent')
    return { channel, status: 'Sent', result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordStatus(order, channel, 'Failed', message)
    return { channel, status: 'Failed', error: message }
  }
}

function dispatchEmail(order, settings = {}) {
  const tracking = order.tracking || {}
  const lines = [
    `Hi ${order.customer?.name || 'there'},`,
    '',
    `Your order ${order.orderNumber} has been dispatched.`,
    '',
    `Courier: ${tracking.courier || 'Delivery service'}`,
    `Tracking number: ${tracking.number || 'Not supplied'}`,
  ]

  if (tracking.url) lines.push(`Track your order: ${tracking.url}`)
  lines.push('', settings.deliveryMessage || 'Please allow the courier time to activate tracking after dispatch.')
  if (settings.supportEmail) lines.push('', `Questions? Contact ${settings.supportEmail}`)
  lines.push('', `Thank you for ordering from ${settings.brandName || order.clientName || 'our store'}.`)

  return {
    to: order.customer?.email,
    replyTo: settings.replyTo || settings.supportEmail || '',
    subject: `${order.orderNumber} has been dispatched`,
    text: lines.join('\n'),
  }
}

function refundEmail(order, settings = {}) {
  const refund = settings.latestRefund || order.refund?.history?.at(-1) || {}
  const amount = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: order.currency || 'GBP',
  }).format(Number(refund.amount || 0))
  const fullRefund = order.refund?.fullyRefunded === true
  const lines = [
    `Hi ${order.customer?.name || 'there'},`,
    '',
    `${fullRefund ? 'A full refund' : 'A partial refund'} of ${amount} has been issued for order ${order.orderNumber}.`,
    refund.reason ? `Reason: ${refund.reason}` : '',
    '',
    'Your payment provider may take several working days to return the funds to your original payment method.',
  ]
  if (settings.supportEmail) lines.push('', `Questions? Contact ${settings.supportEmail}`)
  lines.push('', `${settings.brandName || order.clientName || 'Store'} support`)

  return {
    to: order.customer?.email,
    replyTo: settings.replyTo || settings.supportEmail || '',
    subject: `${order.orderNumber} refund confirmed`,
    text: lines.filter(Boolean).join('\n'),
  }
}

export async function sendOrderNotifications(order, settings = {}) {
  const buyerMessage = buildBuyerOrderEmail(order, settings)
  const clientMessage = buildClientOrderEmail(order, settings)
  const discordPayload = buildDiscordOrderPayload(order, settings)

  // These writes are intentionally sequential. Every channel updates the same
  // persisted order record, so parallel delivery could overwrite another
  // channel's status with stale data.
  const results = []
  results.push(await deliver(order, 'buyerEmail', () => sendResendEmail(buyerMessage, settings)))
  results.push(await deliver(order, 'clientEmail', () => sendResendEmail(clientMessage, settings)))
  results.push(await deliver(order, 'discord', () => sendDiscordWebhook(discordPayload, settings.discordWebhookUrl)))

  return {
    ok: results.every(result => result.status === 'Sent'),
    results,
  }
}

export async function sendDispatchNotification(order, settings = {}) {
  return deliver(order, 'dispatchEmail', () => sendResendEmail(dispatchEmail(order, settings), settings))
}

export async function sendRefundNotification(order, settings = {}) {
  return deliver(order, 'refundEmail', () => sendResendEmail(refundEmail(order, settings), settings))
}

export async function retryOrderNotification(order, channel, settings = {}) {
  if (channel === 'buyerEmail') {
    return deliver(order, channel, () => sendResendEmail(buildBuyerOrderEmail(order, settings), settings))
  }
  if (channel === 'clientEmail') {
    return deliver(order, channel, () => sendResendEmail(buildClientOrderEmail(order, settings), settings))
  }
  if (channel === 'discord') {
    return deliver(order, channel, () =>
      sendDiscordWebhook(buildDiscordOrderPayload(order, settings), settings.discordWebhookUrl),
    )
  }
  if (channel === 'dispatchEmail') return sendDispatchNotification(order, settings)
  if (channel === 'refundEmail') return sendRefundNotification(order, settings)
  throw new Error('Unknown notification channel')
}
