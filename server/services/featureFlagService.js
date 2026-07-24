import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { publishIntegrationEvent } from './integrationService.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'feature-flags', 'registry.json')
const mutations = new Map()
const MAX_HISTORY = 5000
const MAX_EVALUATIONS = 10000
const ENVIRONMENTS = new Set(['development', 'test', 'staging', 'production'])

export class FeatureFlagError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'FeatureFlagError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() { return { flags: [], history: [], evaluations: [], version: 1, updatedAt: nowIso() } }
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.flags ||= []
  registry.history ||= []
  registry.evaluations ||= []
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
    registry.evaluations = registry.evaluations.slice(0, MAX_EVALUATIONS)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function requiredText(value, label, maximum = 200) {
  const result = String(value || '').trim()
  if (!result) throw new FeatureFlagError(`${label} is required`, 422)
  if (result.length > maximum) throw new FeatureFlagError(`${label} is too long`, 422)
  return result
}
function uniqueStrings(value, normaliser = item => String(item).trim()) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(normaliser).filter(Boolean))]
}
function normaliseFlag(input = {}, existing = null) {
  const key = safeName(input.key || input.id || existing?.key)
  if (!key || key === 'file') throw new FeatureFlagError('Feature flag key is required', 422)
  const environments = uniqueStrings(input.environments ?? existing?.environments, item => String(item).trim().toLowerCase())
  if (environments.some(item => !ENVIRONMENTS.has(item))) throw new FeatureFlagError('Feature flag environment is invalid', 422)
  const percentage = Math.min(100, Math.max(0, Number(input.percentage ?? existing?.percentage ?? 100)))
  return {
    key,
    name: requiredText(input.name || existing?.name || key, 'Feature flag name'),
    description: String(input.description ?? existing?.description ?? '').trim().slice(0, 2000) || null,
    enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
    killSwitch: input.killSwitch === undefined ? existing?.killSwitch === true : input.killSwitch === true,
    percentage,
    environments,
    websiteIds: uniqueStrings(input.websiteIds ?? existing?.websiteIds, safeName),
    userIds: uniqueStrings(input.userIds ?? existing?.userIds, item => String(item).trim().toLowerCase()),
    excludedWebsiteIds: uniqueStrings(input.excludedWebsiteIds ?? existing?.excludedWebsiteIds, safeName),
    excludedUserIds: uniqueStrings(input.excludedUserIds ?? existing?.excludedUserIds, item => String(item).trim().toLowerCase()),
    salt: existing?.salt || crypto.randomBytes(16).toString('hex'),
  }
}
function actorId(actor) { return actor?.id || actor?.email || 'unknown' }
function bucketFor(flag, subject) {
  const digest = crypto.createHash('sha256').update(`${flag.key}:${flag.salt}:${subject}`).digest()
  return digest.readUInt32BE(0) / 0x100000000 * 100
}
function evaluationContext(input = {}) {
  const environment = String(input.environment || process.env.NODE_ENV || 'development').trim().toLowerCase()
  if (!ENVIRONMENTS.has(environment)) throw new FeatureFlagError('Evaluation environment is invalid', 422)
  const websiteId = input.websiteId ? safeName(input.websiteId) : null
  const userId = input.userId ? String(input.userId).trim().toLowerCase() : null
  const subject = userId || websiteId || String(input.subjectKey || 'anonymous').trim()
  return { environment, websiteId, userId, subject }
}
function evaluate(flag, context) {
  if (flag.killSwitch) return { enabled: false, reason: 'kill-switch', bucket: null }
  if (!flag.enabled) return { enabled: false, reason: 'disabled', bucket: null }
  if (flag.environments.length && !flag.environments.includes(context.environment)) return { enabled: false, reason: 'environment-not-targeted', bucket: null }
  if (context.websiteId && flag.excludedWebsiteIds.includes(context.websiteId)) return { enabled: false, reason: 'website-excluded', bucket: null }
  if (context.userId && flag.excludedUserIds.includes(context.userId)) return { enabled: false, reason: 'user-excluded', bucket: null }
  if (context.userId && flag.userIds.includes(context.userId)) return { enabled: true, reason: 'user-targeted', bucket: null }
  if (context.websiteId && flag.websiteIds.includes(context.websiteId)) return { enabled: true, reason: 'website-targeted', bucket: null }
  const hasExplicitTargets = flag.userIds.length || flag.websiteIds.length
  if (hasExplicitTargets && flag.percentage >= 100) return { enabled: false, reason: 'not-targeted', bucket: null }
  const bucket = bucketFor(flag, context.subject)
  return { enabled: bucket < flag.percentage, reason: bucket < flag.percentage ? 'percentage-rollout' : 'percentage-excluded', bucket }
}

export async function getFeatureFlagState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return { ...registry, history: registry.history.slice(0, limit), evaluations: registry.evaluations.slice(0, limit), environments: [...ENVIRONMENTS] }
}
export async function upsertFeatureFlag(input = {}, actor = null) {
  return mutate(registry => {
    const key = safeName(input.key || input.id)
    const existing = registry.flags.find(item => item.key === key)
    const normalised = normaliseFlag(input, existing)
    const flag = { ...normalised, createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor, updatedAt: nowIso(), updatedBy: actor }
    registry.flags = [flag, ...registry.flags.filter(item => item.key !== flag.key)]
    registry.history.unshift({ id: crypto.randomUUID(), action: existing ? 'feature-flag.updated' : 'feature-flag.created', flagKey: flag.key, actor, createdAt: nowIso() })
    return structuredClone(flag)
  })
}
export async function deleteFeatureFlag(keyValue, actor = null) {
  const key = safeName(keyValue)
  return mutate(registry => {
    const existed = registry.flags.some(item => item.key === key)
    registry.flags = registry.flags.filter(item => item.key !== key)
    if (existed) registry.history.unshift({ id: crypto.randomUUID(), action: 'feature-flag.deleted', flagKey: key, actor, createdAt: nowIso() })
    return { deleted: existed, key }
  })
}
export async function setFeatureFlagKillSwitch(keyValue, enabled, actor = null) {
  const key = safeName(keyValue)
  const result = await mutate(registry => {
    const flag = registry.flags.find(item => item.key === key)
    if (!flag) throw new FeatureFlagError('Feature flag not found', 404)
    flag.killSwitch = enabled === true
    flag.updatedAt = nowIso()
    flag.updatedBy = actor
    registry.history.unshift({ id: crypto.randomUUID(), action: flag.killSwitch ? 'feature-flag.kill-switch-enabled' : 'feature-flag.kill-switch-disabled', flagKey: key, actor, createdAt: nowIso() })
    return structuredClone(flag)
  })
  await writeStructuredLog('warn', `Feature flag kill switch ${result.killSwitch ? 'enabled' : 'disabled'}`, { flagKey: key, actor: actorId(actor) })
  publishIntegrationEvent('global', result.killSwitch ? 'feature-flag.kill-switch-enabled' : 'feature-flag.kill-switch-disabled', { flagKey: key }, { featureFlags: true }).catch(() => {})
  return result
}
export async function evaluateFeatureFlag(keyValue, input = {}, options = {}) {
  const key = safeName(keyValue)
  const registry = await readRegistry()
  const flag = registry.flags.find(item => item.key === key)
  if (!flag) return { key, enabled: false, reason: 'flag-not-found', context: evaluationContext(input), evaluatedAt: nowIso() }
  const context = evaluationContext(input)
  const result = evaluate(flag, context)
  const evaluation = { id: crypto.randomUUID(), key, ...result, context, evaluatedAt: nowIso() }
  if (options.record !== false) {
    await mutate(current => {
      current.evaluations.unshift(evaluation)
      return null
    })
  }
  return evaluation
}
export async function evaluateFeatureFlags(keys, input = {}, options = {}) {
  const values = Array.isArray(keys) ? keys : []
  const results = {}
  for (const key of values) results[safeName(key)] = await evaluateFeatureFlag(key, input, options)
  return results
}
