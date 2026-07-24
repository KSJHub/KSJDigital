import express from 'express'
import { completePasswordReset, createPasswordReset } from './credentialStore.js'
import { logoutAllAuthenticationSessions } from './services/authenticationService.js'
import { getAuthenticationState, revokeAccountSessions, revokeSessionById } from './services/authPersistenceService.js'
import { requireAssurance } from './services/mfaService.js'

function requireOwner(req, res, next) { if (req.session?.role === 'owner') return next(); return res.status(403).json({ error: 'Owner permission required' }) }
function actor(req) { return { id: req.session?.id || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) { Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next) }

export function createAuthenticationAdminRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/sessions', (req, res, next) => handle(res, next, () => getAuthenticationState(req.query)))
  router.delete('/sessions/:sessionId', requireAssurance(2), (req, res, next) => handle(res, next, () => revokeSessionById(req.params.sessionId, actor(req))))
  router.post('/logout-all', (req, res, next) => Promise.resolve(logoutAllAuthenticationSessions(req, res)).catch(next))
  router.post('/accounts/:accountId/logout-all', requireAssurance(2), (req, res, next) => handle(res, next, () => revokeAccountSessions(req.params.accountId, 'administrative-global-logout')))
  router.post('/accounts/:accountId/password-reset', requireAssurance(2), (req, res, next) => handle(res, next, () => createPasswordReset(req.params.accountId, req.body?.ttlMinutes), 201))
  return router
}

export function createPasswordResetPublicRouter() {
  const router = express.Router()
  router.post('/api/password-reset/complete', (req, res, next) => handle(res, next, async () => {
    await completePasswordReset(req.body?.accountId, req.body?.token, req.body?.password)
    await revokeAccountSessions(req.body?.accountId, 'password-reset')
    return { ok: true }
  }))
  return router
}
