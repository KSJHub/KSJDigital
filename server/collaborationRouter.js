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
function resourceMetadata(record = {}) {
  return { websiteId: record.websiteId, resourceType: record.resourceType, resourceId: record.resourceId }
}

export function createCollaborationRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getCollaborationState(req.query)))
  router.post('/sessions', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const session = await createCollaborationSession(req.body || {}, currentActor)
      await publishDomainEvent('collaboration.session-created', {
        accountId: currentActor.id,
        ...resourceMetadata(session),
        sessionId: session.id,
        participantId: session.participantId,
        status: session.status,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      }, currentActor)
      return session
    }, 201)
  })
  router.post('/sessions/:sessionId/heartbeat', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const session = await heartbeatSession(req.params.sessionId, req.body || {}, currentActor)
      await publishDomainEvent('collaboration.session-heartbeat', {
        accountId: currentActor.id,
        ...resourceMetadata(session),
        sessionId: session.id,
        participantId: session.participantId,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        hasCursor: Boolean(session.cursor),
        hasSelection: Boolean(session.selection),
      }, currentActor)
      return session
    })
  })
  router.post('/sessions/:sessionId/close', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const session = await closeCollaborationSession(req.params.sessionId, currentActor)
      await publishDomainEvent('collaboration.session-closed', {
        accountId: currentActor.id,
        ...resourceMetadata(session),
        sessionId: session.id,
        participantId: session.participantId,
        status: session.status,
        closedAt: session.closedAt,
      }, currentActor)
      return session
    })
  })
  router.post('/sessions/:sessionId/recover', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const session = await recoverCollaborationSession(req.params.sessionId, currentActor)
      await publishDomainEvent('collaboration.session-recovered', {
        accountId: currentActor.id,
        ...resourceMetadata(session),
        sessionId: session.id,
        participantId: session.participantId,
        recoveredFromSessionId: session.recoveredFromSessionId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      }, currentActor)
      return session
    }, 201)
  })
  router.post('/locks', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const lock = await acquireRecordLock(req.body || {}, currentActor)
      await publishDomainEvent('collaboration.lock-acquired', {
        accountId: currentActor.id,
        ...resourceMetadata(lock),
        lockId: lock.id,
        sessionId: lock.sessionId,
        participantId: lock.participantId,
        status: lock.status,
        expiresAt: lock.expiresAt,
      }, currentActor)
      return lock
    }, 201)
  })
  router.post('/locks/:lockId/release', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const lock = await releaseRecordLock(req.params.lockId, currentActor)
      await publishDomainEvent('collaboration.lock-released', {
        accountId: currentActor.id,
        ...resourceMetadata(lock),
        lockId: lock.id,
        sessionId: lock.sessionId,
        participantId: lock.participantId,
        status: lock.status,
        releasedAt: lock.releasedAt,
      }, currentActor)
      return lock
    })
  })
  router.post('/changes', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      try {
        const change = await appendCollaborationChange(req.body || {}, currentActor)
        await publishDomainEvent('collaboration.change-applied', {
          accountId: currentActor.id,
          ...resourceMetadata(change),
          changeId: change.id,
          sessionId: change.sessionId,
          participantId: change.participantId,
          version: change.version,
          baseVersion: change.baseVersion,
          operation: change.operation,
          path: change.path,
          clientChangeId: change.clientChangeId,
          createdAt: change.createdAt,
        }, currentActor)
        return change
      } catch (error) {
        if (error.status === 409 && error.details) {
          await publishDomainEvent('collaboration.conflict-detected', {
            accountId: currentActor.id,
            ...resourceMetadata(error.details),
            conflictId: error.details.id,
            sessionId: error.details.sessionId,
            baseVersion: error.details.baseVersion,
            currentVersion: error.details.currentVersion,
            status: error.details.status,
            createdAt: error.details.createdAt,
          }, currentActor)
        }
        throw error
      }
    }, 201)
  })
  router.post('/conflicts/:conflictId/resolve', (req, res, next) => {
    const currentActor = actor(req)
    handle(res, next, async () => {
      const conflict = await resolveCollaborationConflict(req.params.conflictId, req.body || {}, currentActor)
      await publishDomainEvent('collaboration.conflict-resolved', {
        accountId: currentActor.id,
        ...resourceMetadata(conflict),
        conflictId: conflict.id,
        sessionId: conflict.sessionId,
        baseVersion: conflict.baseVersion,
        currentVersion: conflict.currentVersion,
        status: conflict.status,
        resolution: conflict.resolution,
        resolvedAt: conflict.resolvedAt,
      }, currentActor)
      return conflict
    })
  })
  return router
}
