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
  if (
    url.protocol !== 'https:' ||
    (!url.hostname.endsWith('discord.com') && !url.hostname.endsWith('discordapp.com'))
  ) {
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

async function deliver(order, channel, action) {
  try {
    const result = await action()
    await updateNotificationStatus(order.id, channel, 'Sent')
    return { channel, status: 'Sent', result }
  } catch (error) {
    await updateNotificationStatus(order.id, channel, 'Failed', error.message)
    return { channel, status: 'Failed', error: error.message }
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

export async function sendOrderNotifications(order, settings = {}) {
  const buyerMessage = buildBuyerOrderEmail(order, settings)
  const clientMessage = buildClientOrderEmail(order, settings)
  const discordPayload = buildDiscordOrderPayload(order, settings)

  const results = await Promise.all([
    deliver(order, 'buyerEmail', () => sendResendEmail(buyerMessage, settings)),
    deliver(order, 'clientEmail', () => sendResendEmail(clientMessage, settings)),
    deliver(order, 'discord', () => sendDiscordWebhook(discordPayload, settings.discordWebhookUrl)),
  ])

  return {
    ok: results.every(result => result.status === 'Sent'),
    results,
  }
}

export async function sendDispatchNotification(order, settings = {}) {
  return deliver(order, 'dispatchEmail', () => sendResendEmail(dispatchEmail(order, settings), settings))
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
  if (channel === 'dispatchEmail') {
    return sendDispatchNotification(order, settings)
  }
  throw new Error('Unknown notification channel')
}
