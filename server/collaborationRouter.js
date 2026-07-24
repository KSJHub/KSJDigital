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
  router.post('/sessions', (req, res, next) => handle(res, next, () => createCollaborationSession(req.body || {}, actor(req)), 201))
  router.post('/sessions/:sessionId/heartbeat', (req, res, next) => handle(res, next, () => heartbeatSession(req.params.sessionId, req.body || {}, actor(req))))
  router.post('/sessions/:sessionId/close', (req, res, next) => handle(res, next, () => closeCollaborationSession(req.params.sessionId, actor(req))))
  router.post('/sessions/:sessionId/recover', (req, res, next) => handle(res, next, () => recoverCollaborationSession(req.params.sessionId, actor(req)), 201))
  router.post('/locks', (req, res, next) => handle(res, next, () => acquireRecordLock(req.body || {}, actor(req)), 201))
  router.post('/locks/:lockId/release', (req, res, next) => handle(res, next, () => releaseRecordLock(req.params.lockId, actor(req))))
  router.post('/changes', (req, res, next) => handle(res, next, () => appendCollaborationChange(req.body || {}, actor(req)), 201))
  router.post('/conflicts/:conflictId/resolve', (req, res, next) => handle(res, next, () => resolveCollaborationConflict(req.params.conflictId, req.body || {}, actor(req))))
  return router
}
