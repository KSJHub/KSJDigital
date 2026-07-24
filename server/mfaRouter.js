import express from 'express'
import {
  beginTotpEnrollment,
  completeStepUpChallenge,
  confirmTotpEnrollment,
  createStepUpChallenge,
  disableMfa,
  evaluateLoginRisk,
  getMfaState,
  revokeTrustedDevice,
  verifySecondFactor,
  verifyTrustedDevice,
} from './services/mfaService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.id || req.session?.email || 'owner', email: req.session?.email || null, role: req.session?.role || null } }
function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

export function createMfaRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getMfaState(req.query)))
  router.post('/accounts/:accountId/enrollment', (req, res, next) => handle(res, next, () => beginTotpEnrollment(req.params.accountId, req.body || {}, actor(req)), 201))
  router.post('/accounts/:accountId/enrollment/confirm', (req, res, next) => handle(res, next, () => confirmTotpEnrollment(req.params.accountId, req.body?.code, actor(req))))
  router.post('/accounts/:accountId/verify', (req, res, next) => handle(res, next, () => verifySecondFactor(req.params.accountId, req.body || {}, actor(req))))
  router.post('/accounts/:accountId/trusted-device/verify', (req, res, next) => handle(res, next, () => verifyTrustedDevice(req.params.accountId, req.body?.token, req.body?.userAgent || '')))
  router.post('/accounts/:accountId/disable', (req, res, next) => handle(res, next, () => disableMfa(req.params.accountId, actor(req))))
  router.post('/accounts/:accountId/risk', (req, res, next) => handle(res, next, () => evaluateLoginRisk(req.params.accountId, req.body || {})))
  router.post('/accounts/:accountId/step-up', (req, res, next) => handle(res, next, () => createStepUpChallenge(req.params.accountId, req.body || {}, actor(req)), 201))
  router.post('/step-up/:challengeId/complete', (req, res, next) => handle(res, next, () => completeStepUpChallenge(req.params.challengeId, req.body || {}, actor(req))))
  router.post('/trusted-devices/:deviceId/revoke', (req, res, next) => handle(res, next, () => revokeTrustedDevice(req.params.deviceId, actor(req))))
  return router
}
