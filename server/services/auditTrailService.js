import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'

const auditDir = path.join(DATA_DIR, 'audit-events')
const mutations = new Map()
const DEFAULT_RETENTION_DAYS = 365
const MAX_LIMIT = 500

export class AuditTrailError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'AuditTrailError'
    this.status = status
    this.details = details
  }
}

function websiteId(value) {
  const id = safeName(value || 'global')
  return id === 'file' ? 'global' : id
}

function eventPath(id) {
  return path.join(auditDir, `${id}.json`)
}

function configPath(id) {
  return path.join(auditDir, `${id}.config.json`)
}

function sanitise(value, depth = 0) {
  if (depth > 6) return '[depth-limited]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}…` : value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitise(item, depth + 1))
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (/password|secret|token|authorization|cookie|accesscode/i.test(key)) result[key] = '[redacted]'
    else result[key] = sanitise(item, depth + 1)
  }
  return result
}

function auditEventPayload(event, eventCount) {
  return {
    outcome: event?.outcome === 'failure' ? 'failure' : 'success',
    hasActor: Boolean(event?.actor),
    hasRequestContext: Boolean(event?.request),
    hasResource: Boolean(event?.resource),
    hasChanges: Boolean(event?.changes),
    metadataFieldCount: event?.metadata && typeof event.metadata === 'object' ? Object.keys(event.metadata).length : 0,
    eventCount: Number(eventCount) || 0,
  }
}

async function publishAuditTrailEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

async function mutate(id, operation) {
  const previous = mutations.get(id) || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const events = await readJson(eventPath(id), [])
    if (!Array.isArray(events)) throw new AuditTrailError('Stored audit trail is invalid', 500)
    const next = await operation(events)
    await writeJson(eventPath(id), next)
    return next
  })
  mutations.set(id, current)
  try { return await current } finally { if (mutations.get(id) === current) mutations.delete(id) }
}

export async function getAuditConfig(websiteValue) {
  const id = websiteId(websiteValue)
  return readJson(configPath(id), { websiteId: id, retentionDays: DEFAULT_RETENTION_DAYS, updatedAt: null })
}

export async function updateAuditConfig(websiteValue, input = {}) {
  const id = websiteId(websiteValue)
  const retentionDays = Math.min(3650, Math.max(1, Number(input.retentionDays) || DEFAULT_RETENTION_DAYS))
  const config = { websiteId: id, retentionDays, updatedAt: new Date().toISOString() }
  await writeJson(configPath(id), config)
  await publishAuditTrailEvent('audit.config-updated', { retentionDays })
  return config
}

export async function appendAuditEvent(input = {}) {
  const id = websiteId(input.websiteId)
  const timestamp = input.timestamp || new Date().toISOString()
  const event = {
    id: crypto.randomUUID(),
    websiteId: id,
    timestamp,
    category: String(input.category || 'system').trim().toLowerCase(),
    action: String(input.action || 'unknown').trim().toLowerCase(),
    outcome: String(input.outcome || 'success').trim().toLowerCase(),
    actor: sanitise(input.actor || null),
    request: sanitise(input.request || null),
    resource: sanitise(input.resource || null),
    changes: sanitise(input.changes || null),
    metadata: sanitise(input.metadata || {}),
  }
  const events = await mutate(id, existing => [event, ...existing])
  await publishAuditTrailEvent('audit.event-recorded', auditEventPayload(event, events.length))
  return event
}

export async function searchAuditEvents(websiteValue, options = {}) {
  const id = websiteId(websiteValue)
  const events = await readJson(eventPath(id), [])
  if (!Array.isArray(events)) throw new AuditTrailError('Stored audit trail is invalid', 500)
  const query = String(options.query || options.q || '').trim().toLowerCase()
  const from = options.from ? new Date(options.from) : null
  const to = options.to ? new Date(options.to) : null
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(options.limit) || 50))
  const offset = Math.max(0, Number(options.offset) || 0)
  let filtered = events.filter(event => {
    if (options.category && event.category !== String(options.category).toLowerCase()) return false
    if (options.action && event.action !== String(options.action).toLowerCase()) return false
    if (options.outcome && event.outcome !== String(options.outcome).toLowerCase()) return false
    if (options.actorId && String(event.actor?.id || event.actor?.email || '') !== String(options.actorId)) return false
    if (options.resourceType && String(event.resource?.type || '') !== String(options.resourceType)) return false
    if (options.resourceId && String(event.resource?.id || '') !== String(options.resourceId)) return false
    const time = new Date(event.timestamp)
    if (from && Number.isFinite(from.getTime()) && time < from) return false
    if (to && Number.isFinite(to.getTime()) && time > to) return false
    if (query && !JSON.stringify(event).toLowerCase().includes(query)) return false
    return true
  })
  const total = filtered.length
  filtered = filtered.slice(offset, offset + limit)
  return { total, offset, limit, hasMore: offset + limit < total, results: filtered }
}

export async function pruneAuditEvents(websiteValue, options = {}) {
  const id = websiteId(websiteValue)
  const config = await getAuditConfig(id)
  const retentionDays = Math.min(3650, Math.max(1, Number(options.retentionDays) || config.retentionDays || DEFAULT_RETENTION_DAYS))
  const cutoff = Date.now() - retentionDays * 86400000
  let removed = 0
  const events = await mutate(id, existing => {
    const kept = existing.filter(event => {
      const retain = new Date(event.timestamp).getTime() >= cutoff
      if (!retain) removed += 1
      return retain
    })
    return kept
  })
  await publishAuditTrailEvent('audit.events-pruned', {
    removedEventCount: removed,
    remainingEventCount: events.length,
    retentionDays,
  })
  return { removed, retentionDays }
}

export async function exportAuditEvents(websiteValue, options = {}) {
  const result = await searchAuditEvents(websiteValue, { ...options, limit: MAX_LIMIT, offset: 0 })
  const format = String(options.format || 'json').toLowerCase()
  if (format === 'json') return { format, contentType: 'application/json', data: JSON.stringify(result.results, null, 2) }
  if (format !== 'csv') throw new AuditTrailError('Unsupported audit export format', 422)
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const rows = [['id', 'timestamp', 'category', 'action', 'outcome', 'actor', 'resource']]
  for (const event of result.results) rows.push([event.id, event.timestamp, event.category, event.action, event.outcome, JSON.stringify(event.actor), JSON.stringify(event.resource)])
  return { format, contentType: 'text/csv; charset=utf-8', data: rows.map(row => row.map(quote).join(',')).join('\n') }
}

export function auditRequestContext(req) {
  return {
    method: req.method,
    path: req.originalUrl || req.url,
    requestId: req.headers['x-request-id'] || null,
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
  }
}
