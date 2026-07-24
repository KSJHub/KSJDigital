import express from 'express'
import {
  createPrivacyComplianceReport,
  createPrivacyRequest,
  getEffectiveConsent,
  getPrivacyRightsState,
  recordConsent,
  updatePrivacyRequest,
  upsertConsentPolicy,
  verifyPrivacyRequest,
  withdrawConsent,
} from './services/privacyRightsService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

export function createPrivacyRightsRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getPrivacyRightsState(req.query)))
  router.get('/report', (req, res, next) => handle(res, next, () => createPrivacyComplianceReport()))
  router.get('/consent/effective', (req, res, next) => handle(res, next, () => getEffectiveConsent(req.query)))
  router.put('/policies/:policyId/versions/:version', (req, res, next) => handle(res, next, () => upsertConsentPolicy({ ...req.body, id: req.params.policyId, version: req.params.version }, actor(req))))
  router.post('/consents', (req, res, next) => handle(res, next, () => recordConsent(req.body || {}, actor(req)), 201))
  router.post('/consents/withdraw', (req, res, next) => handle(res, next, () => withdrawConsent(req.body || {}, actor(req)), 201))
  router.post('/requests', (req, res, next) => handle(res, next, () => createPrivacyRequest(req.body || {}, actor(req)), 201))
  router.post('/requests/:requestId/verify', (req, res, next) => handle(res, next, () => verifyPrivacyRequest(req.params.requestId, req.body?.token, actor(req))))
  router.patch('/requests/:requestId', (req, res, next) => handle(res, next, () => updatePrivacyRequest(req.params.requestId, req.body || {}, actor(req))))
  return router
}
