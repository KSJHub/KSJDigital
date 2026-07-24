import crypto from 'node:crypto'
import net from 'node:net'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'abuse-protection', 'registry.json')
const mutations = new Map()
const MAX_HISTORY = 5000
const SUBJECT_TYPES = new Set(['ip', 'session', 'account', 'api-key'])
const DEFAULT_POLICY = { id: 'global', route: '*', methods: ['*'], subjectTypes: ['ip'], windowMs: 60_000, maximum: 300, blockMs: 5 * 60_000, enabled: true, priority: 0 }

export class AbuseProtectionError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'AbuseProtectionError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() { return { policies: [DEFAULT_POLICY], counters: {}, blocks: [], overrides: [], history: [], trustedProxies: ['127.0.0.1', '::1'], version: 1, updatedAt: nowIso() } }
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.policies ||= [DEFAULT_POLICY]
  registry.counters ||= {}
  registry.blocks ||= []
  registry.overrides ||= []
  registry.history ||= []
  registry.trustedProxies ||= []
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
    registry.blocks = registry.blocks.filter(item => !item.expiresAt || new Date(item.expiresAt).getTime() > Date.now()).slice(0, MAX_HISTORY)
    const cutoff = Date.now() - 7 * 86_400_000
    for (const [key, counter] of Object.entries(registry.counters)) if (counter.resetAt < cutoff) delete registry.counters[key]
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function text(value, label, maximum = 300) {
  const result = String(value || '').trim()
  if (!result) throw new AbuseProtectionError(`${label} is required`, 422)
  if (result.length > maximum) throw new AbuseProtectionError(`${label} is too long`, 422)
  return result
}
function policyId(value) {
  const id = safeName(value)
  if (!id || id === 'file') throw new AbuseProtectionError('Policy ID is required', 422)
  return id
}
function normalisePolicy(input = {}, existing = null) {
  const id = policyId(input.id || existing?.id)
  const route = text(input.route ?? existing?.route ?? '*', 'Policy route', 500)
  if (route !== '*' && !route.startsWith('/')) throw new AbuseProtectionError('Policy route must be * or start with /', 422)
  const methods = [...new Set((Array.isArray(input.methods) ? input.methods : existing?.methods || ['*']).map(item => String(item).trim().toUpperCase()).filter(Boolean))]
  if (!methods.length || methods.some(method => method !== '*' && !/^[A-Z]+$/.test(method))) throw new AbuseProtectionError('Policy methods are invalid', 422)
  const subjectTypes = [...new Set((Array.isArray(input.subjectTypes) ? input.subjectTypes : existing?.subjectTypes || ['ip']).map(String))]
  if (!subjectTypes.length || subjectTypes.some(type => !SUBJECT_TYPES.has(type))) throw new AbuseProtectionError('Policy subject types are invalid', 422)
  return {
    id,
    name: String(input.name ?? existing?.name ?? id).trim().slice(0, 200),
    route,
    methods,
    subjectTypes,
    windowMs: Math.min(86_400_000, Math.max(1000, Number(input.windowMs ?? existing?.windowMs ?? 60_000))),
    maximum: Math.min(1_000_000, Math.max(1, Number(input.maximum ?? existing?.maximum ?? 100))),
    blockMs: Math.min(30 * 86_400_000, Math.max(1000, Number(input.blockMs ?? existing?.blockMs ?? 300_000))),
    enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
    priority: Math.min(10_000, Math.max(-10_000, Number(input.priority ?? existing?.priority ?? 0))),
  }
}
function routeMatches(pattern, route) {
  if (pattern === '*') return true
  if (pattern.endsWith('*')) return route.startsWith(pattern.slice(0, -1))
  return route === pattern
}
function policyMatches(policy, context) { return policy.enabled && routeMatches(policy.route, context.route) && (policy.methods.includes('*') || policy.methods.includes(context.method)) }
function stripMappedAddress(value) { return String(value || '').replace(/^::ffff:/, '') }
function trustedProxy(address, configured) {
  const candidate = stripMappedAddress(address)
  return configured.some(item => stripMappedAddress(item) === candidate)
}
export function resolveClientIp(requestLike, trustedProxies = []) {
  const remote = stripMappedAddress(requestLike.socket?.remoteAddress || requestLike.connection?.remoteAddress || requestLike.ip || '')
  if (!trustedProxy(remote, trustedProxies)) return remote || 'unknown'
  const forwarded = String(requestLike.headers?.['x-forwarded-for'] || requestLike.get?.('x-forwarded-for') || '').split(',').map(item => stripMappedAddress(item.trim())).filter(Boolean)
  return forwarded.find(address => net.isIP(address)) || remote || 'unknown'
}
function subjects(context) {
  const output = []
  if (context.ip) output.push({ type: 'ip', id: context.ip })
  if (context.sessionId) output.push({ type: 'session', id: context.sessionId })
  if (context.accountId) output.push({ type: 'account', id: context.accountId })
  if (context.apiKeyId) output.push({ type: 'api-key', id: context.apiKeyId })
  return output
}
function overrideMatches(override, subject, policyIdValue) {
  if (override.subjectType !== subject.type || override.subjectId !== subject.id) return false
  if (override.policyId && override.policyId !== policyIdValue) return false
  return !override.expiresAt || new Date(override.expiresAt).getTime() > Date.now()
}
function blockMatches(block, subject, policyIdValue) {
  return block.subjectType === subject.type && block.subjectId === subject.id && (!block.policyId || block.policyId === policyIdValue) && (!block.expiresAt || new Date(block.expiresAt).getTime() > Date.now())
}
function subjectHash(subject) { return crypto.createHash('sha256').update(`${subject.type}:${subject.id}`).digest('hex') }

export async function getAbuseProtectionState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return { ...registry, counters: undefined, blocks: registry.blocks.slice(0, limit), history: registry.history.slice(0, limit), activeCounterCount: Object.keys(registry.counters).length }
}
export async function upsertAbusePolicy(input = {}, actor = null) {
  return mutate(registry => {
    const id = policyId(input.id)
    const existing = registry.policies.find(item => item.id === id)
    const policy = { ...normalisePolicy(input, existing), createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor, updatedAt: nowIso(), updatedBy: actor }
    registry.policies = [policy, ...registry.policies.filter(item => item.id !== id)].sort((a, b) => b.priority - a.priority)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'abuse-policy.updated', policyId: id, actor, createdAt: nowIso() })
    return policy
  })
}
export async function deleteAbusePolicy(idValue, actor = null) {
  const id = policyId(idValue)
  if (id === 'global') throw new AbuseProtectionError('The global abuse policy cannot be deleted', 409)
  return mutate(registry => {
    const existed = registry.policies.some(item => item.id === id)
    registry.policies = registry.policies.filter(item => item.id !== id)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'abuse-policy.deleted', policyId: id, actor, createdAt: nowIso() })
    return { deleted: existed, id }
  })
}
export async function updateTrustedProxies(values = [], actor = null) {
  const proxies = [...new Set((Array.isArray(values) ? values : []).map(item => stripMappedAddress(item.trim())).filter(item => net.isIP(item)))]
  return mutate(registry => {
    registry.trustedProxies = proxies
    registry.history.unshift({ id: crypto.randomUUID(), action: 'trusted-proxies.updated', count: proxies.length, actor, createdAt: nowIso() })
    return proxies
  })
}
export async function setAbuseOverride(input = {}, actor = null) {
  const subjectType = text(input.subjectType, 'Subject type', 30)
  if (!SUBJECT_TYPES.has(subjectType)) throw new AbuseProtectionError('Override subject type is invalid', 422)
  const subjectId = text(input.subjectId, 'Subject ID', 500)
  const mode = text(input.mode, 'Override mode', 20)
  if (!['allow', 'block'].includes(mode)) throw new AbuseProtectionError('Override mode must be allow or block', 422)
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new AbuseProtectionError('Override expiration is invalid', 422)
  return mutate(registry => {
    const record = { id: crypto.randomUUID(), subjectType, subjectId, policyId: input.policyId ? policyId(input.policyId) : null, mode, reason: String(input.reason || '').trim().slice(0, 500) || null, expiresAt: expiresAt?.toISOString() || null, createdAt: nowIso(), createdBy: actor }
    registry.overrides.unshift(record)
    registry.history.unshift({ id: crypto.randomUUID(), action: `abuse-override.${mode}`, overrideId: record.id, subjectType, policyId: record.policyId, actor, createdAt: nowIso() })
    return record
  })
}
export async function removeAbuseOverride(idValue, actor = null) {
  const id = text(idValue, 'Override ID', 100)
  return mutate(registry => {
    const existed = registry.overrides.some(item => item.id === id)
    registry.overrides = registry.overrides.filter(item => item.id !== id)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'abuse-override.removed', overrideId: id, actor, createdAt: nowIso() })
    return { removed: existed, id }
  })
}
export async function evaluateAbuseRequest(context = {}) {
  const route = text(context.route || '/', 'Request route', 2000)
  const method = String(context.method || 'GET').toUpperCase()
  return mutate(registry => {
    const applicable = registry.policies.filter(policy => policyMatches(policy, { route, method }))
    const requestSubjects = subjects(context)
    const now = Date.now()
    const decisions = []
    for (const policy of applicable) {
      for (const subject of requestSubjects.filter(item => policy.subjectTypes.includes(item.type))) {
        const override = registry.overrides.find(item => overrideMatches(item, subject, policy.id))
        if (override?.mode === 'allow') { decisions.push({ policyId: policy.id, subjectType: subject.type, allowed: true, reason: 'allow-override' }); continue }
        const blocked = override?.mode === 'block' || registry.blocks.some(item => blockMatches(item, subject, policy.id))
        if (blocked) return { allowed: false, status: 429, reason: override?.mode === 'block' ? 'block-override' : 'temporarily-blocked', policyId: policy.id, subjectType: subject.type, retryAfterMs: policy.blockMs }
        const key = `${policy.id}:${subjectHash(subject)}`
        const counter = registry.counters[key] || { startedAt: now, resetAt: now + policy.windowMs, count: 0 }
        if (now >= counter.resetAt) { counter.startedAt = now; counter.resetAt = now + policy.windowMs; counter.count = 0 }
        counter.count += 1
        registry.counters[key] = counter
        if (counter.count > policy.maximum) {
          const block = { id: crypto.randomUUID(), policyId: policy.id, subjectType: subject.type, subjectId: subject.id, createdAt: nowIso(), expiresAt: new Date(now + policy.blockMs).toISOString(), reason: 'rate-limit-exceeded' }
          registry.blocks.unshift(block)
          registry.history.unshift({ id: crypto.randomUUID(), action: 'abuse-request.blocked', policyId: policy.id, subjectType: subject.type, route, method, count: counter.count, createdAt: nowIso() })
          return { allowed: false, status: 429, reason: 'rate-limit-exceeded', policyId: policy.id, subjectType: subject.type, retryAfterMs: policy.blockMs, limit: policy.maximum, remaining: 0, resetAt: new Date(counter.resetAt).toISOString() }
        }
        decisions.push({ policyId: policy.id, subjectType: subject.type, allowed: true, limit: policy.maximum, remaining: Math.max(0, policy.maximum - counter.count), resetAt: new Date(counter.resetAt).toISOString() })
      }
    }
    return { allowed: true, reason: applicable.length ? 'within-limits' : 'no-policy', decisions }
  })
}
export function createAbuseProtectionMiddleware() {
  return async function abuseProtection(req, res, next) {
    try {
      const registry = await readRegistry()
      const decision = await evaluateAbuseRequest({ route: req.path || req.originalUrl || '/', method: req.method, ip: resolveClientIp(req, registry.trustedProxies), sessionId: req.session?.id || req.sessionID || null, accountId: req.session?.userId || req.session?.email || req.serviceAccount?.id || null, apiKeyId: req.apiKey?.id || null })
      const primary = decision.decisions?.[0]
      if (primary?.limit) { res.set('RateLimit-Limit', String(primary.limit)); res.set('RateLimit-Remaining', String(primary.remaining)); res.set('RateLimit-Reset', primary.resetAt) }
      if (!decision.allowed) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((decision.retryAfterMs || 1000) / 1000))))
        await writeStructuredLog('warn', 'Request blocked by abuse protection', { route: req.path, method: req.method, policyId: decision.policyId, subjectType: decision.subjectType })
        return res.status(decision.status || 429).json({ error: 'Too many requests', reason: decision.reason, retryAfterMs: decision.retryAfterMs })
      }
      req.abuseProtection = decision
      next()
    } catch (error) {
      next(error)
    }
  }
}
