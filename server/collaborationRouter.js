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
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null, role: req.session?.role || null } }
function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

export function createCollaborationRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getCollaborationState(req.query)))
  router.post('/sessions', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const session = await createCollaborationSession(req.body || {}, currentActor)
      await publishDomainEvent('collaboration.session-created', { accountId: currentActor.id, websiteId: session.websiteId, session }, currentActor)
      return session
    }, 201)
  })
  router.post('/sessions/:sessionId/heartbeat', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const session = await heartbeatSession(req.params.sessionId, req.body || {}, currentActor)
      await publishDomainEvent('collaboration.session-heartbeat', { accountId: currentActor.id, websiteId: session.websiteId, sessionId: session.id, cursor: session.cursor, selection: session.selection, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt }, currentActor)
      return session
    })
  })
  router.post('/sessions/:sessionId/close', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const session = await closeCollaborationSession(req.params.sessionId, currentActor)
      await publishDomainEvent('collaboration.session-closed', { accountId: currentActor.id, websiteId: session.websiteId, sessionId: session.id, closedAt: session.closedAt }, currentActor)
      return session
    })
  })
  router.post('/sessions/:sessionId/recover', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const session = await recoverCollaborationSession(req.params.sessionId, currentActor)
      await publishDomainEvent('collaboration.session-recovered', { accountId: currentActor.id, websiteId: session.websiteId, session }, currentActor)
      return session
    }, 201)
  })
  router.post('/locks', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const lock = await acquireRecordLock(req.body || {}, currentActor)
      await publishDomainEvent('collaboration.lock-acquired', { accountId: currentActor.id, websiteId: lock.websiteId, lock }, currentActor)
      return lock
    }, 201)
  })
  router.post('/locks/:lockId/release', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const lock = await releaseRecordLock(req.params.lockId, currentActor)
      await publishDomainEvent('collaboration.lock-released', { accountId: currentActor.id, websiteId: lock.websiteId, lockId: lock.id, releasedAt: lock.releasedAt }, currentActor)
      return lock
    })
  })
  router.post('/changes', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      try {
        const change = await appendCollaborationChange(req.body || {}, currentActor)
        await publishDomainEvent('collaboration.change-applied', { accountId: currentActor.id, websiteId: change.websiteId, change }, currentActor)
        return change
      } catch (error) {
        if (error.status === 409 && error.details) await publishDomainEvent('collaboration.conflict-detected', { accountId: currentActor.id, websiteId: error.details.websiteId, conflict: error.details }, currentActor)
        throw error
      }
    }, 201)
  })
  router.post('/conflicts/:conflictId/resolve', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const conflict = await resolveCollaborationConflict(req.params.conflictId, req.body || {}, currentActor)
      await publishDomainEvent('collaboration.conflict-resolved', { accountId: currentActor.id, websiteId: conflict.websiteId, conflict }, currentActor)
      return conflict
    })
  })
  return router
}
