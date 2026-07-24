import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, writeJson } from '../storage.js'
import { publishIntegrationEvent } from './integrationService.js'
import { writeStructuredLog } from './systemHealthService.js'

const ROOT = path.join(DATA_DIR, 'configuration')
const REGISTRY_FILE = path.join(ROOT, 'registry.json')
const locks = new Map()
const subscribers = new Set()

const DEFAULT_SCHEMA = {
  'runtime.environment': { type: 'enum', values: ['development', 'test', 'staging', 'production'], default: 'development', restartRequired: false },
  'runtime.publicUrl': { type: 'url', nullable: true, default: null, restartRequired: false },
  'runtime.trustedOrigins': { type: 'string-array', default: [], restartRequired: false },
  'runtime.logLevel': { type: 'enum', values: ['debug', 'info', 'warn', 'error', 'fatal'], default: 'info', restartRequired: false },
  'security.sessionSecret': { type: 'secret', requiredIn: ['production'], environment: 'SESSION_SECRET', restartRequired: true },
  'security.integrationSigningSecret': { type: 'secret', requiredIn: ['production'], environment: 'INTEGRATION_SIGNING_SECRET', restartRequired: true },
  'backup.enabled': { type: 'boolean', default: true, restartRequired: false },
  'backup.intervalMs': { type: 'integer', min: 3600000, max: 31536000000, default: 86400000, restartRequired: false },
  'observability.enabled': { type: 'boolean', default: true, restartRequired: false },
}

export class ConfigurationError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'ConfigurationError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    schema: structuredClone(DEFAULT_SCHEMA),
    environments: { development: {}, test: {}, staging: {}, production: {} },
    secrets: {},
    history: [],
    activeEnvironment: process.env.NODE_ENV || 'development',
    version: 1,
    updatedAt: nowIso(),
  }
}

async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.schema = { ...structuredClone(DEFAULT_SCHEMA), ...(registry.schema || {}) }
  registry.environments ||= { development: {}, test: {}, staging: {}, production: {} }
  registry.secrets ||= {}
  registry.history ||= []
  registry.activeEnvironment ||= process.env.NODE_ENV || 'development'
  registry.version ||= 1
  return registry
}

async function mutate(operation) {
  const previous = locks.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = structuredClone(await readRegistry())
    const result = await operation(registry)
    registry.version += 1
    registry.updatedAt = nowIso()
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  locks.set('registry', current)
  try { return await current } finally { if (locks.get('registry') === current) locks.delete('registry') }
}

function normaliseEnvironment(value) {
  const environment = String(value || '').trim().toLowerCase()
  if (!['development', 'test', 'staging', 'production'].includes(environment)) throw new ConfigurationError('Environment is invalid', 422)
  return environment
}

function validateValue(key, value, definition) {
  if (value === null && definition.nullable) return null
  if (definition.type === 'string') {
    if (typeof value !== 'string') throw new ConfigurationError(`${key} must be a string`, 422)
    if (definition.minLength && value.length < definition.minLength) throw new ConfigurationError(`${key} is too short`, 422)
    if (definition.maxLength && value.length > definition.maxLength) throw new ConfigurationError(`${key} is too long`, 422)
    return value
  }
  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') throw new ConfigurationError(`${key} must be a boolean`, 422)
    return value
  }
  if (definition.type === 'integer') {
    if (!Number.isInteger(value)) throw new ConfigurationError(`${key} must be an integer`, 422)
    if (definition.min !== undefined && value < definition.min) throw new ConfigurationError(`${key} is below its minimum`, 422)
    if (definition.max !== undefined && value > definition.max) throw new ConfigurationError(`${key} exceeds its maximum`, 422)
    return value
  }
  if (definition.type === 'enum') {
    if (!definition.values?.includes(value)) throw new ConfigurationError(`${key} must be one of: ${definition.values?.join(', ')}`, 422)
    return value
  }
  if (definition.type === 'url') {
    if (typeof value !== 'string') throw new ConfigurationError(`${key} must be a URL`, 422)
    let parsed
    try { parsed = new URL(value) } catch { throw new ConfigurationError(`${key} must be a valid URL`, 422) }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new ConfigurationError(`${key} must use HTTP or HTTPS`, 422)
    return parsed.toString()
  }
  if (definition.type === 'string-array') {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new ConfigurationError(`${key} must be an array of strings`, 422)
    return [...new Set(value.map(item => item.trim()).filter(Boolean))]
  }
  if (definition.type === 'secret') throw new ConfigurationError(`${key} must be managed through the secrets API`, 422)
  throw new ConfigurationError(`Unsupported schema type for ${key}`, 422)
}

function secretReference(name) { return `secret://${name}` }
function maskSecret(record) {
  if (!record) return null
  return { name: record.name, reference: secretReference(record.name), source: record.source, configured: Boolean(record.value || record.environment), updatedAt: record.updatedAt }
}
function resolveSecretRecord(record) {
  if (!record) return null
  if (record.source === 'environment') return process.env[record.environment] || null
  return record.value || null
}

function effectiveValue(registry, key, environment) {
  const definition = registry.schema[key]
  const override = registry.environments[environment]?.[key]
  if (override !== undefined) return override
  if (definition?.type === 'secret') {
    const name = definition.environment || key
    return resolveSecretRecord(registry.secrets[name]) || process.env[definition.environment || ''] || null
  }
  return definition?.default ?? null
}

function redactValue(definition, value) {
  return definition?.type === 'secret' && value ? '[configured]' : value
}

export async function getConfiguration(environmentValue) {
  const registry = await readRegistry()
  const environment = normaliseEnvironment(environmentValue || registry.activeEnvironment)
  const values = {}
  for (const [key, definition] of Object.entries(registry.schema)) values[key] = redactValue(definition, effectiveValue(registry, key, environment))
  return {
    environment,
    activeEnvironment: registry.activeEnvironment,
    version: registry.version,
    values,
    schema: registry.schema,
    secrets: Object.values(registry.secrets).map(maskSecret),
    updatedAt: registry.updatedAt,
  }
}

export async function updateConfiguration(environmentValue, input = {}, actor = null) {
  const environment = normaliseEnvironment(environmentValue)
  const changes = input.values && typeof input.values === 'object' ? input.values : input
  return mutate(async registry => {
    const before = structuredClone(registry.environments[environment] || {})
    const next = { ...before }
    const restartRequired = []
    for (const [key, value] of Object.entries(changes)) {
      const definition = registry.schema[key]
      if (!definition) throw new ConfigurationError(`Unknown configuration key: ${key}`, 422)
      if (definition.type === 'secret') throw new ConfigurationError(`${key} must be managed through the secrets API`, 422)
      if (value === undefined) continue
      if (value === null && !definition.nullable) delete next[key]
      else next[key] = validateValue(key, value, definition)
      if (definition.restartRequired) restartRequired.push(key)
    }
    registry.environments[environment] = next
    const record = { id: crypto.randomUUID(), action: 'configuration.updated', environment, actor, before, after: next, restartRequired, createdAt: nowIso() }
    registry.history.unshift(record)
    registry.history = registry.history.slice(0, 2000)
    queueMicrotask(() => notifySubscribers({ environment, restartRequired }))
    await writeStructuredLog('info', 'Configuration updated', { environment, actor, keys: Object.keys(changes), restartRequired })
    return { environment, values: next, restartRequired, version: registry.version + 1 }
  })
}

export async function setSecret(nameValue, input = {}, actor = null) {
  const name = String(nameValue || '').trim()
  if (!/^[A-Z0-9._-]{2,100}$/i.test(name)) throw new ConfigurationError('Secret name is invalid', 422)
  const source = input.source === 'environment' ? 'environment' : 'stored'
  if (source === 'environment') {
    const environment = String(input.environment || name).trim()
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(environment)) throw new ConfigurationError('Secret environment variable is invalid', 422)
    return mutate(registry => {
      registry.secrets[name] = { name, source, environment, updatedAt: nowIso() }
      registry.history.unshift({ id: crypto.randomUUID(), action: 'secret.reference.updated', secret: name, source, environment, actor, createdAt: nowIso() })
      registry.history = registry.history.slice(0, 2000)
      return maskSecret(registry.secrets[name])
    })
  }
  const value = String(input.value || '')
  if (value.length < 16) throw new ConfigurationError('Stored secrets must contain at least 16 characters', 422)
  return mutate(registry => {
    registry.secrets[name] = { name, source, value, updatedAt: nowIso() }
    registry.history.unshift({ id: crypto.randomUUID(), action: 'secret.updated', secret: name, source, actor, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 2000)
    return maskSecret(registry.secrets[name])
  })
}

export async function deleteSecret(nameValue, actor = null) {
  const name = String(nameValue || '').trim()
  return mutate(registry => {
    const existed = Boolean(registry.secrets[name])
    delete registry.secrets[name]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'secret.deleted', secret: name, actor, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 2000)
    return { deleted: existed, name }
  })
}

export async function validateConfiguration(environmentValue) {
  const registry = await readRegistry()
  const environment = normaliseEnvironment(environmentValue || registry.activeEnvironment)
  const errors = []
  const warnings = []
  for (const [key, definition] of Object.entries(registry.schema)) {
    const value = effectiveValue(registry, key, environment)
    if ((definition.required || definition.requiredIn?.includes(environment)) && (value === null || value === undefined || value === '')) {
      errors.push({ key, code: 'required', message: `${key} is required in ${environment}` })
      continue
    }
    if (value !== null && value !== undefined && definition.type !== 'secret') {
      try { validateValue(key, value, definition) } catch (error) { errors.push({ key, code: 'invalid', message: error.message }) }
    }
    if (definition.restartRequired && registry.environments[environment]?.[key] !== undefined) warnings.push({ key, code: 'restart-required', message: `${key} requires a process restart after changes` })
  }
  return { environment, valid: errors.length === 0, errors, warnings, checkedAt: nowIso() }
}

export async function deploymentReadiness(environmentValue = 'production') {
  const validation = await validateConfiguration(environmentValue)
  const registry = await readRegistry()
  const environment = normaliseEnvironment(environmentValue)
  const checks = [
    { id: 'configuration-valid', status: validation.valid ? 'passed' : 'failed', details: validation.errors },
    { id: 'production-mode', status: environment === 'production' ? 'passed' : 'warning' },
    { id: 'public-url-https', status: String(effectiveValue(registry, 'runtime.publicUrl', environment) || '').startsWith('https://') ? 'passed' : 'failed' },
    { id: 'trusted-origins', status: (effectiveValue(registry, 'runtime.trustedOrigins', environment) || []).length ? 'passed' : 'warning' },
  ]
  const ready = checks.every(item => item.status !== 'failed')
  return { environment, ready, checks, checkedAt: nowIso() }
}

export async function activateEnvironment(environmentValue, actor = null) {
  const environment = normaliseEnvironment(environmentValue)
  const validation = await validateConfiguration(environment)
  if (!validation.valid) throw new ConfigurationError('Configuration cannot be activated because validation failed', 409, validation.errors)
  const result = await mutate(registry => {
    const previous = registry.activeEnvironment
    registry.activeEnvironment = environment
    registry.history.unshift({ id: crypto.randomUUID(), action: 'environment.activated', previous, environment, actor, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 2000)
    return { previous, environment, activatedAt: nowIso(), restartRequired: Object.values(registry.schema).some(item => item.restartRequired) }
  })
  notifySubscribers({ environment, activated: true })
  publishIntegrationEvent('global', 'configuration.activated', result, { configuration: true }).catch(() => {})
  return result
}

export async function configurationHistory(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(500, Math.max(1, Number(query.limit || 100)))
  return registry.history.slice(0, limit)
}

export function subscribeConfiguration(listener) {
  if (typeof listener !== 'function') throw new ConfigurationError('Configuration subscriber must be a function', 422)
  subscribers.add(listener)
  return () => subscribers.delete(listener)
}

function notifySubscribers(event) {
  for (const listener of subscribers) Promise.resolve().then(() => listener(event)).catch(error => console.error('Configuration subscriber failed', error))
}

export async function resolveSecret(reference) {
  const match = /^secret:\/\/(.+)$/.exec(String(reference || ''))
  if (!match) throw new ConfigurationError('Secret reference is invalid', 422)
  const registry = await readRegistry()
  const value = resolveSecretRecord(registry.secrets[match[1]]) || process.env[match[1]] || null
  if (!value) throw new ConfigurationError('Secret is not configured', 404)
  return value
}
