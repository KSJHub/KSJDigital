import crypto from 'node:crypto'
import path from 'node:path'
import { promisify } from 'node:util'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'
import { writeStructuredLog } from './systemHealthService.js'

const scrypt = promisify(crypto.scrypt)
const REGISTRY_FILE = path.join(DATA_DIR, 'service-accounts', 'registry.json')
const mutations = new Map()
const MAX_HISTORY = 5000
const DEFAULT_RATE_LIMIT = { windowMs: 60_000, maximum: 120 }

export class ServiceAccountError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'ServiceAccountError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() { return { accounts: [], keys: [], usage: [], history: [], version: 1, updatedAt: nowIso() } }
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.accounts ||= []
  registry.keys ||= []
  registry.usage ||= []
  registry.history ||= []
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
    registry.usage = registry.usage.slice(0, MAX_HISTORY)
    registry.history = registry.history.slice(0, MAX_HISTORY)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function required(value, label, maximum = 300) {
  const result = String(value || '').trim()
  if (!result) throw new ServiceAccountError(`${label} is required`, 422)
  if (result.length > maximum) throw new ServiceAccountError(`${label} is too long`, 422)
  return result
}
function accountId(value) {
  const id = safeName(value)
  if (!id || id === 'file') throw new ServiceAccountError('Service account ID is required', 422)
  return id
}
function scopes(value) {
  const list = [...new Set((Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(Boolean))]
  if (!list.length) throw new ServiceAccountError('At least one scope is required', 422)
  for (const scope of list) if (!/^[a-z][a-z0-9:.*_-]{0,99}$/i.test(scope)) throw new ServiceAccountError(`Invalid scope: ${scope}`, 422)
  return list.sort()
}
function rateLimit(input = {}, existing = null) {
  const windowMs = Math.min(86_400_000, Math.max(1000, Number(input.windowMs ?? existing?.windowMs ?? DEFAULT_RATE_LIMIT.windowMs)))
  const maximum = Math.min(100_000, Math.max(1, Number(input.maximum ?? existing?.maximum ?? DEFAULT_RATE_LIMIT.maximum)))
  return { windowMs, maximum }
}
function publicKey(key) {
  const { secretHash, salt, ...safe } = key
  return structuredClone(safe)
}
async function hashSecret(secret, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = await scrypt(secret, salt, 64)
  return { salt, secretHash: Buffer.from(derived).toString('hex') }
}
async function matchesSecret(secret, key) {
  const candidate = await hashSecret(secret, key.salt)
  const left = Buffer.from(candidate.secretHash, 'hex')
  const right = Buffer.from(key.secretHash, 'hex')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}
function hasScope(granted, requiredScope) {
  if (!requiredScope) return true
  if (granted.includes('*') || granted.includes(requiredScope)) return true
  const segments = requiredScope.split(':')
  while (segments.length > 1) {
    segments.pop()
    if (granted.includes(`${segments.join(':')}:*`)) return true
  }
  return false
}
function parsePresentedKey(value) {
  const presented = String(value || '').trim().replace(/^Bearer\s+/i, '')
  const match = /^ksj_([a-z0-9_-]{6,80})\.([A-Za-z0-9_-]{32,})$/.exec(presented)
  if (!match) throw new ServiceAccountError('API key format is invalid', 401)
  return { keyId: match[1], secret: match[2] }
}
function authenticationFailure(error) {
  const message = String(error?.message || '')
  if (message === 'API key has expired') return { topic: 'api-key.expired', category: 'expired' }
  if (message === 'API key rate limit exceeded') return { topic: 'api-key.rate-limit-exceeded', category: 'rate-limited' }
  if (message === 'Service account is disabled') return { topic: 'api-key.authentication-failed', category: 'account-disabled' }
  if (message === 'API key does not grant the required scope') return { topic: 'api-key.authentication-failed', category: 'scope-denied' }
  if (message === 'API key format is invalid') return { topic: 'api-key.authentication-failed', category: 'invalid-format' }
  return { topic: 'api-key.authentication-failed', category: 'invalid-credentials' }
}

function apiKeyAuthenticationPayload(details = {}) {
  return {
    authenticated: details.authenticated === true,
    scopeRequired: details.scopeRequired === true,
    retryable: details.retryable === true,
    expired: details.category === 'expired',
    rateLimited: details.category === 'rate-limited',
    accountDisabled: details.category === 'account-disabled',
    scopeDenied: details.category === 'scope-denied',
    invalidFormat: details.category === 'invalid-format',
  }
}

async function publishApiKeyRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export async function getServiceAccountState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return { ...registry, keys: registry.keys.map(publicKey), usage: registry.usage.slice(0, limit), history: registry.history.slice(0, limit) }
}

export async function upsertServiceAccount(input = {}, actor = null) {
  const id = accountId(input.id || input.name)
  const name = required(input.name || id, 'Service account name', 200)
  return mutate(registry => {
    const existing = registry.accounts.find(item => item.id === id)
    const account = {
      id,
      name,
      description: String(input.description || '').trim().slice(0, 2000) || null,
      enabled: input.enabled !== false,
      metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? structuredClone(input.metadata) : {},
      createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor,
      updatedAt: nowIso(), updatedBy: actor,
    }
    registry.accounts = [account, ...registry.accounts.filter(item => item.id !== id)]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'service-account.updated', accountId: id, actor, createdAt: nowIso() })
    return account
  })
}

export async function issueApiKey(accountIdValue, input = {}, actor = null) {
  const id = accountId(accountIdValue)
  const registry = await readRegistry()
  const account = registry.accounts.find(item => item.id === id)
  if (!account || !account.enabled) throw new ServiceAccountError('Service account was not found or is disabled', 404)
  const keyId = crypto.randomBytes(9).toString('base64url').toLowerCase()
  const secret = crypto.randomBytes(32).toString('base64url')
  const hashed = await hashSecret(secret)
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + 365 * 86_400_000)
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new ServiceAccountError('API key expiration must be in the future', 422)
  const key = await mutate(current => {
    const record = {
      id: keyId,
      accountId: id,
      name: required(input.name || `Key ${keyId}`, 'API key name', 200),
      scopes: scopes(input.scopes),
      rateLimit: rateLimit(input.rateLimit),
      secretHash: hashed.secretHash,
      salt: hashed.salt,
      status: 'active',
      expiresAt: expiresAt.toISOString(),
      lastUsedAt: null,
      usageCount: 0,
      createdAt: nowIso(),
      createdBy: actor,
      revokedAt: null,
      revokedBy: null,
      rotatedFromKeyId: input.rotatedFromKeyId || null,
    }
    current.keys.unshift(record)
    current.history.unshift({ id: crypto.randomUUID(), action: 'api-key.issued', accountId: id, keyId, scopes: record.scopes, actor, createdAt: nowIso() })
    return publicKey(record)
  })
  return { key, token: `ksj_${keyId}.${secret}` }
}

export async function rotateApiKey(keyIdValue, input = {}, actor = null) {
  const keyId = required(keyIdValue, 'API key ID', 100)
  const state = await readRegistry()
  const current = state.keys.find(item => item.id === keyId)
  if (!current) throw new ServiceAccountError('API key not found', 404)
  const replacement = await issueApiKey(current.accountId, {
    name: input.name || current.name,
    scopes: input.scopes || current.scopes,
    expiresAt: input.expiresAt,
    rateLimit: input.rateLimit || current.rateLimit,
    rotatedFromKeyId: current.id,
  }, actor)
  await revokeApiKey(current.id, actor, 'rotated')
  return replacement
}

export async function revokeApiKey(keyIdValue, actor = null, reason = 'revoked') {
  const keyId = required(keyIdValue, 'API key ID', 100)
  return mutate(registry => {
    const key = registry.keys.find(item => item.id === keyId)
    if (!key) throw new ServiceAccountError('API key not found', 404)
    if (key.status !== 'revoked') {
      key.status = 'revoked'; key.revokedAt = nowIso(); key.revokedBy = actor
      registry.history.unshift({ id: crypto.randomUUID(), action: 'api-key.revoked', accountId: key.accountId, keyId, reason, actor, createdAt: nowIso() })
    }
    return publicKey(key)
  })
}

export async function authenticateApiKey(presentedValue, options = {}) {
  const { keyId, secret } = parsePresentedKey(presentedValue)
  const outcome = await mutate(async registry => {
    const key = registry.keys.find(item => item.id === keyId)
    if (!key || key.status !== 'active') throw new ServiceAccountError('API key is invalid or revoked', 401)
    if (new Date(key.expiresAt).getTime() <= Date.now()) {
      key.status = 'expired'
      registry.history.unshift({ id: crypto.randomUUID(), action: 'api-key.expired', accountId: key.accountId, keyId: key.id, createdAt: nowIso() })
      return { authenticationError: { message: 'API key has expired', status: 401 } }
    }
    const account = registry.accounts.find(item => item.id === key.accountId)
    if (!account || !account.enabled) throw new ServiceAccountError('Service account is disabled', 403)
    if (!await matchesSecret(secret, key)) throw new ServiceAccountError('API key is invalid', 401)
    if (!hasScope(key.scopes, options.scope)) throw new ServiceAccountError('API key does not grant the required scope', 403, { requiredScope: options.scope })
    const now = Date.now()
    const usageWindow = registry.usage.filter(item => item.keyId === key.id && new Date(item.createdAt).getTime() > now - key.rateLimit.windowMs)
    if (usageWindow.length >= key.rateLimit.maximum) throw new ServiceAccountError('API key rate limit exceeded', 429, { retryAfterMs: key.rateLimit.windowMs })
    key.lastUsedAt = nowIso(); key.usageCount += 1
    const usage = { id: crypto.randomUUID(), accountId: account.id, keyId: key.id, scope: options.scope || null, resource: options.resource || null, createdAt: nowIso() }
    registry.usage.unshift(usage)
    return { account: structuredClone(account), key: publicKey(key), usage }
  })
  if (outcome?.authenticationError) throw new ServiceAccountError(outcome.authenticationError.message, outcome.authenticationError.status)
  return outcome
}

export function createApiKeyAuthMiddleware(requiredScope = null) {
  return async function apiKeyAuthentication(req, res, next) {
    try {
      const authenticated = await authenticateApiKey(req.get('authorization') || req.get('x-api-key'), { scope: requiredScope, resource: req.originalUrl })
      req.serviceAccount = authenticated.account
      req.apiKey = authenticated.key
      await publishApiKeyRealtimeEvent('api-key.authenticated', apiKeyAuthenticationPayload({ authenticated: true, scopeRequired: Boolean(requiredScope) }))
      next()
    } catch (error) {
      const failure = authenticationFailure(error)
      await publishApiKeyRealtimeEvent(failure.topic, apiKeyAuthenticationPayload({ category: failure.category, scopeRequired: Boolean(requiredScope), retryable: Number(error.status) === 429 }))
      res.status(Number(error.status) || 401).json({ error: error.message || 'API key authentication failed', ...(error.details ? { details: error.details } : {}) })
    }
  }
}

export async function disableServiceAccount(accountIdValue, actor = null) {
  const id = accountId(accountIdValue)
  const result = await mutate(registry => {
    const account = registry.accounts.find(item => item.id === id)
    if (!account) throw new ServiceAccountError('Service account not found', 404)
    account.enabled = false; account.updatedAt = nowIso(); account.updatedBy = actor
    for (const key of registry.keys.filter(item => item.accountId === id && item.status === 'active')) { key.status = 'revoked'; key.revokedAt = nowIso(); key.revokedBy = actor }
    registry.history.unshift({ id: crypto.randomUUID(), action: 'service-account.disabled', accountId: id, actor, createdAt: nowIso() })
    return account
  })
  await writeStructuredLog('warn', 'Service account disabled', { accountId: id })
  return result
}
