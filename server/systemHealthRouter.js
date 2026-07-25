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

function actor(req) {
  return {
    id: req.session?.userId || req.session?.email || 'system-health-observer',
    email: req.session?.email || null,
    role: req.session?.role || null,
  }
}

function healthMetadata(snapshot) {
  const heartbeats = Object.values(snapshot.heartbeats || {})
  const staleWorkers = heartbeats.filter(item => Date.now() - new Date(item.lastSeenAt).getTime() > 60_000)
  return {
    status: snapshot.status,
    reasons: Array.isArray(snapshot.reasons) ? snapshot.reasons : [],
    checkedAt: snapshot.checkedAt,
    memoryPercent: snapshot.metrics?.memoryPercent ?? null,
    automationQueue: snapshot.metrics?.automationQueue || null,
    integrationQueue: snapshot.metrics?.integrationQueue || null,
    dependencyCount: Array.isArray(snapshot.dependencies) ? snapshot.dependencies.length : 0,
    failedDependencyCount: Array.isArray(snapshot.dependencies) ? snapshot.dependencies.filter(item => item.status === 'failed').length : 0,
    workerCount: heartbeats.length,
    staleWorkerCount: staleWorkers.length,
  }
}

function sendError(res, error) {
  const body = { error: error.message || 'System health request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createSystemHealthRouter() {
  const router = express.Router()

  router.get('/', async (req, res) => {
    try {
      const snapshot = await collectSystemHealth()
      const currentActor = actor(req)
      await publishDomainEvent('system-health.checked', healthMetadata(snapshot), currentActor)
      if (snapshot.status !== 'healthy') {
        await publishDomainEvent('system-health.incident-detected', healthMetadata(snapshot), currentActor)
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
      const settings = await updateSystemHealthSettings(req.body || {})
      await publishDomainEvent('system-health.settings-updated', { settings }, actor(req))
      res.json(settings)
    } catch (error) { sendError(res, error) }
  })

  router.post('/logs', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const entry = await writeStructuredLog(req.body?.level, req.body?.message, req.body?.context || {})
      await publishDomainEvent('system-health.log-written', {
        logId: entry.id,
        level: entry.level,
        timestamp: entry.timestamp,
      }, actor(req))
      res.status(201).json(entry)
    } catch (error) { sendError(res, error) }
  })

  return router
}
