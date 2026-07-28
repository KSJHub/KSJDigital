import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, paths, readJson, safeName, writeJson } from '../storage.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'retention', 'registry.json')
const mutations = new Map()
const MAX_HISTORY = 5000
const RESOURCE_FILES = {
  content: paths.content,
  publishedContent: paths.publishedContent,
  articles: paths.articles,
  forms: paths.forms,
}
let schedulerTimer = null

export class RetentionComplianceError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'RetentionComplianceError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    policies: [], legalHolds: [], purgeHistory: [], runs: [], history: [],
    statistics: { previews: 0, purgedRecords: 0, heldRecords: 0, runs: 0, failures: 0 },
    version: 1, updatedAt: nowIso(),
  }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.policies ||= []
  registry.legalHolds ||= []
  registry.purgeHistory ||= []
  registry.runs ||= []
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
    if (result?.__skipWrite === true) return result.value
    registry.version += 1
    registry.updatedAt = nowIso()
    registry.purgeHistory = registry.purgeHistory.slice(0, 10000)
    registry.runs = registry.runs.slice(0, 1000)
    registry.history = registry.history.slice(0, MAX_HISTORY)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function required(value, label, maximum = 500) {
  const result = String(value || '').trim()
  if (!result) throw new RetentionComplianceError(`${label} is required`, 422)
  if (result.length > maximum) throw new RetentionComplianceError(`${label} is too long`, 422)
  return result
}
function idValue(value, label) {
  const id = safeName(required(value, label, 200))
  if (!id || id === 'file') throw new RetentionComplianceError(`${label} is invalid`, 422)
  return id
}
function normaliseScope(input = {}, existing = {}) {
  const resourceType = String(input.resourceType ?? existing.resourceType ?? 'content')
  if (!(resourceType in RESOURCE_FILES)) throw new RetentionComplianceError('Unsupported retention resource type', 422)
  const websiteId = input.websiteId === null || input.websiteId === '*' ? '*' : idValue(input.websiteId ?? existing.websiteId, 'Website ID')
  return { resourceType, websiteId }
}
function normalisePolicy(input = {}, existing = null) {
  const id = idValue(input.id || existing?.id, 'Retention policy ID')
  const scope = normaliseScope(input, existing || {})
  const timestampField = String(input.timestampField ?? existing?.timestampField ?? 'updatedAt').trim()
  if (!/^[A-Za-z0-9_.-]+$/.test(timestampField)) throw new RetentionComplianceError('Timestamp field is invalid', 422)
  return {
    id,
    name: String(input.name ?? existing?.name ?? id).trim().slice(0, 200),
    ...scope,
    retentionDays: Math.min(36500, Math.max(1, Number(input.retentionDays ?? existing?.retentionDays ?? 365))),
    timestampField,
    enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
    priority: Math.min(10000, Math.max(-10000, Number(input.priority ?? existing?.priority ?? 0))),
  }
}
function readField(record, dotted) { return dotted.split('.').reduce((value, key) => value?.[key], record) }
function recordId(record, index) { return String(record?.id || record?._id || record?.slug || `index-${index}`) }
function fingerprint(record) { return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex') }
function holdMatches(hold, policy, record, index, at) {
  if (!hold.enabled) return false
  if (hold.expiresAt && new Date(hold.expiresAt).getTime() <= at) return false
  if (hold.websiteId !== '*' && hold.websiteId !== policy.websiteId) return false
  if (hold.resourceType !== '*' && hold.resourceType !== policy.resourceType) return false
  return !hold.recordIds.length || hold.recordIds.includes(recordId(record, index))
}
async function inspectPolicy(policy, registry, at = Date.now()) {
  if (policy.websiteId === '*') throw new RetentionComplianceError('Wildcard website policies cannot be executed directly', 422)
  const file = RESOURCE_FILES[policy.resourceType](policy.websiteId)
  const data = await readJson(file, [])
  if (!Array.isArray(data)) throw new RetentionComplianceError(`Retention resource is not an array: ${policy.resourceType}`, 409)
  const cutoff = at - policy.retentionDays * 86400000
  const candidates = []
  const held = []
  data.forEach((record, index) => {
    const timestamp = new Date(readField(record, policy.timestampField)).getTime()
    if (!Number.isFinite(timestamp) || timestamp > cutoff) return
    const item = { id: recordId(record, index), index, timestamp: new Date(timestamp).toISOString(), fingerprint: fingerprint(record) }
    if (registry.legalHolds.some(hold => holdMatches(hold, policy, record, index, at))) held.push(item)
    else candidates.push(item)
  })
  return { file, data, cutoff: new Date(cutoff).toISOString(), candidates, held }
}

export async function getRetentionState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return { ...registry, purgeHistory: registry.purgeHistory.slice(0, limit), runs: registry.runs.slice(0, limit), history: registry.history.slice(0, limit), supportedResourceTypes: Object.keys(RESOURCE_FILES) }
}
export async function upsertRetentionPolicy(input = {}, actor = null) {
  return mutate(registry => {
    const existing = registry.policies.find(item => item.id === safeName(input.id))
    const policy = { ...normalisePolicy(input, existing), createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor, updatedAt: nowIso(), updatedBy: actor }
    registry.policies = [policy, ...registry.policies.filter(item => item.id !== policy.id)].sort((a, b) => b.priority - a.priority)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'retention-policy.updated', policyId: policy.id, actor, createdAt: nowIso() })
    return policy
  })
}
export async function deleteRetentionPolicy(value, actor = null) {
  const id = idValue(value, 'Retention policy ID')
  return mutate(registry => {
    const existed = registry.policies.some(item => item.id === id)
    if (!existed) return { __skipWrite: true, value: { deleted: false, id } }
    registry.policies = registry.policies.filter(item => item.id !== id)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'retention-policy.deleted', policyId: id, actor, createdAt: nowIso() })
    return { deleted: true, id }
  })
}
export async function upsertLegalHold(input = {}, actor = null) {
  const id = idValue(input.id, 'Legal hold ID')
  return mutate(registry => {
    const existing = registry.legalHolds.find(item => item.id === id)
    const resourceType = String(input.resourceType ?? existing?.resourceType ?? '*')
    if (resourceType !== '*' && !(resourceType in RESOURCE_FILES)) throw new RetentionComplianceError('Unsupported legal hold resource type', 422)
    const websiteId = input.websiteId === '*' || existing?.websiteId === '*' && input.websiteId === undefined ? '*' : idValue(input.websiteId ?? existing?.websiteId, 'Website ID')
    const hold = {
      id, name: String(input.name ?? existing?.name ?? id).trim().slice(0, 200), websiteId, resourceType,
      recordIds: [...new Set((Array.isArray(input.recordIds) ? input.recordIds : existing?.recordIds || []).map(value => String(value).trim()).filter(Boolean))].slice(0, 10000),
      reason: required(input.reason ?? existing?.reason, 'Legal hold reason', 2000),
      enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
      expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : existing?.expiresAt || null,
      createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor, updatedAt: nowIso(), updatedBy: actor,
    }
    registry.legalHolds = [hold, ...registry.legalHolds.filter(item => item.id !== id)]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'legal-hold.updated', legalHoldId: id, actor, createdAt: nowIso() })
    return hold
  })
}
export async function deleteLegalHold(value, actor = null) {
  const id = idValue(value, 'Legal hold ID')
  return mutate(registry => {
    const existed = registry.legalHolds.some(item => item.id === id)
    if (!existed) return { __skipWrite: true, value: { deleted: false, id } }
    registry.legalHolds = registry.legalHolds.filter(item => item.id !== id)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'legal-hold.deleted', legalHoldId: id, actor, createdAt: nowIso() })
    return { deleted: true, id }
  })
}
export async function previewRetentionPolicy(value) {
  const id = idValue(value, 'Retention policy ID')
  const registry = await readRegistry()
  const policy = registry.policies.find(item => item.id === id)
  if (!policy) throw new RetentionComplianceError('Retention policy not found', 404)
  const inspection = await inspectPolicy(policy, registry)
  await mutate(current => { current.statistics.previews += 1 })
  return { policy, cutoff: inspection.cutoff, candidateCount: inspection.candidates.length, heldCount: inspection.held.length, candidates: inspection.candidates, held: inspection.held }
}
export async function executeRetentionPolicy(value, actor = null) {
  const id = idValue(value, 'Retention policy ID')
  const registry = await readRegistry()
  const policy = registry.policies.find(item => item.id === id)
  if (!policy) throw new RetentionComplianceError('Retention policy not found', 404)
  if (!policy.enabled) throw new RetentionComplianceError('Retention policy is disabled', 409)
  const inspection = await inspectPolicy(policy, registry)
  if (!inspection.candidates.length) return { noop: true, purgedCount: 0, heldCount: inspection.held.length }
  const indexes = new Set(inspection.candidates.map(item => item.index))
  const retained = inspection.data.filter((_, index) => !indexes.has(index))
  await writeJson(inspection.file, retained)
  const run = { id: crypto.randomUUID(), policyId: id, websiteId: policy.websiteId, resourceType: policy.resourceType, status: 'completed', cutoff: inspection.cutoff, purgedCount: inspection.candidates.length, heldCount: inspection.held.length, createdAt: nowIso(), createdBy: actor }
  await mutate(current => {
    current.runs.unshift(run)
    current.purgeHistory.unshift(...inspection.candidates.map(item => ({ id: crypto.randomUUID(), runId: run.id, policyId: id, websiteId: policy.websiteId, resourceType: policy.resourceType, recordId: item.id, recordFingerprint: item.fingerprint, purgedAt: run.createdAt, purgedBy: actor })))
    current.statistics.runs += 1
    current.statistics.purgedRecords += inspection.candidates.length
    current.statistics.heldRecords += inspection.held.length
    current.history.unshift({ id: crypto.randomUUID(), action: 'retention-policy.executed', runId: run.id, policyId: id, purgedCount: run.purgedCount, heldCount: run.heldCount, actor, createdAt: run.createdAt })
  })
  await writeStructuredLog('info', 'Retention policy executed', { policyId: id, runId: run.id, purgedCount: run.purgedCount, heldCount: run.heldCount })
  return run
}
export async function runRetentionCycle(options = {}) {
  const registry = await readRegistry()
  const results = []
  for (const policy of registry.policies.filter(item => item.enabled && item.websiteId !== '*')) {
    try {
      const result = await executeRetentionPolicy(policy.id, options.actor || { id: 'retention-scheduler' })
      if (result.noop !== true) results.push(result)
    } catch (error) {
      await mutate(current => { current.statistics.failures += 1; current.history.unshift({ id: crypto.randomUUID(), action: 'retention-policy.failed', policyId: policy.id, error: String(error?.message || error).slice(0, 2000), createdAt: nowIso() }) })
    }
  }
  return { processed: results.length, results }
}
export async function createComplianceReport() {
  const registry = await readRegistry()
  return {
    generatedAt: nowIso(), policyCount: registry.policies.length, enabledPolicyCount: registry.policies.filter(item => item.enabled).length,
    activeLegalHoldCount: registry.legalHolds.filter(item => item.enabled && (!item.expiresAt || new Date(item.expiresAt) > new Date())).length,
    statistics: registry.statistics, latestRuns: registry.runs.slice(0, 100),
    controls: { legalHolds: true, deletionPreviews: true, hashedPurgeEvidence: true, scheduledEnforcement: true },
  }
}
export function startRetentionScheduler(options = {}) {
  if (schedulerTimer) return schedulerTimer
  const intervalMs = Math.min(86400000, Math.max(60000, Number(options.intervalMs || process.env.RETENTION_INTERVAL_MS || 3600000)))
  const run = () => runRetentionCycle().catch(error => writeStructuredLog('error', 'Retention scheduler failed', { error: error.message }))
  schedulerTimer = setInterval(run, intervalMs)
  schedulerTimer.unref?.()
  if (options.runImmediately === true) run()
  return schedulerTimer
}
