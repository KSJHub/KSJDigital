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
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) { Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next) }
function publish(req, topic, payload = {}, metadata = {}) {
  publishDomainEvent(topic, payload, {
    actor: actor(req),
    websiteId: payload.websiteId || metadata.websiteId || null,
    privacyRights: true,
    ...metadata,
  }).catch(() => {})
}

export function createPrivacyRightsRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getPrivacyRightsState(req.query)))
  router.get('/report', (req, res, next) => handle(res, next, async () => {
    const report = await createPrivacyComplianceReport()
    publish(req, 'privacy.compliance-report-generated', {
      generatedAt: report.generatedAt,
      activePolicyCount: report.activePolicyCount,
      consentRecordCount: report.consentRecordCount,
      openRequestCount: report.openRequestCount,
      overdueRequestCount: report.overdueRequestCount,
    })
    return report
  }))
  router.get('/consent/effective', (req, res, next) => handle(res, next, async () => {
    const result = await getEffectiveConsent(req.query)
    publish(req, 'privacy.consent-evaluated', result)
    return result
  }))
  router.put('/policies/:policyId/versions/:version', (req, res, next) => handle(res, next, async () => {
    const policy = await upsertConsentPolicy({ ...req.body, id: req.params.policyId, version: req.params.version }, actor(req))
    publish(req, 'privacy.consent-policy-updated', {
      policyId: policy.id,
      version: policy.version,
      active: policy.active,
      required: policy.required,
      effectiveAt: policy.effectiveAt,
    })
    return policy
  }))
  router.post('/consents', (req, res, next) => handle(res, next, async () => {
    const consent = await recordConsent(req.body || {}, actor(req))
    publish(req, consent.status === 'granted' ? 'privacy.consent-granted' : 'privacy.consent-withdrawn', {
      consentId: consent.id,
      websiteId: consent.websiteId,
      subjectHash: consent.subjectHash,
      policyId: consent.policyId,
      policyVersion: consent.policyVersion,
      status: consent.status,
      recordedAt: consent.recordedAt,
    })
    return consent
  }, 201))
  router.post('/consents/withdraw', (req, res, next) => handle(res, next, async () => {
    const consent = await withdrawConsent(req.body || {}, actor(req))
    publish(req, 'privacy.consent-withdrawn', {
      consentId: consent.id,
      websiteId: consent.websiteId,
      subjectHash: consent.subjectHash,
      policyId: consent.policyId,
      policyVersion: consent.policyVersion,
      status: consent.status,
      recordedAt: consent.recordedAt,
    })
    return consent
  }, 201))
  router.post('/requests', (req, res, next) => handle(res, next, async () => {
    const result = await createPrivacyRequest(req.body || {}, actor(req))
    publish(req, 'privacy.request-created', {
      requestId: result.request.id,
      websiteId: result.request.websiteId,
      subjectHash: result.request.subjectHash,
      type: result.request.type,
      status: result.request.status,
      dueAt: result.request.dueAt,
      submittedAt: result.request.submittedAt,
    })
    return result
  }, 201))
  router.post('/requests/:requestId/verify', (req, res, next) => handle(res, next, async () => {
    const request = await verifyPrivacyRequest(req.params.requestId, req.body?.token, actor(req))
    publish(req, 'privacy.request-verified', {
      requestId: request.id,
      websiteId: request.websiteId,
      subjectHash: request.subjectHash,
      type: request.type,
      status: request.status,
      verifiedAt: request.verifiedAt,
      dueAt: request.dueAt,
    })
    return request
  }))
  router.patch('/requests/:requestId', (req, res, next) => handle(res, next, async () => {
    const request = await updatePrivacyRequest(req.params.requestId, req.body || {}, actor(req))
    publish(req, 'privacy.request-updated', {
      requestId: request.id,
      websiteId: request.websiteId,
      subjectHash: request.subjectHash,
      type: request.type,
      status: request.status,
      assigned: Boolean(request.assignedTo),
      fulfilledAt: request.fulfilledAt || null,
      rejectedAt: request.rejectedAt || null,
      updatedAt: request.updatedAt,
    })
    return request
  }))
  return router
}
