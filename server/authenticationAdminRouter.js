import express from 'express'
import { completePasswordReset, createPasswordReset } from './credentialStore.js'
import { logoutAllAuthenticationSessions } from './services/authenticationService.js'
import { getAuthenticationState, revokeAccountSessions, revokeSessionById } from './services/authPersistenceService.js'
import { requireAssurance } from './services/mfaService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) { if (req.session?.role === 'owner') return next(); return res.status(403).json({ error: 'Owner permission required' }) }
function actor(req) { return { id: req.session?.id || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) { Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next) }
async function publishAuthenticationEvent(topic, payload) { await publishDomainEvent(topic, payload) }

export function createAuthenticationAdminRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/sessions', (req, res, next) => handle(res, next, () => getAuthenticationState(req.query)))
  router.delete('/sessions/:sessionId', requireAssurance(2), (req, res, next) => handle(res, next, async () => {
    const result = await revokeSessionById(req.params.sessionId, actor(req))
    if (result.revocationApplied) {
      await publishAuthenticationEvent('authentication.session-revoked', {
        revoked: true,
        reason: result.session.revocationReason || 'administrative-revocation',
        assuranceLevel: 2,
      })
    }
    return result.session
  }))
  router.post('/logout-all', (req, res, next) => Promise.resolve(logoutAllAuthenticationSessions(req, res)).catch(next))
  router.post('/accounts/:accountId/logout-all', requireAssurance(2), (req, res, next) => handle(res, next, async () => {
    const result = await revokeAccountSessions(req.params.accountId, 'administrative-global-logout')
    if (result.revoked > 0) {
      await publishAuthenticationEvent('authentication.account-sessions-revoked', {
        revokedCount: result.revoked,
        reason: 'administrative-global-logout',
        assuranceLevel: 2,
      })
    }
    return result
  }))
  router.post('/accounts/:accountId/password-reset', requireAssurance(2), (req, res, next) => handle(res, next, async () => {
    const result = await createPasswordReset(req.params.accountId, req.body?.ttlMinutes)
    await publishAuthenticationEvent('authentication.password-reset-issued', {
      expiresAt: result.expiresAt,
      assuranceLevel: 2,
    })
    return result
  }, 201))
  return router
}

export function createPasswordResetPublicRouter() {
  const router = express.Router()
  router.post('/api/password-reset/complete', (req, res, next) => handle(res, next, async () => {
    await completePasswordReset(req.body?.accountId, req.body?.token, req.body?.password)
    const result = await revokeAccountSessions(req.body?.accountId, 'password-reset')
    await publishAuthenticationEvent('authentication.password-reset-completed', {
      revokedCount: result.revoked,
      reason: 'password-reset',
    })
    return { ok: true }
  }))
  return router
}
