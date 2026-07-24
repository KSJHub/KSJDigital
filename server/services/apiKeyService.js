import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'api-keys', 'registry.json')
const mutations = new Map()
const SUPPORTED_SCOPES = new Set(['system', 'website', 'content', 'assets', 'media', 'forms', 'commerce', 'automation', 'integrations', 'notifications', 'analytics'])
const SUPPORTED_ENVIRONMENTS = new Set(['development', 'staging', 'production'])
const MAX_HISTORY = 10000

export class ApiKeyError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'ApiKeyError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    keys: [], history: [],
    statistics: { created: 0, rotated: 0, revoked: 0, authenticated: 0, failed: 0 },
    version: 1, updatedAt: nowIso(),
  }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.keys ||= []
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
    registry.keys = registry.keys.slice(0, 50000)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function required(value, label, maximum = 500) {
  const result = String(value || '').trim()
  if (!result) throw new ApiKeyError(`${label} is required`, 422)
  if (result.length > maximum) throw new ApiKeyError(`${label} is too long`, 422)
  return result
}
function idValue(value, label) {
  const id = safeName(required(value, label, 200))
  if (!id || id === 'file') throw new ApiKeyError(`${label} is invalid`, 422)
  return id
}
function actorId(actor = {}) { return String(actor.id || actor.email || 'system').slice(0, 320) }
function hashSecret(value) { return crypto.createHash('sha256').update(String(value)).digest('hex') }
function createSecret(id) { return `ksj_${id}_${crypto.randomBytes(32).toString('base64url')}` }
function safeKey(key) { const { secretHash, ...safe } = key; return structuredClone(safe) }
function normaliseList(values, maximum = 100) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value).trim()).filter(Boolean))].slice(0, maximum)
}
function normaliseScopes(values, existing = []) {
  const scopes = normaliseList(values === undefined ? existing : values)
  if (!scopes.length) throw new ApiKeyError('At least one API key scope is required', 422)
  for (const scope of scopes) if (!SUPPORTED_SCOPES.has(scope)) throw new ApiKeyError(`Unsupported API key scope: ${scope}`, 422)
  return scopes
}
function normaliseEnvironment(value, existing = 'production') {
  const environment = String(value ?? existing).trim().toLowerCase()
  if (!SUPPORTED_ENVIRONMENTS.has(environment)) throw new ApiKeyError('API key environment is invalid', 422)
  return environment
}
function isoOrNull(value, label) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new ApiKeyError(`${label} is invalid`, 422)
  return date.toISOString()
}
function normaliseRestrictions(input = {}, existing = {}) {
  return {
    allowedIps: normaliseList(input.allowedIps === undefined ? existing.allowedIps : input.allowedIps, 500),
    allowedOrigins: normaliseList(input.allowedOrigins === undefined ? existing.allowedOrigins : input.allowedOrigins, 500).map(value => value.toLowerCase()),
    allowedUserAgents: normaliseList(input.allowedUserAgents === undefined ? existing.allowedUserAgents : input.allowedUserAgents, 100),
    maximumRequests: input.maximumRequests === undefined ? existing.maximumRequests || null : input.maximumRequests === null ? null : Math.max(1, Math.floor(Number(input.maximumRequests))),
  }
}
function activeStatus(key, at = Date.now()) {
  if (key.status === 'revoked') return 'revoked'
  if (key.status === 'superseded' && (!key.validUntil || new Date(key.validUntil).getTime() <= at)) return 'superseded'
  if (key.activeAt && new Date(key.activeAt).getTime() > at) return 'not-active'
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= at) return 'expired'
  if (key.validUntil && new Date(key.validUntil).getTime() <= at) return 'superseded'
  return 'active'
}
function timingSafeHashMatch(expectedHex, value) {
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = Buffer.from(hashSecret(value), 'hex')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}
function originMatches(allowed, supplied) {
  if (!allowed.length) return true
  const value = String(supplied || '').trim().toLowerCase()
  return allowed.includes(value)
}
function ipToInteger(ip) {
  const parts = String(ip || '').trim().split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts.reduce((value, part) => ((value << 8) | part) >>> 0, 0)
}
function ipMatches(rule, supplied) {
  if (!rule.includes('/')) return rule === supplied
  const [network, bitsText] = rule.split('/')
  const bits = Number(bitsText)
  const networkInt = ipToInteger(network)
  const suppliedInt = ipToInteger(supplied)
  if (networkInt === null || suppliedInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (networkInt & mask) === (suppliedInt & mask)
}
function userAgentMatches(allowed, supplied) {
  if (!allowed.length) return true
  const value = String(supplied || '').toLowerCase()
  return allowed.some(pattern => value.includes(pattern.toLowerCase()))
}

export async function getApiKeyState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return {
    ...registry,
    keys: registry.keys.slice(0, limit).map(key => ({ ...safeKey(key), effectiveStatus: activeStatus(key) })),
    history: registry.history.slice(0, limit),
    supportedScopes: [...SUPPORTED_SCOPES], supportedEnvironments: [...SUPPORTED_ENVIRONMENTS],
  }
}

export async function createApiKey(input = {}, actor = null) {
  const id = input.id ? idValue(input.id, 'API key ID') : safeName(crypto.randomUUID())
  const secret = createSecret(id)
  const createdAt = nowIso()
  const key = {
    id, name: required(input.name || id, 'API key name', 200), secretHash: hashSecret(secret), prefix: secret.slice(0, Math.min(24, secret.length)),
    scopes: normaliseScopes(input.scopes), websiteIds: normaliseList(input.websiteIds, 1000).map(value => idValue(value, 'Website ID')),
    environment: normaliseEnvironment(input.environment), readOnly: input.readOnly === true,
    activeAt: isoOrNull(input.activeAt, 'Activation date'), expiresAt: isoOrNull(input.expiresAt, 'Expiry date'),
    restrictions: normaliseRestrictions(input.restrictions), status: 'active', usageCount: 0, failedCount: 0,
    lastUsedAt: null, lastFailedAt: null, createdAt, createdBy: actor, updatedAt: createdAt, updatedBy: actor,
    rotatedFromKeyId: input.rotatedFromKeyId || null, rotatedToKeyId: null, validUntil: null,
  }
  if (key.activeAt && key.expiresAt && new Date(key.activeAt) >= new Date(key.expiresAt)) throw new ApiKeyError('Expiry date must be after activation date', 422)
  await mutate(registry => {
    if (registry.keys.some(item => item.id === id)) throw new ApiKeyError('API key ID already exists', 409)
    registry.keys.unshift(key)
    registry.statistics.created += 1
    registry.history.unshift({ id: crypto.randomUUID(), action: 'api-key.created', keyId: id, actor, createdAt })
  })
  return { key: safeKey(key), secret }
}

export async function updateApiKey(value, input = {}, actor = null) {
  const id = idValue(value, 'API key ID')
  return mutate(registry => {
    const key = registry.keys.find(item => item.id === id)
    if (!key) throw new ApiKeyError('API key not found', 404)
    if (key.status === 'revoked') throw new ApiKeyError('Revoked API keys cannot be updated', 409)
    if ('name' in input) key.name = required(input.name, 'API key name', 200)
    if ('scopes' in input) key.scopes = normaliseScopes(input.scopes, key.scopes)
    if ('websiteIds' in input) key.websiteIds = normaliseList(input.websiteIds, 1000).map(value => idValue(value, 'Website ID'))
    if ('environment' in input) key.environment = normaliseEnvironment(input.environment, key.environment)
    if ('readOnly' in input) key.readOnly = input.readOnly === true
    if ('activeAt' in input) key.activeAt = isoOrNull(input.activeAt, 'Activation date')
    if ('expiresAt' in input) key.expiresAt = isoOrNull(input.expiresAt, 'Expiry date')
    if ('restrictions' in input) key.restrictions = normaliseRestrictions(input.restrictions, key.restrictions)
    if (key.activeAt && key.expiresAt && new Date(key.activeAt) >= new Date(key.expiresAt)) throw new ApiKeyError('Expiry date must be after activation date', 422)
    key.updatedAt = nowIso(); key.updatedBy = actor
    registry.history.unshift({ id: crypto.randomUUID(), action: 'api-key.updated', keyId: id, actor, createdAt: key.updatedAt })
    return safeKey(key)
  })
}

export async function revokeApiKey(value, input = {}, actor = null) {
  const id = idValue(value, 'API key ID')
  return mutate(registry => {
    const key = registry.keys.find(item => item.id === id)
    if (!key) throw new ApiKeyError('API key not found', 404)
    if (key.status !== 'revoked') registry.statistics.revoked += 1
    key.status = 'revoked'; key.revokedAt = nowIso(); key.revokedBy = actor; key.revocationReason = String(input.reason || '').slice(0, 2000)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'api-key.revoked', keyId: id, actor, createdAt: key.revokedAt })
    return safeKey(key)
  })
}

export async function rotateApiKey(value, input = {}, actor = null) {
  const id = idValue(value, 'API key ID')
  const registry = await readRegistry()
  const current = registry.keys.find(item => item.id === id)
  if (!current) throw new ApiKeyError('API key not found', 404)
  if (activeStatus(current) === 'revoked') throw new ApiKeyError('Revoked API keys cannot be rotated', 409)
  const transitionSeconds = Math.min(86400, Math.max(0, Number(input.transitionSeconds || 0)))
  const replacement = await createApiKey({
    name: input.name || `${current.name} rotation`, scopes: current.scopes, websiteIds: current.websiteIds,
    environment: current.environment, readOnly: current.readOnly, activeAt: nowIso(), expiresAt: input.expiresAt ?? current.expiresAt,
    restrictions: current.restrictions, rotatedFromKeyId: id,
  }, actor)
  await mutate(state => {
    const oldKey = state.keys.find(item => item.id === id)
    const newKey = state.keys.find(item => item.id === replacement.key.id)
    oldKey.status = 'superseded'; oldKey.rotatedToKeyId = newKey.id; oldKey.validUntil = new Date(Date.now() + transitionSeconds * 1000).toISOString(); oldKey.updatedAt = nowIso(); oldKey.updatedBy = actor
    state.statistics.rotated += 1
    state.history.unshift({ id: crypto.randomUUID(), action: 'api-key.rotated', keyId: id, replacementKeyId: newKey.id, transitionSeconds, actor, createdAt: nowIso() })
  })
  return replacement
}

export async function authenticateApiKey(secret, context = {}) {
  const supplied = required(secret, 'API key', 1000)
  const registry = await readRegistry()
  const key = registry.keys.find(item => timingSafeHashMatch(item.secretHash, supplied))
  const failure = async (message, status = 401, keyId = null) => {
    await mutate(state => {
      if (keyId) { const item = state.keys.find(candidate => candidate.id === keyId); if (item) { item.failedCount += 1; item.lastFailedAt = nowIso() } }
      state.statistics.failed += 1
      state.history.unshift({ id: crypto.randomUUID(), action: 'api-key.authentication-failed', keyId, reason: message, createdAt: nowIso() })
    })
    throw new ApiKeyError(message, status)
  }
  if (!key) return failure('API key is invalid')
  const status = activeStatus(key)
  if (status !== 'active') return failure(`API key is ${status}`, 403, key.id)
  const requiredScope = context.scope ? String(context.scope) : null
  if (requiredScope && !key.scopes.includes('system') && !key.scopes.includes(requiredScope)) return failure('API key scope is not authorised', 403, key.id)
  if (context.websiteId && key.websiteIds.length && !key.websiteIds.includes(String(context.websiteId))) return failure('API key is not authorised for this website', 403, key.id)
  if (context.environment && key.environment !== context.environment) return failure('API key environment does not match', 403, key.id)
  if (key.readOnly && context.write === true) return failure('API key is read-only', 403, key.id)
  if (key.restrictions.allowedIps.length && !key.restrictions.allowedIps.some(rule => ipMatches(rule, context.ip))) return failure('API key IP restriction failed', 403, key.id)
  if (!originMatches(key.restrictions.allowedOrigins, context.origin)) return failure('API key origin restriction failed', 403, key.id)
  if (!userAgentMatches(key.restrictions.allowedUserAgents, context.userAgent)) return failure('API key User-Agent restriction failed', 403, key.id)
  if (key.restrictions.maximumRequests && key.usageCount >= key.restrictions.maximumRequests) return failure('API key request limit reached', 429, key.id)
  await mutate(state => {
    const item = state.keys.find(candidate => candidate.id === key.id)
    item.usageCount += 1; item.lastUsedAt = nowIso(); item.lastIp = context.ip || null; item.lastOrigin = context.origin || null
    state.statistics.authenticated += 1
    state.history.unshift({ id: crypto.randomUUID(), action: 'api-key.authenticated', keyId: key.id, scope: requiredScope, websiteId: context.websiteId || null, createdAt: item.lastUsedAt })
  })
  await writeStructuredLog('info', 'API key authenticated', { keyId: key.id, scope: requiredScope, websiteId: context.websiteId || null })
  return safeKey({ ...key, usageCount: key.usageCount + 1, lastUsedAt: nowIso() })
}

export function createApiKeyAuthenticationMiddleware(options = {}) {
  return async function apiKeyAuthentication(req, res, next) {
    try {
      const authorization = String(req.headers.authorization || '')
      const secret = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : String(req.headers['x-api-key'] || '').trim()
      req.apiKey = await authenticateApiKey(secret, {
        scope: typeof options.scope === 'function' ? options.scope(req) : options.scope,
        websiteId: typeof options.websiteId === 'function' ? options.websiteId(req) : options.websiteId,
        environment: options.environment || process.env.NODE_ENV || 'development', write: options.write ?? !['GET', 'HEAD', 'OPTIONS'].includes(req.method),
        ip: req.ip || req.socket?.remoteAddress || '', origin: req.headers.origin || '', userAgent: req.headers['user-agent'] || '',
      })
      next()
    } catch (error) { next(error) }
  }
}
