import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { enqueueJob, registerJobHandler } from './jobQueueService.js'
import { publishIntegrationEvent } from './integrationService.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'notifications', 'registry.json')
const mutations = new Map()
const providers = new Map()
const MAX_HISTORY = 5000
const MAX_RECIPIENTS = 500
const DEFAULT_RATE_LIMIT = { windowMs: 60_000, maximum: 60 }

export class NotificationError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'NotificationError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    templates: [],
    recipients: [],
    deliveries: [],
    rateLimits: {},
    history: [],
    version: 1,
    updatedAt: nowIso(),
  }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.templates ||= []
  registry.recipients ||= []
  registry.deliveries ||= []
  registry.rateLimits ||= {}
  registry.history ||= []
  registry.version ||= 1
  return registry
}
async function mutate(operation) {
  const previous = mutations.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = structuredClone(await readRegistry())
    const result = await operation(registry)
    registry.version += 1
    registry.updatedAt = nowIso()
    registry.history = registry.history.slice(0, MAX_HISTORY)
    registry.deliveries = registry.deliveries.slice(0, MAX_HISTORY)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function requiredText(value, label, maximum = 500) {
  const result = String(value || '').trim()
  if (!result) throw new NotificationError(`${label} is required`, 422)
  if (result.length > maximum) throw new NotificationError(`${label} is too long`, 422)
  return result
}
function templateId(value) {
  const id = safeName(value)
  if (!id || id === 'file') throw new NotificationError('Template ID is required', 422)
  return id
}
function normaliseRecipient(input = {}) {
  const id = safeName(input.id || input.address || input.name)
  if (!id || id === 'file') throw new NotificationError('Recipient ID is required', 422)
  const provider = requiredText(input.provider, 'Recipient provider', 100)
  if (!providers.has(provider)) throw new NotificationError('Unknown notification provider', 422, { provider })
  const address = requiredText(input.address, 'Recipient address', 1000)
  return {
    id,
    name: String(input.name || id).trim().slice(0, 200),
    provider,
    address,
    enabled: input.enabled !== false,
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? structuredClone(input.metadata) : {},
  }
}
function renderString(source, variables) {
  return String(source || '').replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, key) => {
    let current = variables
    for (const part of key.split('.')) current = current && typeof current === 'object' ? current[part] : undefined
    return current === null || current === undefined ? '' : String(current)
  })
}
function renderTemplate(template, variables = {}) {
  return {
    subject: renderString(template.subject, variables),
    body: renderString(template.body, variables),
    data: template.data && typeof template.data === 'object' ? JSON.parse(renderString(JSON.stringify(template.data), variables)) : {},
  }
}
function rateLimit(input = {}, existing = null) {
  const windowMs = Math.min(86_400_000, Math.max(1000, Number(input.windowMs ?? existing?.windowMs ?? DEFAULT_RATE_LIMIT.windowMs)))
  const maximum = Math.min(10_000, Math.max(1, Number(input.maximum ?? existing?.maximum ?? DEFAULT_RATE_LIMIT.maximum)))
  return { windowMs, maximum }
}
function consumeRateLimit(registry, recipient) {
  const policy = rateLimit(registry.rateLimits[recipient.provider])
  const key = `${recipient.provider}:${recipient.id}`
  const now = Date.now()
  const current = registry.rateLimits[key] || { startedAt: now, count: 0 }
  if (now - current.startedAt >= policy.windowMs) {
    current.startedAt = now
    current.count = 0
  }
  if (current.count >= policy.maximum) throw new NotificationError('Notification rate limit exceeded', 429, { recipientId: recipient.id, retryAfterMs: policy.windowMs - (now - current.startedAt) })
  current.count += 1
  registry.rateLimits[key] = current
}

export function registerNotificationProvider(definition = {}) {
  const id = requiredText(definition.id, 'Provider ID', 100)
  if (!/^[a-z][a-z0-9._-]*$/i.test(id)) throw new NotificationError('Provider ID is invalid', 422)
  if (typeof definition.send !== 'function') throw new NotificationError('Provider requires a send function', 422)
  providers.set(id, Object.freeze({ id, label: String(definition.label || id), send: definition.send }))
  return { id, label: String(definition.label || id) }
}
export function listNotificationProviders() { return [...providers.values()].map(({ id, label }) => ({ id, label })).sort((a, b) => a.id.localeCompare(b.id)) }

registerNotificationProvider({
  id: 'in-app',
  label: 'In-app inbox',
  async send({ delivery }) { return { accepted: true, messageId: delivery.id } },
})
registerNotificationProvider({
  id: 'integration-event',
  label: 'Integration event',
  async send({ recipient, delivery, message }) {
    await publishIntegrationEvent(safeName(recipient.metadata.websiteId || 'global'), recipient.address, { deliveryId: delivery.id, recipient, message }, { notification: true })
    return { accepted: true, messageId: delivery.id }
  },
})

export async function getNotificationState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return { ...registry, deliveries: registry.deliveries.slice(0, limit), history: registry.history.slice(0, limit), providers: listNotificationProviders() }
}
export async function upsertNotificationTemplate(input = {}, actor = null) {
  const id = templateId(input.id || input.name)
  const name = requiredText(input.name || id, 'Template name', 200)
  const body = requiredText(input.body, 'Template body', 20_000)
  const subject = String(input.subject || '').trim().slice(0, 500)
  return mutate(registry => {
    const existing = registry.templates.find(item => item.id === id)
    const template = { id, name, subject, body, data: input.data && typeof input.data === 'object' ? structuredClone(input.data) : {}, enabled: input.enabled !== false, createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor, updatedAt: nowIso(), updatedBy: actor }
    registry.templates = [template, ...registry.templates.filter(item => item.id !== id)]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'notification.template-updated', templateId: id, actor, createdAt: nowIso() })
    return template
  })
}
export async function upsertNotificationRecipient(input = {}, actor = null) {
  const normalised = normaliseRecipient(input)
  return mutate(registry => {
    const existing = registry.recipients.find(item => item.id === normalised.id)
    const recipient = { ...normalised, createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor, updatedAt: nowIso(), updatedBy: actor }
    registry.recipients = [recipient, ...registry.recipients.filter(item => item.id !== recipient.id)]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'notification.recipient-updated', recipientId: recipient.id, actor, createdAt: nowIso() })
    return recipient
  })
}
export async function updateNotificationRateLimit(providerValue, input = {}, actor = null) {
  const provider = requiredText(providerValue, 'Provider', 100)
  if (!providers.has(provider)) throw new NotificationError('Unknown notification provider', 422)
  return mutate(registry => {
    const policy = rateLimit(input, registry.rateLimits[provider])
    registry.rateLimits[provider] = policy
    registry.history.unshift({ id: crypto.randomUUID(), action: 'notification.rate-limit-updated', provider, policy, actor, createdAt: nowIso() })
    return policy
  })
}
export async function queueNotification(input = {}, actor = null) {
  const registry = await readRegistry()
  const template = registry.templates.find(item => item.id === templateId(input.templateId))
  if (!template || !template.enabled) throw new NotificationError('Notification template was not found or is disabled', 404)
  const recipientIds = [...new Set((Array.isArray(input.recipientIds) ? input.recipientIds : [input.recipientId]).filter(Boolean).map(safeName))]
  if (!recipientIds.length) throw new NotificationError('At least one recipient is required', 422)
  if (recipientIds.length > MAX_RECIPIENTS) throw new NotificationError('Too many notification recipients', 413)
  const recipients = recipientIds.map(id => registry.recipients.find(item => item.id === id)).filter(item => item?.enabled)
  if (recipients.length !== recipientIds.length) throw new NotificationError('One or more recipients were not found or are disabled', 422)
  const variables = input.variables && typeof input.variables === 'object' ? structuredClone(input.variables) : {}
  const deduplicationKey = input.deduplicationKey ? requiredText(input.deduplicationKey, 'Deduplication key', 300) : crypto.createHash('sha256').update(JSON.stringify({ templateId: template.id, recipients: recipientIds, variables })).digest('hex')
  const jobs = []
  for (const recipient of recipients) {
    jobs.push(await enqueueJob({
      queue: 'notifications',
      handler: 'notification-delivery',
      priority: input.priority,
      scheduledFor: input.scheduledFor,
      timeoutMs: input.timeoutMs || 60_000,
      retry: input.retry,
      idempotencyKey: `${deduplicationKey}:${recipient.id}`,
      payload: { templateId: template.id, recipientId: recipient.id, variables, deduplicationKey, requestedBy: actor },
    }, actor))
  }
  return { queued: jobs.length, jobs, deduplicationKey }
}
export async function deliverNotification(input = {}) {
  const templateIdValue = templateId(input.templateId)
  const recipientId = safeName(input.recipientId)
  const currentActor = input.requestedBy || null
  const delivery = await mutate(async registry => {
    const template = registry.templates.find(item => item.id === templateIdValue)
    const recipient = registry.recipients.find(item => item.id === recipientId)
    if (!template || !template.enabled) throw new NotificationError('Notification template was not found or is disabled', 404)
    if (!recipient || !recipient.enabled) throw new NotificationError('Notification recipient was not found or is disabled', 404)
    const duplicate = registry.deliveries.find(item => item.deduplicationKey === input.deduplicationKey && item.recipientId === recipient.id && item.status === 'delivered')
    if (duplicate) return { ...duplicate, duplicate: true }
    consumeRateLimit(registry, recipient)
    const message = renderTemplate(template, input.variables || {})
    const record = { id: crypto.randomUUID(), templateId: template.id, recipientId: recipient.id, provider: recipient.provider, deduplicationKey: String(input.deduplicationKey || ''), message, status: 'sending', attempts: 1, createdAt: nowIso(), deliveredAt: null, failedAt: null, error: null, providerResult: null }
    registry.deliveries.unshift(record)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'notification.delivery-started', deliveryId: record.id, recipientId: recipient.id, createdAt: nowIso() })
    return { ...record, recipient, duplicate: false }
  })
  if (delivery.duplicate) return delivery
  await publishDomainEvent('notification.delivery-started', {
    accountId: currentActor?.id || null,
    deliveryId: delivery.id,
    templateId: delivery.templateId,
    provider: delivery.provider,
    status: delivery.status,
    attempts: delivery.attempts,
    createdAt: delivery.createdAt,
  }, currentActor)
  const provider = providers.get(delivery.provider)
  try {
    const result = await provider.send({ recipient: delivery.recipient, delivery, message: delivery.message })
    const completed = await mutate(registry => {
      const record = registry.deliveries.find(item => item.id === delivery.id)
      record.status = 'delivered'; record.deliveredAt = nowIso(); record.providerResult = result ?? null
      registry.history.unshift({ id: crypto.randomUUID(), action: 'notification.delivered', deliveryId: record.id, recipientId: record.recipientId, createdAt: nowIso() })
      return structuredClone(record)
    })
    await publishDomainEvent('notification.delivered', {
      accountId: currentActor?.id || null,
      deliveryId: completed.id,
      templateId: completed.templateId,
      provider: completed.provider,
      status: completed.status,
      attempts: completed.attempts,
      deliveredAt: completed.deliveredAt,
    }, currentActor)
    await writeStructuredLog('info', 'Notification delivered', { deliveryId: completed.id, provider: completed.provider, recipientId: completed.recipientId })
    return completed
  } catch (error) {
    const failed = await mutate(registry => {
      const record = registry.deliveries.find(item => item.id === delivery.id)
      if (record) { record.status = 'failed'; record.failedAt = nowIso(); record.error = error?.message || 'Notification delivery failed' }
      registry.history.unshift({ id: crypto.randomUUID(), action: 'notification.failed', deliveryId: delivery.id, recipientId: delivery.recipientId, error: error?.message || 'Notification delivery failed', createdAt: nowIso() })
      return record ? structuredClone(record) : { id: delivery.id, templateId: delivery.templateId, provider: delivery.provider, status: 'failed', attempts: delivery.attempts, failedAt: nowIso() }
    })
    await publishDomainEvent('notification.failed', {
      accountId: currentActor?.id || null,
      deliveryId: failed.id,
      templateId: failed.templateId,
      provider: failed.provider,
      status: failed.status,
      attempts: failed.attempts,
      failedAt: failed.failedAt,
      retryable: error?.status !== 400 && error?.status !== 401 && error?.status !== 403 && error?.status !== 404 && error?.status !== 422,
    }, currentActor)
    throw error
  }
}

registerJobHandler('notification-delivery', async ({ payload }) => deliverNotification(payload))
