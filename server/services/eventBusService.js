import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'event-bus', 'registry.json')
const mutations = new Map()
const handlers = new Map()
const MAX_HISTORY = 5000
const MAX_EVENTS = 10000
const MAX_DELIVERIES = 25000
const DELIVERY_LOCK_TIMEOUT_MS = 60000
const DEFAULT_RETRY = { maximumAttempts: 5, baseDelayMs: 1000, maximumDelayMs: 300000 }
let workerTimer = null

export class EventBusError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'EventBusError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    topics: [], subscriptions: [], events: [], deliveries: [], deadLetters: [], history: [],
    statistics: { published: 0, delivered: 0, retried: 0, deadLettered: 0, replayed: 0, recovered: 0 },
    version: 1, updatedAt: nowIso(),
  }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.topics ||= []
  registry.subscriptions ||= []
  registry.events ||= []
  registry.deliveries ||= []
  registry.deadLetters ||= []
  registry.history ||= []
  registry.statistics = { ...initialRegistry().statistics, ...(registry.statistics || {}) }
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
    registry.events = registry.events.slice(0, MAX_EVENTS)
    registry.deliveries = registry.deliveries.slice(0, MAX_DELIVERIES)
    registry.deadLetters = registry.deadLetters.slice(0, MAX_DELIVERIES)
    registry.history = registry.history.slice(0, MAX_HISTORY)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function required(value, label, maximum = 500) {
  const result = String(value || '').trim()
  if (!result) throw new EventBusError(`${label} is required`, 422)
  if (result.length > maximum) throw new EventBusError(`${label} is too long`, 422)
  return result
}
function topicName(value) {
  const topic = required(value, 'Topic', 300).toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]*(\.[a-z0-9][a-z0-9._-]*)*$/.test(topic)) throw new EventBusError('Topic format is invalid', 422)
  return topic
}
function patternName(value) {
  const pattern = required(value, 'Topic pattern', 300).toLowerCase()
  if (!/^[a-z0-9*][a-z0-9*._-]*(\.[a-z0-9*][a-z0-9*._-]*)*$/.test(pattern)) throw new EventBusError('Topic pattern format is invalid', 422)
  return pattern
}
function subscriptionId(value) {
  const id = safeName(value)
  if (!id || id === 'file') throw new EventBusError('Subscription ID is required', 422)
  return id
}
function retryPolicy(input = {}, existing = null) {
  return {
    maximumAttempts: Math.min(100, Math.max(1, Number(input.maximumAttempts ?? existing?.maximumAttempts ?? DEFAULT_RETRY.maximumAttempts))),
    baseDelayMs: Math.min(3600000, Math.max(100, Number(input.baseDelayMs ?? existing?.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs))),
    maximumDelayMs: Math.min(86400000, Math.max(1000, Number(input.maximumDelayMs ?? existing?.maximumDelayMs ?? DEFAULT_RETRY.maximumDelayMs))),
  }
}
export function topicMatches(pattern, topic) {
  const patternParts = patternName(pattern).split('.')
  const topicParts = topicName(topic).split('.')
  function match(pi, ti) {
    if (pi === patternParts.length) return ti === topicParts.length
    if (patternParts[pi] === '**') {
      if (pi === patternParts.length - 1) return true
      for (let index = ti; index <= topicParts.length; index += 1) if (match(pi + 1, index)) return true
      return false
    }
    if (ti >= topicParts.length) return false
    if (patternParts[pi] !== '*' && patternParts[pi] !== topicParts[ti]) return false
    return match(pi + 1, ti + 1)
  }
  return match(0, 0)
}

export function registerEventHandler(name, handler) {
  const id = required(name, 'Handler name', 200)
  if (typeof handler !== 'function') throw new EventBusError('Event handler must be a function', 422)
  handlers.set(id, handler)
  return () => handlers.delete(id)
}

export async function getEventBusState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return {
    ...registry,
    events: registry.events.slice(0, limit),
    deliveries: registry.deliveries.slice(0, limit),
    deadLetters: registry.deadLetters.slice(0, limit),
    history: registry.history.slice(0, limit),
    registeredHandlers: [...handlers.keys()].sort(),
  }
}

export async function upsertSubscription(input = {}, actor = null) {
  const id = subscriptionId(input.id || input.name)
  return mutate(registry => {
    const existing = registry.subscriptions.find(item => item.id === id)
    const subscription = {
      id,
      name: String(input.name ?? existing?.name ?? id).trim().slice(0, 200),
      topicPattern: patternName(input.topicPattern ?? existing?.topicPattern),
      handler: required(input.handler ?? existing?.handler, 'Handler name', 200),
      enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
      retry: retryPolicy(input.retry || {}, existing?.retry),
      metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? structuredClone(input.metadata) : existing?.metadata || {},
      createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor,
      updatedAt: nowIso(), updatedBy: actor,
    }
    registry.subscriptions = [subscription, ...registry.subscriptions.filter(item => item.id !== id)]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'event-subscription.updated', subscriptionId: id, actor, createdAt: nowIso() })
    return subscription
  })
}

export async function deleteSubscription(idValue, actor = null) {
  const id = subscriptionId(idValue)
  return mutate(registry => {
    const existed = registry.subscriptions.some(item => item.id === id)
    registry.subscriptions = registry.subscriptions.filter(item => item.id !== id)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'event-subscription.deleted', subscriptionId: id, actor, createdAt: nowIso() })
    return { deleted: existed, id }
  })
}

export async function publishEvent(topicValue, payload = null, options = {}) {
  const topic = topicName(topicValue)
  return mutate(registry => {
    const event = {
      id: crypto.randomUUID(), topic, payload: structuredClone(payload),
      headers: options.headers && typeof options.headers === 'object' && !Array.isArray(options.headers) ? structuredClone(options.headers) : {},
      correlationId: options.correlationId ? String(options.correlationId).slice(0, 200) : null,
      causationId: options.causationId ? String(options.causationId).slice(0, 200) : null,
      source: options.source ? String(options.source).slice(0, 200) : 'internal',
      publishedAt: nowIso(), replayOfEventId: options.replayOfEventId || null,
    }
    if (!registry.topics.includes(topic)) registry.topics.unshift(topic)
    registry.events.unshift(event)
    const matched = registry.subscriptions.filter(item => item.enabled && topicMatches(item.topicPattern, topic))
    for (const subscription of matched) {
      registry.deliveries.unshift({
        id: crypto.randomUUID(), eventId: event.id, subscriptionId: subscription.id, status: 'pending',
        attempts: 0, nextAttemptAt: nowIso(), lockedAt: null, lockedBy: null, lastError: null,
        createdAt: nowIso(), deliveredAt: null,
      })
    }
    registry.statistics.published += 1
    registry.history.unshift({ id: crypto.randomUUID(), action: 'event.published', eventId: event.id, topic, deliveryCount: matched.length, createdAt: nowIso() })
    return { event, deliveryCount: matched.length }
  })
}

function retryDelay(subscription, attempts) {
  return Math.min(subscription.retry.maximumDelayMs, subscription.retry.baseDelayMs * (2 ** Math.max(0, attempts - 1)))
}

export async function recoverStaleEventDeliveries(options = {}) {
  const lockTimeoutMs = Math.min(3600000, Math.max(1000, Number(options.lockTimeoutMs || DELIVERY_LOCK_TIMEOUT_MS)))
  return mutate(registry => {
    const cutoff = Date.now() - lockTimeoutMs
    const stale = registry.deliveries.filter(item => item.status === 'processing' && (!item.lockedAt || new Date(item.lockedAt).getTime() <= cutoff))
    for (const delivery of stale) {
      delivery.status = 'pending'
      delivery.nextAttemptAt = nowIso()
      delivery.lockedAt = null
      delivery.lockedBy = null
      registry.history.unshift({ id: crypto.randomUUID(), action: 'event-delivery.recovered', deliveryId: delivery.id, createdAt: nowIso() })
    }
    registry.statistics.recovered += stale.length
    return { recovered: stale.length }
  })
}

export async function processEventDeliveries(options = {}) {
  const workerId = String(options.workerId || `worker-${process.pid}`)
  const limit = Math.min(100, Math.max(1, Number(options.limit || 25)))
  await recoverStaleEventDeliveries({ lockTimeoutMs: options.lockTimeoutMs })
  const claimed = await mutate(registry => {
    const now = Date.now()
    const candidates = registry.deliveries.filter(item => item.status === 'pending' && new Date(item.nextAttemptAt).getTime() <= now).slice(-limit)
    for (const delivery of candidates) { delivery.status = 'processing'; delivery.lockedAt = nowIso(); delivery.lockedBy = workerId }
    return candidates.map(item => item.id)
  })
  let processed = 0
  for (const deliveryId of claimed) {
    const snapshot = await readRegistry()
    const delivery = snapshot.deliveries.find(item => item.id === deliveryId)
    const event = snapshot.events.find(item => item.id === delivery?.eventId)
    const subscription = snapshot.subscriptions.find(item => item.id === delivery?.subscriptionId)
    if (!delivery || !event || !subscription) {
      await mutate(registry => { const current = registry.deliveries.find(item => item.id === deliveryId); if (current) current.status = 'cancelled' })
      continue
    }
    const handler = handlers.get(subscription.handler)
    try {
      if (!handler) throw new Error(`Handler is not registered: ${subscription.handler}`)
      await handler(structuredClone(event), { delivery: structuredClone(delivery), subscription: structuredClone(subscription) })
      await mutate(registry => {
        const current = registry.deliveries.find(item => item.id === deliveryId)
        if (!current) return
        current.status = 'delivered'; current.attempts += 1; current.deliveredAt = nowIso(); current.lockedAt = null; current.lockedBy = null; current.lastError = null
        registry.statistics.delivered += 1
        registry.history.unshift({ id: crypto.randomUUID(), action: 'event-delivery.succeeded', deliveryId, eventId: event.id, subscriptionId: subscription.id, createdAt: nowIso() })
      })
    } catch (error) {
      await mutate(registry => {
        const current = registry.deliveries.find(item => item.id === deliveryId)
        if (!current) return
        current.attempts += 1; current.lastError = String(error?.message || error).slice(0, 2000); current.lockedAt = null; current.lockedBy = null
        if (current.attempts >= subscription.retry.maximumAttempts) {
          current.status = 'dead-lettered'
          const deadLetter = { id: crypto.randomUUID(), deliveryId, eventId: event.id, subscriptionId: subscription.id, topic: event.topic, error: current.lastError, attempts: current.attempts, createdAt: nowIso(), replayedAt: null }
          registry.deadLetters.unshift(deadLetter)
          registry.statistics.deadLettered += 1
          registry.history.unshift({ id: crypto.randomUUID(), action: 'event-delivery.dead-lettered', deadLetterId: deadLetter.id, deliveryId, createdAt: nowIso() })
        } else {
          current.status = 'pending'
          current.nextAttemptAt = new Date(Date.now() + retryDelay(subscription, current.attempts)).toISOString()
          registry.statistics.retried += 1
        }
      })
    }
    processed += 1
  }
  return { claimed: claimed.length, processed }
}

export async function replayEvent(eventIdValue, actor = null) {
  const eventId = required(eventIdValue, 'Event ID', 100)
  const registry = await readRegistry()
  const event = registry.events.find(item => item.id === eventId)
  if (!event) throw new EventBusError('Event not found', 404)
  const result = await publishEvent(event.topic, event.payload, { headers: event.headers, correlationId: event.correlationId, causationId: event.id, source: 'replay', replayOfEventId: event.id })
  await mutate(current => { current.statistics.replayed += 1; current.history.unshift({ id: crypto.randomUUID(), action: 'event.replayed', sourceEventId: event.id, replayEventId: result.event.id, actor, createdAt: nowIso() }) })
  return result
}

export async function replayDeadLetter(deadLetterIdValue, actor = null) {
  const id = required(deadLetterIdValue, 'Dead-letter ID', 100)
  const registry = await readRegistry()
  const deadLetter = registry.deadLetters.find(item => item.id === id)
  if (!deadLetter) throw new EventBusError('Dead letter not found', 404)
  const result = await replayEvent(deadLetter.eventId, actor)
  await mutate(current => { const record = current.deadLetters.find(item => item.id === id); if (record) record.replayedAt = nowIso() })
  return result
}

export function startEventBusWorker(options = {}) {
  if (workerTimer) return workerTimer
  const intervalMs = Math.min(60000, Math.max(250, Number(options.intervalMs || process.env.EVENT_BUS_INTERVAL_MS || 1000)))
  const run = () => processEventDeliveries({ workerId: options.workerId }).catch(error => writeStructuredLog('error', 'Event bus worker failed', { error: error.message }))
  workerTimer = setInterval(run, intervalMs)
  workerTimer.unref?.()
  run()
  return workerTimer
}

export function stopEventBusWorker() {
  if (workerTimer) clearInterval(workerTimer)
  workerTimer = null
}
