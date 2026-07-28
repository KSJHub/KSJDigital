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

function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

function privacyRegistryPayload(state = {}, subject = {}, details = {}) {
  const policies = Array.isArray(state.policies) ? state.policies : []
  const consents = Array.isArray(state.consents) ? state.consents : []
  const requests = Array.isArray(state.requests) ? state.requests : []
  const openStatuses = new Set(['submitted', 'verification-required', 'verified', 'in-progress'])
  return {
    policyCount: policies.length,
    activePolicyCount: policies.filter(item => item.active !== false).length,
    consentRecordCount: consents.length,
    grantedConsentCount: consents.filter(item => item.status === 'granted').length,
    withdrawnConsentCount: consents.filter(item => item.status === 'withdrawn').length,
    requestCount: requests.length,
    openRequestCount: requests.filter(item => openStatuses.has(item.status)).length,
    verifiedRequestCount: requests.filter(item => Boolean(item.verifiedAt)).length,
    fulfilledRequestCount: requests.filter(item => item.status === 'fulfilled').length,
    rejectedRequestCount: requests.filter(item => item.status === 'rejected').length,
    active: subject.active !== false,
    required: subject.required === true,
    granted: subject.status === 'granted',
    withdrawn: subject.status === 'withdrawn',
    assigned: Boolean(subject.assignedTo),
    verified: Boolean(subject.verifiedAt) || details.verified === true,
    fulfilled: subject.status === 'fulfilled',
    rejected: subject.status === 'rejected',
    cancelled: subject.status === 'cancelled',
    recorded: details.recorded === true,
    evaluated: details.evaluated === true,
    reportGenerated: details.reportGenerated === true,
    created: details.created === true,
  }
}

async function publishPrivacyRightsRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function consentPolicyPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'name') && String(input.name || '').trim() !== String(existing.name || '')) return true
  if (Object.hasOwn(input, 'purpose') && String(input.purpose || '').trim() !== String(existing.purpose || '')) return true
  if (Object.hasOwn(input, 'lawfulBasis') && String(input.lawfulBasis || '').trim().slice(0, 200) !== String(existing.lawfulBasis || '')) return true
  if (Object.hasOwn(input, 'required') && (input.required === true) !== (existing.required === true)) return true
  if (Object.hasOwn(input, 'active') && (input.active === true) !== (existing.active !== false)) return true
  if (Object.hasOwn(input, 'effectiveAt')) {
    const requested = input.effectiveAt ? new Date(input.effectiveAt).toISOString() : null
    if (requested !== (existing.effectiveAt || null)) return true
  }
  return false
}

function requestPatchChanges(existing, input = {}) {
  if (!existing) return true
  if (Object.hasOwn(input, 'status') && String(input.status) !== String(existing.status)) return true
  if (Object.hasOwn(input, 'assignedTo')) {
    const assigned = input.assignedTo ? String(input.assignedTo).slice(0, 320) : null
    if (assigned !== (existing.assignedTo || null)) return true
  }
  if (Object.hasOwn(input, 'fulfilment')) {
    const fulfilment = input.fulfilment && typeof input.fulfilment === 'object' ? input.fulfilment : null
    if (JSON.stringify(fulfilment) !== JSON.stringify(existing.fulfilment || null)) return true
  }
  return false
}

export function createPrivacyRightsRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getPrivacyRightsState(req.query)))

  router.get('/report', (req, res, next) => handle(res, next, async () => {
    const report = await createPrivacyComplianceReport()
    const state = await getPrivacyRightsState({ limit: 1000 })
    await publishPrivacyRightsRealtimeEvent('privacy.compliance-report-generated', privacyRegistryPayload(state, {}, { reportGenerated: true }))
    return report
  }))

  router.get('/consent/effective', (req, res, next) => handle(res, next, async () => {
    const result = await getEffectiveConsent(req.query)
    const state = await getPrivacyRightsState({ limit: 1000 })
    await publishPrivacyRightsRealtimeEvent('privacy.consent-evaluated', privacyRegistryPayload(state, result, { evaluated: true }))
    return result
  }))

  router.put('/policies/:policyId/versions/:version', (req, res, next) => handle(res, next, async () => {
    const input = req.body || {}
    const state = await getPrivacyRightsState({ limit: 1000 })
    const existing = state.policies.find(item => item.id === req.params.policyId && item.version === req.params.version)
    if (!consentPolicyPatchChanges(existing, input)) return existing
    const policy = await upsertConsentPolicy({ ...input, id: req.params.policyId, version: req.params.version }, null)
    const updatedState = await getPrivacyRightsState({ limit: 1000 })
    await publishPrivacyRightsRealtimeEvent('privacy.consent-policy-updated', privacyRegistryPayload(updatedState, policy, { created: !existing }))
    return policy
  }))

  router.post('/consents', (req, res, next) => handle(res, next, async () => {
    const consent = await recordConsent(req.body || {}, null)
    if (consent.noop === true) return consent
    const state = await getPrivacyRightsState({ limit: 1000 })
    await publishPrivacyRightsRealtimeEvent(
      consent.status === 'granted' ? 'privacy.consent-granted' : 'privacy.consent-withdrawn',
      privacyRegistryPayload(state, consent, { recorded: true }),
    )
    return consent
  }, 201))

  router.post('/consents/withdraw', (req, res, next) => handle(res, next, async () => {
    const consent = await withdrawConsent(req.body || {}, null)
    if (consent.noop === true) return consent
    const state = await getPrivacyRightsState({ limit: 1000 })
    await publishPrivacyRightsRealtimeEvent('privacy.consent-withdrawn', privacyRegistryPayload(state, consent, { recorded: true }))
    return consent
  }, 201))

  router.post('/requests', (req, res, next) => handle(res, next, async () => {
    const result = await createPrivacyRequest(req.body || {}, null)
    const state = await getPrivacyRightsState({ limit: 1000 })
    await publishPrivacyRightsRealtimeEvent('privacy.request-created', privacyRegistryPayload(state, result.request, { created: true }))
    return result
  }, 201))

  router.post('/requests/:requestId/verify', (req, res, next) => handle(res, next, async () => {
    const request = await verifyPrivacyRequest(req.params.requestId, req.body?.token, null)
    const state = await getPrivacyRightsState({ limit: 1000 })
    await publishPrivacyRightsRealtimeEvent('privacy.request-verified', privacyRegistryPayload(state, request, { verified: true }))
    return request
  }))

  router.patch('/requests/:requestId', (req, res, next) => handle(res, next, async () => {
    const input = req.body || {}
    const state = await getPrivacyRightsState({ limit: 1000 })
    const existing = state.requests.find(item => item.id === req.params.requestId)
    if (existing && !requestPatchChanges(existing, input)) return existing
    const request = await updatePrivacyRequest(req.params.requestId, input, null)
    const updatedState = await getPrivacyRightsState({ limit: 1000 })
    await publishPrivacyRightsRealtimeEvent('privacy.request-updated', privacyRegistryPayload(updatedState, request))
    return request
  }))

  return router
}
