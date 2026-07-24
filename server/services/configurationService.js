import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, writeJson } from '../storage.js'
import { publishIntegrationEvent } from './integrationService.js'
import { writeStructuredLog } from './systemHealthService.js'

const ROOT = path.join(DATA_DIR, 'configuration')
const REGISTRY_FILE = path.join(ROOT, 'registry.json')
const locks = new Map()
const subscribers = new Set()
const ENVIRONMENTS = ['development', 'test', 'staging', 'production']
const SCHEMA = {
  'runtime.environment': { type: 'enum', values: ENVIRONMENTS, default: 'development' },
  'runtime.publicUrl': { type: 'url', nullable: true, default: null },
  'runtime.trustedOrigins': { type: 'string-array', default: [] },
  'runtime.logLevel': { type: 'enum', values: ['debug', 'info', 'warn', 'error', 'fatal'], default: 'info' },
  'security.sessionSecret': { type: 'secret', environment: 'SESSION_SECRET', requiredIn: ['production'], restartRequired: true },
  'security.integrationSigningSecret': { type: 'secret', environment: 'INTEGRATION_SIGNING_SECRET', requiredIn: ['production'], restartRequired: true },
  'backup.enabled': { type: 'boolean', default: true },
  'backup.intervalMs': { type: 'integer', min: 3600000, max: 31536000000, default: 86400000 },
  'observability.enabled': { type: 'boolean', default: true },
}

export class ConfigurationError extends Error {
  constructor(message, status = 400, details = null) { super(message); this.name = 'ConfigurationError'; this.status = status; this.details = details }
}

function nowIso() { return new Date().toISOString() }
function environmentName(value) {
  const name = String(value || '').trim().toLowerCase()
  if (!ENVIRONMENTS.includes(name)) throw new ConfigurationError('Environment is invalid', 422)
  return name
}
function initialRegistry() {
  return { schema: structuredClone(SCHEMA), environments: Object.fromEntries(ENVIRONMENTS.map(name => [name, {}])), secrets: {}, history: [], activeEnvironment: process.env.NODE_ENV || 'development', version: 1, updatedAt: nowIso() }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.schema = { ...structuredClone(SCHEMA), ...(registry.schema || {}) }
  registry.environments ||= Object.fromEntries(ENVIRONMENTS.map(name => [name, {}]))
  for (const name of ENVIRONMENTS) registry.environments[name] ||= {}
  registry.secrets ||= {}
  registry.history ||= []
  registry.activeEnvironment = ENVIRONMENTS.includes(registry.activeEnvironment) ? registry.activeEnvironment : 'development'
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

function masterKey() {
  const source = String(process.env.CONFIGURATION_MASTER_KEY || '')
  if (source.length < 32) throw new ConfigurationError('CONFIGURATION_MASTER_KEY must contain at least 32 characters before stored secrets can be used', 503)
  return crypto.createHash('sha256').update(source).digest()
}
function encrypt(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return { algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
}
function decrypt(payload) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8')
}
function resolveSecretRecord(record) {
  if (!record) return null
  if (record.source === 'environment') return process.env[record.environment] || null
  return record.encrypted ? decrypt(record.encrypted) : null
}
function maskSecret(record) {
  return { name: record.name, reference: `secret://${record.name}`, source: record.source, configured: record.source === 'environment' ? Boolean(process.env[record.environment]) : Boolean(record.encrypted), environment: record.environment || null, updatedAt: record.updatedAt }
}

function validateValue(key, value, definition) {
  if (value === null && definition.nullable) return null
  if (definition.type === 'boolean' && typeof value === 'boolean') return value
  if (definition.type === 'integer' && Number.isInteger(value) && (definition.min === undefined || value >= definition.min) && (definition.max === undefined || value <= definition.max)) return value
  if (definition.type === 'enum' && definition.values?.includes(value)) return value
  if (definition.type === 'string-array' && Array.isArray(value) && value.every(item => typeof item === 'string')) return [...new Set(value.map(item => item.trim()).filter(Boolean))]
  if (definition.type === 'url' && typeof value === 'string') {
    try { const parsed = new URL(value); if (['http:', 'https:'].includes(parsed.protocol)) return parsed.toString() } catch {}
  }
  if (definition.type === 'string' && typeof value === 'string') return value
  throw new ConfigurationError(`${key} does not satisfy its ${definition.type} schema`, 422)
}
function effectiveValue(registry, key, environment) {
  const definition = registry.schema[key]
  if (registry.environments[environment]?.[key] !== undefined) return registry.environments[environment][key]
  if (definition?.type === 'secret') return resolveSecretRecord(registry.secrets[definition.environment || key]) || process.env[definition.environment || ''] || null
  return definition?.default ?? null
}
function notify(event) { for (const listener of subscribers) Promise.resolve(listener(event)).catch(error => console.error('Configuration subscriber failed', error)) }

export async function getConfiguration(environmentValue) {
  const registry = await readRegistry()
  const environment = environmentName(environmentValue || registry.activeEnvironment)
  const values = {}
  for (const [key, definition] of Object.entries(registry.schema)) {
    const value = effectiveValue(registry, key, environment)
    values[key] = definition.type === 'secret' ? (value ? '[configured]' : null) : value
  }
  return { environment, activeEnvironment: registry.activeEnvironment, version: registry.version, values, schema: registry.schema, secrets: Object.values(registry.secrets).map(maskSecret), updatedAt: registry.updatedAt }
}

export async function updateConfiguration(environmentValue, input = {}, actor = null) {
  const environment = environmentName(environmentValue)
  const changes = input.values && typeof input.values === 'object' ? input.values : input
  const result = await mutate(registry => {
    const before = structuredClone(registry.environments[environment])
    const after = { ...before }
    const restartRequired = []
    for (const [key, value] of Object.entries(changes)) {
      const definition = registry.schema[key]
      if (!definition) throw new ConfigurationError(`Unknown configuration key: ${key}`, 422)
      if (definition.type === 'secret') throw new ConfigurationError(`${key} must be managed through the secrets API`, 422)
      if (value === null && !definition.nullable) delete after[key]
      else after[key] = validateValue(key, value, definition)
      if (definition.restartRequired) restartRequired.push(key)
    }
    registry.environments[environment] = after
    registry.history.unshift({ id: crypto.randomUUID(), action: 'configuration.updated', environment, actor, before, after, restartRequired, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 2000)
    return { environment, values: after, restartRequired, version: registry.version + 1 }
  })
  notify({ type: 'configuration.updated', environment, restartRequired: result.restartRequired })
  await writeStructuredLog('info', 'Configuration updated', { environment, actor, keys: Object.keys(changes), restartRequired: result.restartRequired })
  return result
}

export async function setSecret(nameValue, input = {}, actor = null) {
  const name = String(nameValue || '').trim()
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(name)) throw new ConfigurationError('Secret name is invalid', 422)
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
  const encrypted = encrypt(value)
  return mutate(registry => {
    registry.secrets[name] = { name, source, encrypted, updatedAt: nowIso() }
    registry.history.unshift({ id: crypto.randomUUID(), action: 'secret.updated', secret: name, source, actor, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 2000)
    return maskSecret(registry.secrets[name])
  })
}

export async function deleteSecret(nameValue, actor = null) {
  const name = String(nameValue || '').trim()
  return mutate(registry => {
    const deleted = Boolean(registry.secrets[name])
    delete registry.secrets[name]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'secret.deleted', secret: name, actor, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 2000)
    return { deleted, name }
  })
}

export async function validateConfiguration(environmentValue) {
  const registry = await readRegistry()
  const environment = environmentName(environmentValue || registry.activeEnvironment)
  const errors = []
  const warnings = []
  for (const [key, definition] of Object.entries(registry.schema)) {
    let value
    try { value = effectiveValue(registry, key, environment) } catch (error) { errors.push({ key, code: 'secret-unavailable', message: error.message }); continue }
    if ((definition.required || definition.requiredIn?.includes(environment)) && (value === null || value === undefined || value === '')) errors.push({ key, code: 'required', message: `${key} is required in ${environment}` })
    else if (value !== null && value !== undefined && definition.type !== 'secret') {
      try { validateValue(key, value, definition) } catch (error) { errors.push({ key, code: 'invalid', message: error.message }) }
    }
    if (definition.restartRequired && registry.environments[environment]?.[key] !== undefined) warnings.push({ key, code: 'restart-required', message: `${key} requires a process restart after changes` })
  }
  return { environment, valid: errors.length === 0, errors, warnings, checkedAt: nowIso() }
}

export async function deploymentReadiness(environmentValue = 'production') {
  const environment = environmentName(environmentValue)
  const validation = await validateConfiguration(environment)
  const registry = await readRegistry()
  const publicUrl = effectiveValue(registry, 'runtime.publicUrl', environment)
  const origins = effectiveValue(registry, 'runtime.trustedOrigins', environment) || []
  const checks = [
    { id: 'configuration-valid', status: validation.valid ? 'passed' : 'failed', details: validation.errors },
    { id: 'public-url-https', status: String(publicUrl || '').startsWith('https://') ? 'passed' : 'failed' },
    { id: 'trusted-origins', status: origins.length ? 'passed' : 'warning' },
    { id: 'master-key', status: process.env.CONFIGURATION_MASTER_KEY?.length >= 32 ? 'passed' : 'warning', message: 'Required only when encrypted stored secrets are used' },
  ]
  return { environment, ready: checks.every(item => item.status !== 'failed'), checks, checkedAt: nowIso() }
}

export async function activateEnvironment(environmentValue, actor = null) {
  const environment = environmentName(environmentValue)
  const validation = await validateConfiguration(environment)
  if (!validation.valid) throw new ConfigurationError('Configuration cannot be activated because validation failed', 409, validation.errors)
  const result = await mutate(registry => {
    const previous = registry.activeEnvironment
    registry.activeEnvironment = environment
    registry.history.unshift({ id: crypto.randomUUID(), action: 'environment.activated', previous, environment, actor, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 2000)
    return { previous, environment, activatedAt: nowIso() }
  })
  notify({ type: 'environment.activated', environment })
  publishIntegrationEvent('global', 'configuration.activated', result, { configuration: true }).catch(() => {})
  return result
}

export async function configurationHistory(query = {}) {
  const registry = await readRegistry()
  return registry.history.slice(0, Math.min(500, Math.max(1, Number(query.limit || 100))))
}
export function subscribeConfiguration(listener) {
  if (typeof listener !== 'function') throw new ConfigurationError('Configuration subscriber must be a function', 422)
  subscribers.add(listener)
  return () => subscribers.delete(listener)
}
export async function resolveSecret(reference) {
  const match = /^secret:\/\/(.+)$/.exec(String(reference || ''))
  if (!match) throw new ConfigurationError('Secret reference is invalid', 422)
  const registry = await readRegistry()
  const value = resolveSecretRecord(registry.secrets[match[1]]) || process.env[match[1]] || null
  if (!value) throw new ConfigurationError('Secret is not configured', 404)
  return value
}
