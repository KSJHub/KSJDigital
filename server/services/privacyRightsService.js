import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, safeName, readJson, writeJson } from '../storage.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'privacy-rights', 'registry.json')
const mutations = new Map()
const MAX_HISTORY = 5000
const REQUEST_TYPES = new Set(['access', 'erasure', 'rectification', 'restriction', 'portability', 'objection'])
const REQUEST_STATUSES = new Set(['submitted', 'verification-required', 'verified', 'in-progress', 'fulfilled', 'rejected', 'cancelled'])

export class PrivacyRightsError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'PrivacyRightsError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    policies: [], consents: [], requests: [], history: [],
    statistics: { consentGranted: 0, consentWithdrawn: 0, requestsSubmitted: 0, requestsVerified: 0, requestsFulfilled: 0, requestsRejected: 0 },
    version: 1, updatedAt: nowIso(),
  }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.policies ||= []
  registry.consents ||= []
  registry.requests ||= []
  registry.history ||= []
  registry.statistics = { ...initialRegistry().statistics, ...(registry.statistics || {}) }
  registry.version ||= 1
  return registry
}
async function mutate(operation) {
  const previous = mutations.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = structuredClone(await readRegistry())
    const result = await operation(registry)
    registry.version += 1
    registry.updatedAt = nowIso()
    registry.history = registry.history.slice(0, MAX_HISTORY)
    registry.requests = registry.requests.slice(0, 10000)
    registry.consents = registry.consents.slice(0, 50000)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function required(value, label, maximum = 500) {
  const result = String(value || '').trim()
  if (!result) throw new PrivacyRightsError(`${label} is required`, 422)
  if (result.length > maximum) throw new PrivacyRightsError(`${label} is too long`, 422)
  return result
}
function idValue(value, label) {
  const id = safeName(required(value, label, 200))
  if (!id || id === 'file') throw new PrivacyRightsError(`${label} is invalid`, 422)
  return id
}
function subjectKey(input = {}) {
  const websiteId = idValue(input.websiteId, 'Website ID')
  const subjectId = required(input.subjectId || input.email, 'Subject identifier', 320).toLowerCase()
  return { websiteId, subjectId, subjectHash: crypto.createHash('sha256').update(`${websiteId}:${subjectId}`).digest('hex') }
}
function verificationToken() { return crypto.randomBytes(32).toString('hex') }
function tokenHash(token) { return crypto.createHash('sha256').update(String(token)).digest('hex') }
function requestSummary(request) {
  const { verificationTokenHash, ...safe } = request
  return structuredClone(safe)
}

export async function getPrivacyRightsState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return {
    ...registry,
    requests: registry.requests.slice(0, limit).map(requestSummary),
    consents: registry.consents.slice(0, limit),
    history: registry.history.slice(0, limit),
    supportedRequestTypes: [...REQUEST_TYPES],
    supportedRequestStatuses: [...REQUEST_STATUSES],
  }
}

export async function upsertConsentPolicy(input = {}, actor = null) {
  const id = idValue(input.id, 'Consent policy ID')
  const version = required(input.version, 'Policy version', 100)
  return mutate(registry => {
    const existing = registry.policies.find(item => item.id === id && item.version === version)
    const policy = {
      id, version,
      name: required(input.name ?? existing?.name ?? id, 'Policy name', 200),
      purpose: required(input.purpose ?? existing?.purpose, 'Policy purpose', 2000),
      lawfulBasis: String(input.lawfulBasis ?? existing?.lawfulBasis ?? 'consent').trim().slice(0, 200),
      required: input.required === undefined ? existing?.required === true : input.required === true,
      active: input.active === undefined ? existing?.active !== false : input.active === true,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt).toISOString() : existing?.effectiveAt || nowIso(),
      createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor,
      updatedAt: nowIso(), updatedBy: actor,
    }
    if (policy.active) registry.policies = registry.policies.map(item => item.id === id ? { ...item, active: item.version === version } : item)
    registry.policies = [policy, ...registry.policies.filter(item => !(item.id === id && item.version === version))]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'consent-policy.updated', policyId: id, version, actor, createdAt: nowIso() })
    return policy
  })
}

export async function recordConsent(input = {}, actor = null) {
  const subject = subjectKey(input)
  const policyId = idValue(input.policyId, 'Consent policy ID')
  return mutate(registry => {
    const policy = registry.policies.find(item => item.id === policyId && item.version === String(input.policyVersion || item.version) && item.active)
      || registry.policies.find(item => item.id === policyId && item.active)
    if (!policy) throw new PrivacyRightsError('Active consent policy not found', 404)
    const granted = input.granted !== false
    const record = {
      id: crypto.randomUUID(), ...subject, policyId, policyVersion: policy.version,
      status: granted ? 'granted' : 'withdrawn', source: String(input.source || 'administration').slice(0, 200),
      evidence: input.evidence && typeof input.evidence === 'object' && !Array.isArray(input.evidence) ? structuredClone(input.evidence) : {},
      recordedAt: nowIso(), recordedBy: actor,
    }
    registry.consents.unshift(record)
    registry.statistics[granted ? 'consentGranted' : 'consentWithdrawn'] += 1
    registry.history.unshift({ id: crypto.randomUUID(), action: granted ? 'consent.granted' : 'consent.withdrawn', consentId: record.id, policyId, subjectHash: subject.subjectHash, actor, createdAt: record.recordedAt })
    return record
  })
}

export async function withdrawConsent(input = {}, actor = null) {
  return recordConsent({ ...input, granted: false }, actor)
}

export async function getEffectiveConsent(input = {}) {
  const subject = subjectKey(input)
  const policyId = idValue(input.policyId, 'Consent policy ID')
  const registry = await readRegistry()
  const record = registry.consents.find(item => item.websiteId === subject.websiteId && item.subjectHash === subject.subjectHash && item.policyId === policyId)
  return { websiteId: subject.websiteId, subjectHash: subject.subjectHash, policyId, status: record?.status || 'not-recorded', policyVersion: record?.policyVersion || null, recordedAt: record?.recordedAt || null }
}

export async function createPrivacyRequest(input = {}, actor = null) {
  const subject = subjectKey(input)
  const type = String(input.type || '').toLowerCase()
  if (!REQUEST_TYPES.has(type)) throw new PrivacyRightsError('Unsupported privacy request type', 422)
  const token = verificationToken()
  const submittedAt = nowIso()
  const request = {
    id: crypto.randomUUID(), ...subject, type, status: 'verification-required',
    details: String(input.details || '').trim().slice(0, 5000),
    verificationTokenHash: tokenHash(token), verificationExpiresAt: new Date(Date.now() + 24 * 3600000).toISOString(), verifiedAt: null,
    dueAt: new Date(Date.now() + Math.min(90, Math.max(1, Number(input.dueDays || 30))) * 86400000).toISOString(),
    assignedTo: null, fulfilment: null, submittedAt, submittedBy: actor, updatedAt: submittedAt, updatedBy: actor,
  }
  await mutate(registry => {
    registry.requests.unshift(request)
    registry.statistics.requestsSubmitted += 1
    registry.history.unshift({ id: crypto.randomUUID(), action: 'privacy-request.submitted', requestId: request.id, type, subjectHash: subject.subjectHash, actor, createdAt: submittedAt })
  })
  return { request: requestSummary(request), verificationToken: token }
}

export async function verifyPrivacyRequest(requestIdValue, token, actor = null) {
  const requestId = required(requestIdValue, 'Privacy request ID', 100)
  const supplied = required(token, 'Verification token', 200)
  return mutate(registry => {
    const request = registry.requests.find(item => item.id === requestId)
    if (!request) throw new PrivacyRightsError('Privacy request not found', 404)
    if (request.status !== 'verification-required') throw new PrivacyRightsError('Privacy request is not awaiting verification', 409)
    if (new Date(request.verificationExpiresAt).getTime() <= Date.now()) throw new PrivacyRightsError('Verification token has expired', 410)
    const expected = Buffer.from(request.verificationTokenHash, 'hex')
    const actual = Buffer.from(tokenHash(supplied), 'hex')
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new PrivacyRightsError('Verification token is invalid', 403)
    request.status = 'verified'; request.verifiedAt = nowIso(); request.updatedAt = nowIso(); request.updatedBy = actor
    registry.statistics.requestsVerified += 1
    registry.history.unshift({ id: crypto.randomUUID(), action: 'privacy-request.verified', requestId, actor, createdAt: request.verifiedAt })
    return requestSummary(request)
  })
}

export async function updatePrivacyRequest(requestIdValue, input = {}, actor = null) {
  const requestId = required(requestIdValue, 'Privacy request ID', 100)
  return mutate(registry => {
    const request = registry.requests.find(item => item.id === requestId)
    if (!request) throw new PrivacyRightsError('Privacy request not found', 404)
    const status = input.status ? String(input.status) : request.status
    if (!REQUEST_STATUSES.has(status)) throw new PrivacyRightsError('Privacy request status is invalid', 422)
    if (['in-progress', 'fulfilled'].includes(status) && !request.verifiedAt) throw new PrivacyRightsError('Privacy request must be verified first', 409)
    request.status = status
    if ('assignedTo' in input) request.assignedTo = input.assignedTo ? String(input.assignedTo).slice(0, 320) : null
    if ('fulfilment' in input) request.fulfilment = input.fulfilment && typeof input.fulfilment === 'object' ? structuredClone(input.fulfilment) : null
    request.updatedAt = nowIso(); request.updatedBy = actor
    if (status === 'fulfilled' && !request.fulfilledAt) { request.fulfilledAt = nowIso(); registry.statistics.requestsFulfilled += 1 }
    if (status === 'rejected' && !request.rejectedAt) { request.rejectedAt = nowIso(); registry.statistics.requestsRejected += 1 }
    registry.history.unshift({ id: crypto.randomUUID(), action: `privacy-request.${status}`, requestId, actor, createdAt: request.updatedAt })
    return requestSummary(request)
  })
}

export async function createPrivacyComplianceReport() {
  const registry = await readRegistry()
  const now = Date.now()
  const open = registry.requests.filter(item => !['fulfilled', 'rejected', 'cancelled'].includes(item.status))
  return {
    generatedAt: nowIso(),
    activePolicyCount: registry.policies.filter(item => item.active).length,
    consentRecordCount: registry.consents.length,
    openRequestCount: open.length,
    overdueRequestCount: open.filter(item => new Date(item.dueAt).getTime() < now).length,
    requestsByType: Object.fromEntries([...REQUEST_TYPES].map(type => [type, registry.requests.filter(item => item.type === type).length])),
    requestsByStatus: Object.fromEntries([...REQUEST_STATUSES].map(status => [status, registry.requests.filter(item => item.status === status).length])),
    statistics: registry.statistics,
    controls: { versionedConsentPolicies: true, consentWithdrawal: true, requestVerification: true, fulfilmentTracking: true, tokenHashing: true },
  }
}

export async function logPrivacyOperation(message, metadata = {}) {
  await writeStructuredLog('info', message, metadata)
}
