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

function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

function mfaRegistryPayload(state = {}, account = {}, details = {}) {
  const accounts = Array.isArray(state.accounts) ? state.accounts : []
  const challenges = Array.isArray(state.challenges) ? state.challenges : []
  const trustedDevices = Array.isArray(state.trustedDevices) ? state.trustedDevices : []
  return {
    accountCount: accounts.length,
    enabledAccountCount: accounts.filter(item => item.enabled === true).length,
    pendingChallengeCount: challenges.filter(item => item.status === 'pending').length,
    activeTrustedDeviceCount: trustedDevices.filter(item => item.effectiveStatus === 'active').length,
    enabled: account.enabled === true,
    recoveryCodesRemaining: Number(account.recoveryCodesRemaining) || 0,
    enrolled: details.enrolled === true,
    disabled: details.disabled === true,
  }
}

function verificationEventPayload(result = {}, details = {}) {
  return {
    verified: details.verified === true,
    failed: details.failed === true,
    assuranceLevel: Number(result.assuranceLevel) || 0,
    usedRecoveryCode: result.method === 'recovery',
    trustedDeviceCreated: Boolean(result.trustedDevice),
  }
}

function trustedDeviceEventPayload(result = {}, details = {}) {
  return {
    trusted: result.trusted === true,
    revoked: details.revoked === true,
    assuranceLevel: Number(result.assuranceLevel) || 0,
  }
}

function riskEventPayload(result = {}) {
  return {
    lowRisk: result.risk === 'low',
    mediumRisk: result.risk === 'medium',
    highRisk: result.risk === 'high',
    riskScore: Number(result.score) || 0,
    signalCount: Array.isArray(result.reasons) ? result.reasons.length : 0,
    requiresMfa: result.requireMfa === true,
  }
}

function stepUpEventPayload(result = {}, details = {}) {
  const challenge = result.challenge || result
  return {
    pending: challenge.status === 'pending',
    completed: challenge.status === 'completed',
    requiredLevel: Number(challenge.requiredLevel || result.assuranceLevel) || 0,
    created: details.created === true,
  }
}

async function publishMfaRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export function createMfaRouter() {
  const router = express.Router()
  router.use(requireOwner)

  router.get('/', (req, res, next) => handle(res, next, () => getMfaState(req.query)))

  router.post('/accounts/:accountId/enrollment', (req, res, next) => handle(res, next, async () => {
    const result = await beginTotpEnrollment(req.params.accountId, req.body || {}, null)
    const state = await getMfaState({ limit: 1000 })
    const account = state.accounts.find(item => item.accountId === result.accountId) || {}
    await publishMfaRealtimeEvent('mfa.enrollment-started', mfaRegistryPayload(state, account))
    return result
  }, 201))

  router.post('/accounts/:accountId/enrollment/confirm', (req, res, next) => handle(res, next, async () => {
    const result = await confirmTotpEnrollment(req.params.accountId, req.body?.code, null)
    const state = await getMfaState({ limit: 1000 })
    await publishMfaRealtimeEvent('mfa.enabled', mfaRegistryPayload(state, result.account, { enrolled: true }))
    return result
  }))

  router.post('/accounts/:accountId/verify', (req, res, next) => handle(res, next, async () => {
    try {
      const result = await verifySecondFactor(req.params.accountId, req.body || {}, null)
      await publishMfaRealtimeEvent('mfa.verified', verificationEventPayload(result, { verified: true }))
      return result
    } catch (error) {
      await publishMfaRealtimeEvent('mfa.verification-failed', verificationEventPayload({}, { failed: true }))
      throw error
    }
  }))

  router.post('/accounts/:accountId/trusted-device/verify', (req, res, next) => handle(res, next, async () => {
    const result = await verifyTrustedDevice(req.params.accountId, req.body?.token, req.body?.userAgent || '')
    await publishMfaRealtimeEvent('mfa.trusted-device-verified', trustedDeviceEventPayload(result))
    return result
  }))

  router.post('/accounts/:accountId/disable', requireAssurance(2), (req, res, next) => handle(res, next, async () => {
    const state = await getMfaState({ limit: 1000 })
    const existing = state.accounts.find(item => item.accountId === req.params.accountId)
    if (existing?.enabled !== true && existing) return existing
    const result = await disableMfa(req.params.accountId, null)
    const updatedState = await getMfaState({ limit: 1000 })
    await publishMfaRealtimeEvent('mfa.disabled', mfaRegistryPayload(updatedState, result, { disabled: true }))
    return result
  }))

  router.post('/accounts/:accountId/risk', (req, res, next) => handle(res, next, async () => {
    const result = await evaluateLoginRisk(req.params.accountId, req.body || {})
    await publishMfaRealtimeEvent('mfa.login-risk-evaluated', riskEventPayload(result))
    return result
  }))

  router.post('/accounts/:accountId/step-up', (req, res, next) => handle(res, next, async () => {
    const result = await createStepUpChallenge(req.params.accountId, req.body || {}, null)
    await publishMfaRealtimeEvent('mfa.step-up-created', stepUpEventPayload(result, { created: true }))
    return result
  }, 201))

  router.post('/step-up/:challengeId/complete', (req, res, next) => handle(res, next, async () => {
    const result = await completeStepUpChallenge(req.params.challengeId, req.body || {}, null)
    await publishMfaRealtimeEvent('mfa.step-up-completed', stepUpEventPayload(result))
    return result
  }))

  router.post('/trusted-devices/:deviceId/revoke', requireAssurance(2), (req, res, next) => handle(res, next, async () => {
    const state = await getMfaState({ limit: 1000 })
    const existing = state.trustedDevices.find(item => item.id === req.params.deviceId)
    if (existing?.effectiveStatus === 'revoked') return existing
    const result = await revokeTrustedDevice(req.params.deviceId, null)
    await publishMfaRealtimeEvent('mfa.trusted-device-revoked', trustedDeviceEventPayload(result, { revoked: true }))
    return result
  }))

  return router
}
