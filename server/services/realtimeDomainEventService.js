import { publishEvent } from './eventBusService.js'
import { registerJobHandler } from './jobQueueService.js'
import { deliverNotification } from './notificationService.js'

function identifier(value) {
  const result = String(value || '').trim()
  return /^[a-zA-Z0-9._-]{1,200}$/.test(result) ? result : null
}

function eventOptions(payload = {}, actor = null, extraHeaders = {}) {
  const accountId = identifier(payload.accountId || actor?.id)
  const websiteId = identifier(payload.websiteId)
  return {
    source: 'domain',
    headers: {
      ...(accountId ? { accountId } : {}),
      ...(websiteId ? { websiteId } : {}),
      ...extraHeaders,
    },
  }
}

export async function publishDomainEvent(topic, payload = {}, actor = null, options = {}) {
  return publishEvent(topic, payload, {
    ...eventOptions(payload, actor, options.headers),
    correlationId: options.correlationId,
    causationId: options.causationId,
    source: options.source || 'domain',
  })
}

registerJobHandler('notification-delivery', async ({ payload }) => {
  try {
    const delivery = await deliverNotification(payload)
    await publishDomainEvent('notification.delivered', {
      deliveryId: delivery.id,
      recipientId: delivery.recipientId,
      provider: delivery.provider,
      templateId: delivery.templateId,
      accountId: payload.requestedBy?.id || null,
      websiteId: delivery.message?.data?.websiteId || null,
      status: delivery.status,
      deliveredAt: delivery.deliveredAt,
    }, payload.requestedBy)
    return delivery
  } catch (error) {
    await publishDomainEvent('notification.failed', {
      recipientId: payload.recipientId,
      templateId: payload.templateId,
      accountId: payload.requestedBy?.id || null,
      error: String(error?.message || error).slice(0, 2000),
    }, payload.requestedBy)
    throw error
  }
})
