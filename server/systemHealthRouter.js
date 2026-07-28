import express from 'express'
import {
  collectSystemHealth,
  getSystemHealthHistory,
  updateSystemHealthSettings,
  writeStructuredLog,
} from './services/systemHealthService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function sendError(res, error) {
  const body = { error: error.message || 'System health request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

function healthRegistryPayload(snapshot = {}, history = {}, details = {}) {
  const heartbeats = Object.values(snapshot.heartbeats || history.heartbeats || {})
  const dependencies = Array.isArray(snapshot.dependencies) ? snapshot.dependencies : []
  const incidents = Array.isArray(history.incidents) ? history.incidents : []
  const metrics = Array.isArray(history.metrics) ? history.metrics : []
  const staleAfter = Number(history.settings?.heartbeatStaleMs) || 60_000
  const staleWorkers = heartbeats.filter(item => Date.now() - new Date(item.lastSeenAt).getTime() > staleAfter)
  const automationQueue = snapshot.metrics?.automationQueue || {}
  const integrationQueue = snapshot.metrics?.integrationQueue || {}
  return {
    healthy: snapshot.status === 'healthy',
    degraded: snapshot.status === 'degraded',
    critical: snapshot.status === 'critical',
    dependencyCount: dependencies.length,
    failedDependencyCount: dependencies.filter(item => item.status === 'failed').length,
    workerCount: heartbeats.length,
    staleWorkerCount: staleWorkers.length,
    metricSampleCount: metrics.length,
    incidentCount: incidents.length,
    automationQueueActiveCount: Number(automationQueue.active) || 0,
    automationQueueFailedCount: Number(automationQueue.failed) || 0,
    integrationQueueActiveCount: Number(integrationQueue.active) || 0,
    integrationQueueFailedCount: Number(integrationQueue.failed) || 0,
    enabled: history.settings?.enabled !== false,
    settingsChanged: details.settingsChanged === true,
    logWritten: details.logWritten === true,
    incidentCreated: details.incidentCreated === true,
  }
}

async function publishSystemHealthRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function normaliseSystemHealthSettings(input = {}, existing = {}) {
  const number = (key, min, max, fallback) => Math.min(max, Math.max(min, Number(input[key] ?? existing[key] ?? fallback)))
  const settings = {
    enabled: input.enabled === undefined ? existing.enabled !== false : input.enabled === true,
    sampleIntervalMs: number('sampleIntervalMs', 5000, 300000, 15000),
    retentionDays: number('retentionDays', 1, 3650, 30),
    heartbeatStaleMs: number('heartbeatStaleMs', 10000, 3600000, 60000),
    queueWarningDepth: number('queueWarningDepth', 1, 1000000, 100),
    queueCriticalDepth: number('queueCriticalDepth', 2, 2000000, 500),
    memoryWarningPercent: number('memoryWarningPercent', 1, 99, 80),
    memoryCriticalPercent: number('memoryCriticalPercent', 2, 100, 92),
    alertCooldownMs: number('alertCooldownMs', 60000, 86400000, 900000),
  }
  if (settings.queueCriticalDepth <= settings.queueWarningDepth) settings.queueCriticalDepth = settings.queueWarningDepth + 1
  if (settings.memoryCriticalPercent <= settings.memoryWarningPercent) settings.memoryCriticalPercent = Math.min(100, settings.memoryWarningPercent + 1)
  return settings
}

export function createSystemHealthRouter() {
  const router = express.Router()

  router.get('/', async (req, res) => {
    try {
      const before = await getSystemHealthHistory({ limit: 1 })
      const snapshot = await collectSystemHealth()
      const history = await getSystemHealthHistory({ limit: 500 })
      await publishSystemHealthRealtimeEvent('system-health.checked', healthRegistryPayload(snapshot, history))
      if (history.incidents.length > before.incidents.length) {
        await publishSystemHealthRealtimeEvent('system-health.incident-detected', healthRegistryPayload(snapshot, history, { incidentCreated: true }))
      }
      res.json(snapshot)
    } catch (error) { sendError(res, error) }
  })

  router.get('/history', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await getSystemHealthHistory(req.query)) } catch (error) { sendError(res, error) }
  })

  router.patch('/settings', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const history = await getSystemHealthHistory({ limit: 1 })
      const requested = normaliseSystemHealthSettings(req.body || {}, history.settings || {})
      if (JSON.stringify(requested) === JSON.stringify(history.settings || {})) return res.json(history.settings)
      const settings = await updateSystemHealthSettings(req.body || {})
      const updatedHistory = await getSystemHealthHistory({ limit: 500 })
      await publishSystemHealthRealtimeEvent('system-health.settings-updated', healthRegistryPayload({}, updatedHistory, { settingsChanged: true }))
      res.json(settings)
    } catch (error) { sendError(res, error) }
  })

  router.post('/logs', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const entry = await writeStructuredLog(req.body?.level, req.body?.message, req.body?.context || {})
      const history = await getSystemHealthHistory({ limit: 500 })
      await publishSystemHealthRealtimeEvent('system-health.log-written', healthRegistryPayload({}, history, { logWritten: true }))
      res.status(201).json(entry)
    } catch (error) { sendError(res, error) }
  })

  return router
}
