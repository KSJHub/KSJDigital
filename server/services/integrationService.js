import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'

const ROOT = path.join(DATA_DIR, 'integrations')
const locks = new Map()
const workers = new Map()
const workerRuns = new Map()
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_RESPONSE_TEXT = 2_000
const MAX_PAYLOAD_BYTES = 1_000_000
const DELIVERY_LEASE_MS = 10 * 60 * 1000
const PROTECTED_HEADERS = new Set(['content-type', 'user-agent', 'x-ksj-event', 'x-ksj-delivery', 'x-ksj-timestamp', 'x-ksj-signature-256'])
const SECRET_HEADERS = /authorization|cookie|token|secret|api[-_]?key/i

export class IntegrationError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'IntegrationError'
    this.status = status
    this.details = details
  }
}

const providers = new Map([
  ['webhook', { id: 'webhook', label: 'Generic Webhook', contentType: 'application/json', supportsSigning: true }],
  ['discord', { id: 'discord', label: 'Discord Webhook', contentType: 'application/json', supportsSigning: true }],
  ['slack', { id: 'slack', label: 'Slack Incoming Webhook', contentType: 'application/json', supportsSigning: true }],
])

export function registerIntegrationProvider(definition) {
  const id = String(definition?.id || '').trim()
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new IntegrationError('Provider id is invalid', 422)
  providers.set(id, { id, label: String(definition.label || id), contentType: definition.contentType || 'application/json', supportsSigning: definition.supportsSigning !== false })
  return { ...providers.get(id) }
}

function siteId(value) {
  const id = safeName(value)
  if (!id || id === 'file') throw new IntegrationError('Website id is required', 422)
  return id
}

function file(id) {
  return path.join(ROOT, `${id}.json`)
}

function initialStore(id) {
  return {
    websiteId: id,
    subscriptions: [],
    deliveries: [],
    settings: { enabled: true, workerIntervalMs: 15_000, deliveryRetentionDays: 90 },
    updatedAt: new Date().toISOString(),
  }
}

async function readStore(id) {
  const stored = await readJson(file(id), null)
  if (!stored) {
    const created = initialStore(id)
    await writeJson(file(id), created)
    return created
  }
  if (!Array.isArray(stored.subscriptions) || !Array.isArray(stored.deliveries)) throw new IntegrationError('Stored integration registry is invalid', 500)
  return stored
}

async function mutate(id, operation) {
  const previous = locks.get(id) || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const store = structuredClone(await readStore(id))
    const result = await operation(store)
    store.websiteId = id
    store.updatedAt = new Date().toISOString()
    await writeJson(file(id), store)
    return result === undefined ? store : result
  })
  locks.set(id, current)
  try { return await current } finally { if (locks.get(id) === current) locks.delete(id) }
}

function text(value, label, max = 200) {
  const result = String(value || '').trim()
  if (!result) throw new IntegrationError(`${label} is required`, 422)
  if (result.length > max) throw new IntegrationError(`${label} is too long`, 422)
  return result
}

function isPrivateAddress(address) {
  if (!address) return true
  if (net.isIPv4(address)) return address.startsWith('10.') || address.startsWith('127.') || address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(address) || address.startsWith('169.254.') || address === '0.0.0.0'
  const value = address.toLowerCase()
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') || value.startsWith('::ffff:127.') || value.startsWith('::ffff:10.') || value.startsWith('::ffff:192.168.')
}

function validateUrl(value) {
  let url
  try { url = new URL(String(value || '')) } catch { throw new IntegrationError('Webhook URL is invalid', 422) }
  if (url.protocol !== 'https:') throw new IntegrationError('Webhook URL must use HTTPS', 422)
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || isPrivateAddress(host)) throw new IntegrationError('Webhook URL cannot target a private network', 422)
  if (url.username || url.password) throw new IntegrationError('Webhook URL cannot contain credentials', 422)
  return url.toString()
}

async function assertPublicDestination(urlValue) {
  const url = new URL(urlValue)
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new IntegrationError('Webhook destination resolved to a private network', 422)
}

function provider(id) {
  const result = providers.get(String(id || 'webhook'))
  if (!result) throw new IntegrationError('Unknown integration provider', 422, { provider: id })
  return result
}

function events(value) {
  const list = [...new Set((Array.isArray(value) ? value : []).map(item => String(item).trim()).filter(Boolean))]
  if (!list.length) throw new IntegrationError('At least one event subscription is required', 422)
  if (list.some(item => !/^[a-z0-9*]+(?:[._-][a-z0-9*]+)*$/i.test(item))) throw new IntegrationError('Event subscription is invalid', 422)
  return list
}

function headers(value, existing = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return existing
  const result = {}
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = String(rawName).trim().toLowerCase()
    if (!/^[a-z0-9-]+$/.test(name) || PROTECTED_HEADERS.has(name)) throw new IntegrationError('Integration header is invalid or protected', 422, { header: rawName })
    const headerValue = String(rawValue)
    if (headerValue.length > 2000 || /[\r\n]/.test(headerValue)) throw new IntegrationError('Integration header value is invalid', 422, { header: rawName })
    result[name] = headerValue
  }
  return result
}

function matches(pattern, eventName) {
  if (pattern === '*') return true
  if (pattern.endsWith('.*')) return eventName === pattern.slice(0, -2) || eventName.startsWith(pattern.slice(0, -1))
  return pattern === eventName
}

function redactSubscription(subscription) {
  const redactedHeaders = Object.fromEntries(Object.entries(subscription.headers || {}).map(([name, value]) => [name, SECRET_HEADERS.test(name) ? '[configured]' : value]))
  return { ...subscription, secret: subscription.secret ? '[configured]' : null, headers: redactedHeaders }
}

function normaliseSubscription(input, existing = null) {
  const providerDefinition = provider(input.provider ?? existing?.provider ?? 'webhook')
  const now = new Date().toISOString()
  return {
    id: existing?.id || crypto.randomUUID(),
    name: text(input.name ?? existing?.name, 'Integration name'),
    provider: providerDefinition.id,
    url: validateUrl(input.url ?? existing?.url),
    events: events(input.events ?? existing?.events),
    enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
    secret: input.secret === undefined ? existing?.secret || crypto.randomBytes(32).toString('hex') : text(input.secret, 'Signing secret', 500),
    headers: input.headers === undefined ? existing?.headers || {} : headers(input.headers),
    maxAttempts: Math.min(12, Math.max(1, Number(input.maxAttempts ?? existing?.maxAttempts ?? 6))),
    timeoutMs: Math.min(30_000, Math.max(1_000, Number(input.timeoutMs ?? existing?.timeoutMs ?? DEFAULT_TIMEOUT_MS))),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

export function listIntegrationProviders() {
  return [...providers.values()].map(item => ({ ...item }))
}

export async function getIntegrationRegistry(websiteValue) {
  const store = await readStore(siteId(websiteValue))
  return { ...store, subscriptions: store.subscriptions.map(redactSubscription) }
}

export async function upsertIntegration(websiteValue, input = {}) {
  const id = siteId(websiteValue)
  return mutate(id, store => {
    const existing = input.id ? store.subscriptions.find(item => item.id === input.id) : null
    if (input.id && !existing) throw new IntegrationError('Integration not found', 404)
    const subscription = normaliseSubscription(input, existing)
    store.subscriptions = [subscription, ...store.subscriptions.filter(item => item.id !== subscription.id)]
    return redactSubscription(subscription)
  })
}

export async function deleteIntegration(websiteValue, integrationId) {
  const id = siteId(websiteValue)
  return mutate(id, store => {
    const existing = store.subscriptions.find(item => item.id === integrationId)
    if (!existing) throw new IntegrationError('Integration not found', 404)
    store.subscriptions = store.subscriptions.filter(item => item.id !== integrationId)
    store.deliveries = store.deliveries.filter(item => item.integrationId !== integrationId || item.status === 'delivered')
    return { deleted: true, id: integrationId }
  })
}

function deliveryPayload(eventName, payload, context) {
  const serialised = JSON.stringify(payload)
  if (Buffer.byteLength(serialised) > MAX_PAYLOAD_BYTES) throw new IntegrationError('Integration event payload is too large', 413)
  return { id: crypto.randomUUID(), event: eventName, createdAt: new Date().toISOString(), websiteId: context.websiteId, data: payload, context: context.metadata || {} }
}

export async function publishIntegrationEvent(websiteValue, eventNameValue, payload = {}, metadata = {}) {
  const id = siteId(websiteValue)
  const eventName = text(eventNameValue, 'Event name')
  return mutate(id, store => {
    if (store.settings?.enabled === false) return { queued: 0, deliveryIds: [] }
    const matched = store.subscriptions.filter(item => item.enabled && item.events.some(pattern => matches(pattern, eventName)))
    const now = new Date().toISOString()
    const eventPayload = deliveryPayload(eventName, payload, { websiteId: id, metadata })
    const created = matched.map(subscription => ({
      id: crypto.randomUUID(), integrationId: subscription.id, eventName, payload: eventPayload,
      status: 'pending', attempts: 0, nextAttemptAt: now, leaseUntil: null,
      createdAt: now, updatedAt: now, lastError: null, responseStatus: null, responseBody: null,
    }))
    store.deliveries.push(...created)
    return { queued: created.length, deliveryIds: created.map(item => item.id) }
  })
}

function bodyFor(subscription, delivery) {
  if (subscription.provider === 'discord') return JSON.stringify({ content: `**${delivery.eventName}**`, embeds: [{ description: JSON.stringify(delivery.payload.data).slice(0, 3500), timestamp: delivery.payload.createdAt }] })
  if (subscription.provider === 'slack') return JSON.stringify({ text: `*${delivery.eventName}*\n\`\`\`${JSON.stringify(delivery.payload.data).slice(0, 3000)}\`\`\`` })
  return JSON.stringify(delivery.payload)
}

function signature(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

async function deliver(subscription, delivery) {
  await assertPublicDestination(subscription.url)
  const body = bodyFor(subscription, delivery)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), subscription.timeoutMs)
  try {
    const response = await fetch(subscription.url, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: {
        'content-type': 'application/json', 'user-agent': 'KSJDigital-Webhook/1.0',
        'x-ksj-event': delivery.eventName, 'x-ksj-delivery': delivery.id, 'x-ksj-timestamp': timestamp,
        'x-ksj-signature-256': `sha256=${signature(subscription.secret, timestamp, body)}`,
        ...subscription.headers,
      }, body,
    })
    const responseBody = (await response.text()).slice(0, MAX_RESPONSE_TEXT)
    if (!response.ok) throw Object.assign(new Error(`Webhook returned HTTP ${response.status}`), { responseStatus: response.status, responseBody })
    return { status: response.status, body: responseBody }
  } finally { clearTimeout(timeout) }
}

function retryAt(attempts) {
  const seconds = Math.min(21_600, 30 * (2 ** Math.max(0, attempts - 1)))
  return new Date(Date.now() + seconds * 1000).toISOString()
}

async function claimDeliveries(id, limit) {
  return mutate(id, store => {
    const now = Date.now()
    for (const item of store.deliveries) {
      if (item.status === 'processing' && (!item.leaseUntil || new Date(item.leaseUntil).getTime() <= now)) {
        Object.assign(item, { status: 'retrying', nextAttemptAt: new Date().toISOString(), leaseUntil: null, lastError: 'Recovered after interrupted delivery' })
      }
    }
    const due = store.deliveries.filter(item => ['pending', 'retrying'].includes(item.status) && new Date(item.nextAttemptAt).getTime() <= now).slice(0, limit)
    const leaseUntil = new Date(now + DELIVERY_LEASE_MS).toISOString()
    for (const item of due) Object.assign(item, { status: 'processing', leaseUntil, updatedAt: new Date().toISOString() })
    return structuredClone(due)
  })
}

export async function processIntegrationQueue(websiteValue, options = {}) {
  const id = siteId(websiteValue)
  const limit = Math.min(100, Math.max(1, Number(options.limit || 20)))
  const claimed = await claimDeliveries(id, limit)
  const results = []
  for (const queued of claimed) {
    const currentStore = await readStore(id)
    const subscription = currentStore.subscriptions.find(item => item.id === queued.integrationId)
    if (!subscription || !subscription.enabled) {
      await mutate(id, current => {
        const item = current.deliveries.find(entry => entry.id === queued.id)
        if (item) Object.assign(item, { status: 'cancelled', leaseUntil: null, updatedAt: new Date().toISOString(), lastError: 'Integration is disabled or missing' })
      })
      results.push({ id: queued.id, status: 'cancelled' })
      continue
    }
    try {
      const response = await deliver(subscription, queued)
      await mutate(id, current => {
        const item = current.deliveries.find(entry => entry.id === queued.id)
        if (item) Object.assign(item, { status: 'delivered', attempts: item.attempts + 1, leaseUntil: null, deliveredAt: new Date().toISOString(), updatedAt: new Date().toISOString(), responseStatus: response.status, responseBody: response.body, lastError: null })
      })
      results.push({ id: queued.id, status: 'delivered' })
    } catch (error) {
      let resultStatus = 'failed'
      await mutate(id, current => {
        const item = current.deliveries.find(entry => entry.id === queued.id)
        if (!item) return
        const attempts = item.attempts + 1
        resultStatus = attempts >= subscription.maxAttempts ? 'failed' : 'retrying'
        Object.assign(item, {
          attempts, status: resultStatus, leaseUntil: null, nextAttemptAt: retryAt(attempts), updatedAt: new Date().toISOString(),
          lastError: error.name === 'AbortError' ? 'Webhook request timed out' : String(error.message || error),
          responseStatus: error.responseStatus || null, responseBody: error.responseBody || null,
        })
      })
      results.push({ id: queued.id, status: resultStatus })
    }
  }
  return { processed: results.length, results }
}

export async function retryIntegrationDelivery(websiteValue, deliveryId) {
  const id = siteId(websiteValue)
  return mutate(id, store => {
    const delivery = store.deliveries.find(item => item.id === deliveryId)
    if (!delivery) throw new IntegrationError('Delivery not found', 404)
    Object.assign(delivery, { status: 'pending', attempts: 0, nextAttemptAt: new Date().toISOString(), leaseUntil: null, updatedAt: new Date().toISOString(), lastError: null })
    return delivery
  })
}

export async function searchIntegrationDeliveries(websiteValue, query = {}) {
  const store = await readStore(siteId(websiteValue))
  let results = [...store.deliveries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (query.integrationId) results = results.filter(item => item.integrationId === query.integrationId)
  if (query.status) results = results.filter(item => item.status === query.status)
  if (query.event) results = results.filter(item => item.eventName === query.event)
  const total = results.length
  const offset = Math.max(0, Number(query.offset || 0))
  const limit = Math.min(200, Math.max(1, Number(query.limit || 50)))
  return { total, offset, limit, hasMore: offset + limit < total, results: results.slice(offset, offset + limit) }
}

export async function updateIntegrationSettings(websiteValue, input = {}) {
  const id = siteId(websiteValue)
  return mutate(id, store => {
    store.settings = {
      enabled: input.enabled === undefined ? store.settings?.enabled !== false : input.enabled === true,
      workerIntervalMs: Math.min(300_000, Math.max(5_000, Number(input.workerIntervalMs ?? store.settings?.workerIntervalMs ?? 15_000))),
      deliveryRetentionDays: Math.min(3650, Math.max(1, Number(input.deliveryRetentionDays ?? store.settings?.deliveryRetentionDays ?? 90))),
    }
    return store.settings
  })
}

export async function pruneIntegrationDeliveries(websiteValue) {
  const id = siteId(websiteValue)
  return mutate(id, store => {
    const cutoff = Date.now() - Number(store.settings?.deliveryRetentionDays || 90) * 86_400_000
    const before = store.deliveries.length
    store.deliveries = store.deliveries.filter(item => !['delivered', 'failed', 'cancelled'].includes(item.status) || new Date(item.updatedAt).getTime() >= cutoff)
    return { removed: before - store.deliveries.length, remaining: store.deliveries.length }
  })
}

export async function listIntegrationWebsiteIds() {
  const { readdir } = await import('node:fs/promises')
  try { return (await readdir(ROOT)).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
}

export function startIntegrationWorker(options = {}) {
  const tickMs = Math.max(5_000, Number(options.tickMs || 5_000))
  const key = 'global-worker'
  if (workers.has(key)) return workers.get(key)
  const run = async () => {
    for (const id of await listIntegrationWebsiteIds()) {
      try {
        const store = await readStore(id)
        const intervalMs = Math.max(5_000, Number(store.settings?.workerIntervalMs || 15_000))
        const lastRun = workerRuns.get(id) || 0
        if (Date.now() - lastRun < intervalMs) continue
        workerRuns.set(id, Date.now())
        await processIntegrationQueue(id)
        await pruneIntegrationDeliveries(id)
      } catch (error) { console.error(`Integration worker failed for ${id}`, error) }
    }
  }
  const timer = setInterval(run, tickMs)
  timer.unref?.()
  workers.set(key, timer)
  run().catch(error => console.error('Integration worker startup failed', error))
  return timer
}
