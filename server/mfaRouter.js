import express from 'express'
import {
  beginTotpEnrollment,
  completeStepUpChallenge,
  confirmTotpEnrollment,
  createStepUpChallenge,
  disableMfa,
  evaluateLoginRisk,
  getMfaState,
  requireAssurance,
  revokeTrustedDevice,
  verifySecondFactor,
  verifyTrustedDevice,
} from './services/mfaService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.id || req.session?.email || 'owner', email: req.session?.email || null, role: req.session?.role || null } }
function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}
function publishMfaEvent(topic, req, payload) {
  publishDomainEvent(topic, {
    actor: actor(req),
    payload,
  })
}

export function createMfaRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getMfaState(req.query)))
  router.post('/accounts/:accountId/enrollment', (req, res, next) => handle(res, next, async () => {
    const result = await beginTotpEnrollment(req.params.accountId, req.body || {}, actor(req))
    publishMfaEvent('mfa.enrollment-started', req, { accountId: result.accountId, expiresAt: result.expiresAt })
    return result
  }, 201))
  router.post('/accounts/:accountId/enrollment/confirm', (req, res, next) => handle(res, next, async () => {
    const result = await confirmTotpEnrollment(req.params.accountId, req.body?.code, actor(req))
    publishMfaEvent('mfa.enabled', req, { accountId: result.account.accountId, recoveryCodesRemaining: result.account.recoveryCodesRemaining })
    return result
  }))
  router.post('/accounts/:accountId/verify', (req, res, next) => handle(res, next, async () => {
    try {
      const result = await verifySecondFactor(req.params.accountId, req.body || {}, actor(req))
      publishMfaEvent('mfa.verified', req, {
        accountId: req.params.accountId,
        method: result.method,
        assuranceLevel: result.assuranceLevel,
        trustedDeviceCreated: Boolean(result.trustedDevice),
      })
      return result
    } catch (error) {
      publishMfaEvent('mfa.verification-failed', req, { accountId: req.params.accountId, reason: 'verification-failed' })
      throw error
    }
  }))
  router.post('/accounts/:accountId/trusted-device/verify', (req, res, next) => handle(res, next, async () => {
    const result = await verifyTrustedDevice(req.params.accountId, req.body?.token, req.body?.userAgent || '')
    publishMfaEvent('mfa.trusted-device-verified', req, { accountId: req.params.accountId, deviceId: result.deviceId, assuranceLevel: result.assuranceLevel })
    return result
  }))
  router.post('/accounts/:accountId/disable', requireAssurance(2), (req, res, next) => handle(res, next, async () => {
    const result = await disableMfa(req.params.accountId, actor(req))
    publishMfaEvent('mfa.disabled', req, { accountId: result.accountId, enabled: result.enabled })
    return result
  }))
  router.post('/accounts/:accountId/risk', (req, res, next) => handle(res, next, async () => {
    const result = await evaluateLoginRisk(req.params.accountId, req.body || {})
    publishMfaEvent('mfa.login-risk-evaluated', req, {
      accountId: result.accountId,
      risk: result.risk,
      score: result.score,
      reasons: result.reasons,
      requireMfa: result.requireMfa,
    })
    return result
  }))
  router.post('/accounts/:accountId/step-up', (req, res, next) => handle(res, next, async () => {
    const result = await createStepUpChallenge(req.params.accountId, req.body || {}, actor(req))
    publishMfaEvent('mfa.step-up-created', req, { accountId: result.accountId, challengeId: result.id, requiredLevel: result.requiredLevel, status: result.status })
    return result
  }, 201))
  router.post('/step-up/:challengeId/complete', (req, res, next) => handle(res, next, async () => {
    const result = await completeStepUpChallenge(req.params.challengeId, req.body || {}, actor(req))
    publishMfaEvent('mfa.step-up-completed', req, {
      accountId: result.challenge.accountId,
      challengeId: result.challenge.id,
      assuranceLevel: result.assuranceLevel,
      method: result.challenge.method,
    })
    return result
  }))
  router.post('/trusted-devices/:deviceId/revoke', requireAssurance(2), (req, res, next) => handle(res, next, async () => {
    const result = await revokeTrustedDevice(req.params.deviceId, actor(req))
    publishMfaEvent('mfa.trusted-device-revoked', req, { accountId: result.accountId, deviceId: result.id, revoked: Boolean(result.revokedAt) })
    return result
  }))
  return router
}
