import express from 'express'
import {
  acquireRecordLock,
  appendCollaborationChange,
  closeCollaborationSession,
  createCollaborationSession,
  getCollaborationState,
  heartbeatSession,
  recoverCollaborationSession,
  releaseRecordLock,
  resolveCollaborationConflict,
} from './services/collaborationService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}

function actor(req) {
  return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null, role: req.session?.role || null }
}

function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

function collaborationRegistryPayload(state = {}, subject = {}, details = {}) {
  const sessions = Array.isArray(state.sessions) ? state.sessions : []
  const locks = Array.isArray(state.locks) ? state.locks : []
  const changes = Array.isArray(state.changes) ? state.changes : []
  const conflicts = Array.isArray(state.conflicts) ? state.conflicts : []
  return {
    sessionCount: sessions.length,
    activeSessionCount: sessions.filter(item => item.status === 'active').length,
    lockCount: locks.length,
    activeLockCount: locks.filter(item => item.status === 'active').length,
    changeCount: changes.length,
    conflictCount: conflicts.length,
    openConflictCount: conflicts.filter(item => item.status === 'open').length,
    hasCursor: Boolean(subject.cursor),
    hasSelection: Boolean(subject.selection),
    metadataFieldCount: subject.metadata && typeof subject.metadata === 'object' ? Object.keys(subject.metadata).length : 0,
    version: Number(subject.version) || 0,
    created: details.created === true,
    heartbeat: details.heartbeat === true,
    closed: details.closed === true,
    recovered: details.recovered === true,
    acquired: details.acquired === true,
    released: details.released === true,
    applied: details.applied === true,
    conflictDetected: details.conflictDetected === true,
    resolved: details.resolved === true,
  }
}

async function publishCollaborationRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export function createCollaborationRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getCollaborationState(req.query)))

  router.post('/sessions', (req, res, next) => handle(res, next, async () => {
    const session = await createCollaborationSession(req.body || {}, actor(req))
    const state = await getCollaborationState({ limit: 1000 })
    await publishCollaborationRealtimeEvent('collaboration.session-created', collaborationRegistryPayload(state, session, { created: true }))
    return session
  }, 201))

  router.post('/sessions/:sessionId/heartbeat', (req, res, next) => handle(res, next, async () => {
    const session = await heartbeatSession(req.params.sessionId, req.body || {}, actor(req))
    const state = await getCollaborationState({ limit: 1000 })
    await publishCollaborationRealtimeEvent('collaboration.session-heartbeat', collaborationRegistryPayload(state, session, { heartbeat: true }))
    return session
  }))

  router.post('/sessions/:sessionId/close', (req, res, next) => handle(res, next, async () => {
    const state = await getCollaborationState({ limit: 1000 })
    const existing = state.sessions.find(item => item.id === req.params.sessionId)
    if (existing?.status === 'closed') return existing
    const session = await closeCollaborationSession(req.params.sessionId, actor(req))
    const updatedState = await getCollaborationState({ limit: 1000 })
    await publishCollaborationRealtimeEvent('collaboration.session-closed', collaborationRegistryPayload(updatedState, session, { closed: true }))
    return session
  }))

  router.post('/sessions/:sessionId/recover', (req, res, next) => handle(res, next, async () => {
    const session = await recoverCollaborationSession(req.params.sessionId, actor(req))
    const state = await getCollaborationState({ limit: 1000 })
    await publishCollaborationRealtimeEvent('collaboration.session-recovered', collaborationRegistryPayload(state, session, { recovered: true }))
    return session
  }, 201))

  router.post('/locks', (req, res, next) => handle(res, next, async () => {
    const lock = await acquireRecordLock(req.body || {}, actor(req))
    const state = await getCollaborationState({ limit: 1000 })
    await publishCollaborationRealtimeEvent('collaboration.lock-acquired', collaborationRegistryPayload(state, lock, { acquired: true }))
    return lock
  }, 201))

  router.post('/locks/:lockId/release', (req, res, next) => handle(res, next, async () => {
    const state = await getCollaborationState({ limit: 1000 })
    const existing = state.locks.find(item => item.id === req.params.lockId)
    if (existing?.status === 'released') return existing
    const lock = await releaseRecordLock(req.params.lockId, actor(req))
    const updatedState = await getCollaborationState({ limit: 1000 })
    await publishCollaborationRealtimeEvent('collaboration.lock-released', collaborationRegistryPayload(updatedState, lock, { released: true }))
    return lock
  }))

  router.post('/changes', (req, res, next) => handle(res, next, async () => {
    try {
      const change = await appendCollaborationChange(req.body || {}, actor(req))
      const state = await getCollaborationState({ limit: 1000 })
      await publishCollaborationRealtimeEvent('collaboration.change-applied', collaborationRegistryPayload(state, change, { applied: true }))
      return change
    } catch (error) {
      if (error.status === 409 && error.details) {
        const state = await getCollaborationState({ limit: 1000 })
        await publishCollaborationRealtimeEvent('collaboration.conflict-detected', collaborationRegistryPayload(state, error.details, { conflictDetected: true }))
      }
      throw error
    }
  }, 201))

  router.post('/conflicts/:conflictId/resolve', (req, res, next) => handle(res, next, async () => {
    const conflict = await resolveCollaborationConflict(req.params.conflictId, req.body || {}, actor(req))
    const state = await getCollaborationState({ limit: 1000 })
    await publishCollaborationRealtimeEvent('collaboration.conflict-resolved', collaborationRegistryPayload(state, conflict, { resolved: true }))
    return conflict
  }))

  return router
}
