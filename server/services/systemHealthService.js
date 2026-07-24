import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { appendFile, mkdir, readdir, stat } from 'node:fs/promises'
import { DATA_DIR, readJson, writeJson } from '../storage.js'
import { publishIntegrationEvent } from './integrationService.js'

const ROOT = path.join(DATA_DIR, 'system-health')
const REGISTRY_FILE = path.join(ROOT, 'registry.json')
const LOG_FILE = path.join(ROOT, 'application.jsonl')
const locks = new Map()
const timers = new Map()
const processStartedAt = Date.now()
const DEFAULTS = {
  enabled: true,
  sampleIntervalMs: 15_000,
  retentionDays: 30,
  heartbeatStaleMs: 60_000,
  queueWarningDepth: 100,
  queueCriticalDepth: 500,
  memoryWarningPercent: 80,
  memoryCriticalPercent: 92,
  alertCooldownMs: 15 * 60_000,
}

export class SystemHealthError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'SystemHealthError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return { settings: { ...DEFAULTS }, heartbeats: {}, metrics: [], incidents: [], lastAlertAt: {}, updatedAt: nowIso() }
}

async function readRegistry() {
  const stored = await readJson(REGISTRY_FILE, null)
  if (!stored) {
    const created = initialRegistry()
    await writeJson(REGISTRY_FILE, created)
    return created
  }
  stored.settings = { ...DEFAULTS, ...(stored.settings || {}) }
  stored.heartbeats ||= {}
  stored.metrics ||= []
  stored.incidents ||= []
  stored.lastAlertAt ||= {}
  return stored
}

async function mutate(operation) {
  const previous = locks.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = structuredClone(await readRegistry())
    const result = await operation(registry)
    registry.updatedAt = nowIso()
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  locks.set('registry', current)
  try { return await current } finally { if (locks.get('registry') === current) locks.delete('registry') }
}

function sanitise(value, depth = 0) {
  if (depth > 6) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitise(item, depth + 1))
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = /password|secret|token|authorization|cookie|api[-_]?key/i.test(key) ? '[redacted]' : sanitise(item, depth + 1)
  }
  return result
}

export async function writeStructuredLog(level, message, context = {}) {
  const accepted = ['debug', 'info', 'warn', 'error', 'fatal']
  const normalisedLevel = accepted.includes(level) ? level : 'info'
  const entry = { id: crypto.randomUUID(), timestamp: nowIso(), level: normalisedLevel, message: String(message || ''), context: sanitise(context) }
  await mkdir(ROOT, { recursive: true })
  await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8')
  return entry
}

export async function recordWorkerHeartbeat(workerId, details = {}) {
  const id = String(workerId || '').trim()
  if (!/^[a-z0-9._-]+$/i.test(id)) throw new SystemHealthError('Worker id is invalid', 422)
  return mutate(registry => {
    const previous = registry.heartbeats[id] || {}
    registry.heartbeats[id] = { workerId: id, firstSeenAt: previous.firstSeenAt || nowIso(), lastSeenAt: nowIso(), status: details.status || 'running', details: sanitise(details) }
    return registry.heartbeats[id]
  })
}

async function directoryJsonFiles(directory) {
  try { return (await readdir(directory)).filter(name => name.endsWith('.json')) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
}

async function queueDepth(directory, collection) {
  let pending = 0
  let processing = 0
  let retrying = 0
  let failed = 0
  for (const name of await directoryJsonFiles(directory)) {
    const store = await readJson(path.join(directory, name), {})
    for (const item of Array.isArray(store[collection]) ? store[collection] : []) {
      if (item.status === 'pending') pending += 1
      else if (item.status === 'processing') processing += 1
      else if (item.status === 'retrying') retrying += 1
      else if (item.status === 'failed') failed += 1
    }
  }
  return { pending, processing, retrying, failed, active: pending + processing + retrying }
}

async function dependencyChecks() {
  const checks = []
  try {
    await mkdir(DATA_DIR, { recursive: true })
    const info = await stat(DATA_DIR)
    checks.push({ id: 'data-directory', status: info.isDirectory() ? 'healthy' : 'failed', checkedAt: nowIso() })
  } catch (error) { checks.push({ id: 'data-directory', status: 'failed', error: error.message, checkedAt: nowIso() }) }
  checks.push({ id: 'runtime', status: typeof fetch === 'function' ? 'healthy' : 'failed', node: process.version, checkedAt: nowIso() })
  return checks
}

function severityFor(metrics, settings, heartbeats, dependencies) {
  const staleWorkers = Object.values(heartbeats).filter(item => Date.now() - new Date(item.lastSeenAt).getTime() > settings.heartbeatStaleMs)
  const failedDependency = dependencies.some(item => item.status === 'failed')
  const queueDepthValue = Math.max(metrics.automationQueue.active, metrics.integrationQueue.active)
  if (failedDependency || queueDepthValue >= settings.queueCriticalDepth || metrics.memoryPercent >= settings.memoryCriticalPercent) return { status: 'critical', staleWorkers }
  if (staleWorkers.length || queueDepthValue >= settings.queueWarningDepth || metrics.memoryPercent >= settings.memoryWarningPercent) return { status: 'degraded', staleWorkers }
  return { status: 'healthy', staleWorkers }
}

async function maybeAlert(registry, snapshot) {
  if (snapshot.status === 'healthy') return
  const key = snapshot.status
  const last = new Date(registry.lastAlertAt[key] || 0).getTime()
  if (Date.now() - last < registry.settings.alertCooldownMs) return
  registry.lastAlertAt[key] = nowIso()
  const incident = { id: crypto.randomUUID(), status: snapshot.status, openedAt: nowIso(), summary: snapshot.reasons, metrics: snapshot.metrics }
  registry.incidents.push(incident)
  await writeStructuredLog(snapshot.status === 'critical' ? 'error' : 'warn', `System health ${snapshot.status}`, incident)
  publishIntegrationEvent('global', 'system.health.degraded', incident, { observability: true }).catch(() => {})
}

function applyRetention(registry) {
  const cutoff = Date.now() - Number(registry.settings.retentionDays || DEFAULTS.retentionDays) * 86_400_000
  registry.metrics = registry.metrics.filter(item => new Date(item.checkedAt || item.metrics?.timestamp || 0).getTime() >= cutoff).slice(-2000)
  registry.incidents = registry.incidents.filter(item => new Date(item.openedAt || 0).getTime() >= cutoff).slice(-1000)
}

export async function collectSystemHealth() {
  const automationQueue = await queueDepth(path.join(DATA_DIR, 'automations'), 'executions')
  const integrationQueue = await queueDepth(path.join(DATA_DIR, 'integrations'), 'deliveries')
  const dependencies = await dependencyChecks()
  return mutate(async registry => {
    const memory = process.memoryUsage()
    const systemTotal = os.totalmem()
    const metrics = {
      timestamp: nowIso(),
      uptimeSeconds: Math.floor((Date.now() - processStartedAt) / 1000),
      process: { pid: process.pid, node: process.version, rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal },
      system: { hostname: os.hostname(), platform: process.platform, loadAverage: os.loadavg(), freeMemoryBytes: os.freemem(), totalMemoryBytes: systemTotal },
      memoryPercent: systemTotal ? Number(((systemTotal - os.freemem()) / systemTotal * 100).toFixed(2)) : 0,
      automationQueue,
      integrationQueue,
    }
    const evaluated = severityFor(metrics, registry.settings, registry.heartbeats, dependencies)
    const reasons = []
    if (evaluated.staleWorkers.length) reasons.push(`${evaluated.staleWorkers.length} worker heartbeat(s) stale`)
    if (automationQueue.active >= registry.settings.queueWarningDepth) reasons.push(`Automation queue depth is ${automationQueue.active}`)
    if (integrationQueue.active >= registry.settings.queueWarningDepth) reasons.push(`Integration queue depth is ${integrationQueue.active}`)
    if (metrics.memoryPercent >= registry.settings.memoryWarningPercent) reasons.push(`System memory usage is ${metrics.memoryPercent}%`)
    if (dependencies.some(item => item.status === 'failed')) reasons.push('A service dependency check failed')
    const snapshot = { status: evaluated.status, reasons, metrics, dependencies, heartbeats: registry.heartbeats, checkedAt: nowIso() }
    registry.metrics.push(snapshot)
    await maybeAlert(registry, snapshot)
    applyRetention(registry)
    return snapshot
  })
}

export async function getSystemHealthHistory(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(500, Math.max(1, Number(query.limit || 100)))
  return { settings: registry.settings, incidents: registry.incidents.slice(-limit).reverse(), metrics: registry.metrics.slice(-limit).reverse(), heartbeats: registry.heartbeats }
}

export async function updateSystemHealthSettings(input = {}) {
  return mutate(registry => {
    const number = (key, min, max) => Math.min(max, Math.max(min, Number(input[key] ?? registry.settings[key] ?? DEFAULTS[key])))
    registry.settings = {
      enabled: input.enabled === undefined ? registry.settings.enabled !== false : input.enabled === true,
      sampleIntervalMs: number('sampleIntervalMs', 5000, 300000),
      retentionDays: number('retentionDays', 1, 3650),
      heartbeatStaleMs: number('heartbeatStaleMs', 10000, 3600000),
      queueWarningDepth: number('queueWarningDepth', 1, 1000000),
      queueCriticalDepth: number('queueCriticalDepth', 2, 2000000),
      memoryWarningPercent: number('memoryWarningPercent', 1, 99),
      memoryCriticalPercent: number('memoryCriticalPercent', 2, 100),
      alertCooldownMs: number('alertCooldownMs', 60000, 86400000),
    }
    if (registry.settings.queueCriticalDepth <= registry.settings.queueWarningDepth) registry.settings.queueCriticalDepth = registry.settings.queueWarningDepth + 1
    if (registry.settings.memoryCriticalPercent <= registry.settings.memoryWarningPercent) registry.settings.memoryCriticalPercent = Math.min(100, registry.settings.memoryWarningPercent + 1)
    applyRetention(registry)
    return registry.settings
  })
}

export function createRequestMetricsMiddleware() {
  return function requestMetrics(req, res, next) {
    const started = process.hrtime.bigint()
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
      writeStructuredLog(level, 'HTTP request', { method: req.method, path: req.originalUrl, statusCode: res.statusCode, durationMs: Number(durationMs.toFixed(2)), actorId: req.session?.userId || null }).catch(() => {})
    })
    next()
  }
}

export function startSystemHealthMonitor() {
  if (timers.has('monitor')) return timers.get('monitor')
  let lastSampleAt = 0
  const pulse = async () => {
    const registry = await readRegistry()
    if (registry.settings.enabled === false) return
    await Promise.all([
      recordWorkerHeartbeat('content-workflow', { status: 'running', supervised: true }),
      recordWorkerHeartbeat('integration-worker', { status: 'running', supervised: true }),
      recordWorkerHeartbeat('automation-worker', { status: 'running', supervised: true }),
      recordWorkerHeartbeat('system-health', { status: 'running' }),
    ])
    if (Date.now() - lastSampleAt < registry.settings.sampleIntervalMs) return
    lastSampleAt = Date.now()
    await collectSystemHealth()
  }
  const timer = setInterval(() => pulse().catch(error => console.error('System health monitor failed', error)), 5000)
  timer.unref?.()
  timers.set('monitor', timer)
  pulse().catch(error => console.error('System health startup check failed', error))
  return timer
}
