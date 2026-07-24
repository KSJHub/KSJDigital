import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { createBackup } from './backupService.js'
import { publishIntegrationEvent } from './integrationService.js'
import { writeStructuredLog } from './systemHealthService.js'

const ROOT = path.join(DATA_DIR, 'migrations')
const REGISTRY_FILE = path.join(ROOT, 'registry.json')
const LOCK_MINUTES = 30
const processLocks = new Map()

export class MigrationError extends Error {
  constructor(message, status = 400, details = null) { super(message); this.name = 'MigrationError'; this.status = status; this.details = details }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    definitions: [],
    applied: [],
    rollbacks: [],
    locks: {},
    retentionPolicies: [],
    retentionRuns: [],
    history: [],
    version: 1,
    updatedAt: nowIso(),
  }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.definitions ||= []
  registry.applied ||= []
  registry.rollbacks ||= []
  registry.locks ||= {}
  registry.retentionPolicies ||= []
  registry.retentionRuns ||= []
  registry.history ||= []
  registry.version ||= 1
  return registry
}
async function mutate(operation) {
  const previous = processLocks.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = structuredClone(await readRegistry())
    const result = await operation(registry)
    registry.version += 1
    registry.updatedAt = nowIso()
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  processLocks.set('registry', current)
  try { return await current } finally { if (processLocks.get('registry') === current) processLocks.delete('registry') }
}
function actorId(actor) { return actor?.id || actor?.email || 'unknown' }
function normaliseVersion(value) {
  const version = String(value || '').trim()
  if (!/^[0-9]+(?:\.[0-9]+){0,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new MigrationError('Migration version is invalid', 422)
  return version
}
function safeRelativeFile(value) {
  const relative = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '')
  if (!relative || relative.includes('..') || path.isAbsolute(relative) || !relative.endsWith('.json')) throw new MigrationError('Migration file must be a relative JSON path', 422)
  const resolved = path.resolve(DATA_DIR, relative)
  if (!resolved.startsWith(`${path.resolve(DATA_DIR)}${path.sep}`)) throw new MigrationError('Migration file is outside managed storage', 422)
  if (resolved.startsWith(path.resolve(ROOT))) throw new MigrationError('Migration registry files cannot be migration targets', 422)
  return { relative, resolved }
}
function validateOperations(operations, label) {
  if (!Array.isArray(operations) || !operations.length) throw new MigrationError(`${label} must contain at least one operation`, 422)
  return operations.map((operation, index) => {
    if (!operation || typeof operation !== 'object') throw new MigrationError(`${label}[${index}] is invalid`, 422)
    const file = safeRelativeFile(operation.file).relative
    const type = String(operation.type || '')
    if (!['set', 'delete', 'rename', 'append-unique'].includes(type)) throw new MigrationError(`${label}[${index}] has an unsupported operation type`, 422)
    const key = String(operation.key || '').trim()
    if (!key || key.split('.').some(part => !part)) throw new MigrationError(`${label}[${index}] key is invalid`, 422)
    if (type === 'rename') {
      const to = String(operation.to || '').trim()
      if (!to || to.split('.').some(part => !part)) throw new MigrationError(`${label}[${index}] rename target is invalid`, 422)
      return { file, type, key, to }
    }
    if (type === 'set' && !Object.hasOwn(operation, 'value')) throw new MigrationError(`${label}[${index}] set operation requires a value`, 422)
    if (type === 'append-unique' && !Object.hasOwn(operation, 'value')) throw new MigrationError(`${label}[${index}] append-unique operation requires a value`, 422)
    return { file, type, key, ...(Object.hasOwn(operation, 'value') ? { value: structuredClone(operation.value) } : {}) }
  })
}
function parts(key) { return key.split('.') }
function getAt(document, key) {
  let current = document
  for (const part of parts(key)) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, part)) return { exists: false, value: undefined }
    current = current[part]
  }
  return { exists: true, value: current }
}
function parentAt(document, key, create = false) {
  const route = parts(key)
  const leaf = route.pop()
  let current = document
  for (const part of route) {
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) {
      if (!create) return { parent: null, leaf }
      current[part] = {}
    }
    current = current[part]
  }
  return { parent: current, leaf }
}
function applyOperation(document, operation) {
  const before = getAt(document, operation.key)
  if (operation.type === 'set') {
    const { parent, leaf } = parentAt(document, operation.key, true)
    parent[leaf] = structuredClone(operation.value)
    return { changed: !before.exists || JSON.stringify(before.value) !== JSON.stringify(operation.value), before: before.value, after: operation.value }
  }
  if (operation.type === 'delete') {
    const { parent, leaf } = parentAt(document, operation.key)
    if (!parent || !Object.hasOwn(parent, leaf)) return { changed: false }
    const value = parent[leaf]
    delete parent[leaf]
    return { changed: true, before: value, after: undefined }
  }
  if (operation.type === 'rename') {
    if (!before.exists) return { changed: false }
    const target = getAt(document, operation.to)
    if (target.exists) throw new MigrationError(`Rename target already exists: ${operation.to}`, 409)
    const sourceParent = parentAt(document, operation.key)
    const targetParent = parentAt(document, operation.to, true)
    targetParent.parent[targetParent.leaf] = structuredClone(before.value)
    delete sourceParent.parent[sourceParent.leaf]
    return { changed: true, before: before.value, after: before.value }
  }
  const { parent, leaf } = parentAt(document, operation.key, true)
  if (!Array.isArray(parent[leaf])) {
    if (before.exists) throw new MigrationError(`${operation.key} is not an array`, 409)
    parent[leaf] = []
  }
  if (parent[leaf].some(item => JSON.stringify(item) === JSON.stringify(operation.value))) return { changed: false }
  parent[leaf].push(structuredClone(operation.value))
  return { changed: true, before: before.value, after: parent[leaf] }
}
function cleanExpiredLocks(registry) {
  const now = Date.now()
  for (const [scope, lock] of Object.entries(registry.locks)) if (new Date(lock.expiresAt).getTime() <= now) delete registry.locks[scope]
}
function requireLock(registry, scope, token) {
  cleanExpiredLocks(registry)
  const lock = registry.locks[scope]
  if (!lock) throw new MigrationError(`No active migration lock exists for ${scope}`, 409)
  if (!token || token !== lock.token) throw new MigrationError('Migration lock token is invalid', 409)
  return lock
}
function findDefinition(registry, idValue) {
  const id = safeName(idValue)
  const definition = registry.definitions.find(item => item.id === id)
  if (!definition) throw new MigrationError('Migration definition not found', 404)
  return definition
}
async function planOperations(operations) {
  const documents = new Map()
  const changes = []
  for (const operation of operations) {
    const target = safeRelativeFile(operation.file)
    if (!documents.has(target.resolved)) documents.set(target.resolved, await readJson(target.resolved, {}))
    const result = applyOperation(documents.get(target.resolved), operation)
    changes.push({ operation, changed: result.changed, before: result.before, after: result.after })
  }
  return { documents, changes, changedFiles: [...documents.keys()].filter(file => changes.some(change => safeRelativeFile(change.operation.file).resolved === file && change.changed)) }
}

export async function listMigrationState(query = {}) {
  const registry = await readRegistry(); cleanExpiredLocks(registry)
  const limit = Math.min(500, Math.max(1, Number(query.limit || 100)))
  return { ...registry, applied: registry.applied.slice(0, limit), rollbacks: registry.rollbacks.slice(0, limit), history: registry.history.slice(0, limit), retentionRuns: registry.retentionRuns.slice(0, limit) }
}
export async function registerMigration(input = {}, actor = null) {
  const version = normaliseVersion(input.version)
  const name = String(input.name || '').trim().slice(0, 200)
  if (!name) throw new MigrationError('Migration name is required', 422)
  const up = validateOperations(input.up, 'up')
  const down = input.down?.length ? validateOperations(input.down, 'down') : []
  return mutate(registry => {
    if (registry.definitions.some(item => item.version === version)) throw new MigrationError('Migration version already exists', 409)
    const definition = { id: safeName(`${version}-${name}`), version, name, description: String(input.description || '').trim().slice(0, 2000) || null, up, down, checksum: crypto.createHash('sha256').update(JSON.stringify({ version, name, up, down })).digest('hex'), createdAt: nowIso(), createdBy: actor }
    registry.definitions.push(definition)
    registry.definitions.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
    registry.history.unshift({ id: crypto.randomUUID(), action: 'migration.registered', migrationId: definition.id, version, actor, createdAt: nowIso() })
    return definition
  })
}
export async function acquireMigrationLock(scopeValue = 'global', input = {}, actor = null) {
  const scope = safeName(scopeValue)
  const ttlMinutes = Math.min(240, Math.max(5, Number(input.ttlMinutes || LOCK_MINUTES)))
  return mutate(registry => {
    cleanExpiredLocks(registry)
    if (registry.locks[scope]) throw new MigrationError(`Migration scope ${scope} is already locked`, 409)
    const lock = { scope, token: crypto.randomBytes(32).toString('hex'), owner: actorId(actor), acquiredAt: nowIso(), expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString() }
    registry.locks[scope] = lock
    registry.history.unshift({ id: crypto.randomUUID(), action: 'migration.locked', scope, owner: lock.owner, expiresAt: lock.expiresAt, createdAt: nowIso() })
    return lock
  })
}
export async function releaseMigrationLock(scopeValue = 'global', token, actor = null) {
  const scope = safeName(scopeValue)
  return mutate(registry => {
    const lock = requireLock(registry, scope, token)
    delete registry.locks[scope]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'migration.unlocked', scope, owner: lock.owner, actor, createdAt: nowIso() })
    return { released: true, scope }
  })
}
export async function migrationPlan(idValue, direction = 'up') {
  const registry = await readRegistry()
  const definition = findDefinition(registry, idValue)
  const operations = direction === 'down' ? definition.down : definition.up
  if (!operations.length) throw new MigrationError(`Migration has no ${direction} operations`, 409)
  const applied = registry.applied.find(item => item.migrationId === definition.id && item.status === 'applied')
  const planned = await planOperations(operations)
  const checks = [
    { id: 'definition-checksum', status: definition.checksum ? 'passed' : 'failed' },
    { id: direction === 'up' ? 'not-already-applied' : 'currently-applied', status: direction === 'up' ? (applied ? 'failed' : 'passed') : (applied ? 'passed' : 'failed') },
    { id: 'operations-present', status: operations.length ? 'passed' : 'failed' },
  ]
  const confirmationToken = crypto.createHash('sha256').update(`${definition.id}:${direction}:${definition.checksum}:${registry.version}`).digest('hex')
  return { migration: definition, direction, ready: checks.every(check => check.status !== 'failed'), checks, changes: planned.changes, changedFiles: planned.changedFiles.map(file => path.relative(DATA_DIR, file)), confirmationToken, plannedAt: nowIso(), registryVersion: registry.version }
}
export async function executeMigration(idValue, input = {}, actor = null) {
  const direction = input.direction === 'down' ? 'down' : 'up'
  const plan = await migrationPlan(idValue, direction)
  if (!plan.ready) throw new MigrationError('Migration preflight checks failed', 409, plan.checks)
  if (input.confirmationToken !== plan.confirmationToken) throw new MigrationError('Migration confirmation token is invalid', 409)
  const scope = safeName(input.scope || 'global')
  const preflight = await readRegistry(); requireLock(preflight, scope, input.lockToken)
  const backup = input.createBackup === false ? null : await createBackup({ label: `Pre-migration ${plan.migration.version} ${direction}`, skipPrune: true })
  const operations = direction === 'down' ? plan.migration.down : plan.migration.up
  const execution = await planOperations(operations)
  for (const [file, document] of execution.documents) {
    if (execution.changedFiles.includes(file)) await writeJson(file, document)
  }
  const result = await mutate(registry => {
    const lock = requireLock(registry, scope, input.lockToken)
    if (registry.version !== plan.registryVersion) throw new MigrationError('Migration registry changed after planning', 409)
    const definition = findDefinition(registry, idValue)
    const record = { id: crypto.randomUUID(), migrationId: definition.id, version: definition.version, direction, status: direction === 'up' ? 'applied' : 'rolled-back', backupId: backup?.id || null, changedFiles: plan.changedFiles, changes: plan.changes.filter(item => item.changed).length, executedAt: nowIso(), executedBy: actor }
    if (direction === 'up') registry.applied.unshift(record)
    else {
      const current = registry.applied.find(item => item.migrationId === definition.id && item.status === 'applied')
      if (current) current.status = 'rolled-back'
      registry.rollbacks.unshift(record)
    }
    registry.history.unshift({ id: crypto.randomUUID(), action: direction === 'up' ? 'migration.applied' : 'migration.rolled-back', migrationId: definition.id, version: definition.version, backupId: backup?.id || null, lockOwner: lock.owner, actor, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 5000)
    return record
  })
  await writeStructuredLog('warn', `Migration ${direction} completed`, result)
  publishIntegrationEvent('global', direction === 'up' ? 'migration.applied' : 'migration.rolled-back', result, { dataLifecycle: true }).catch(() => {})
  return result
}

export async function upsertRetentionPolicy(input = {}, actor = null) {
  const id = safeName(input.id || input.name)
  if (!id || id === 'file') throw new MigrationError('Retention policy ID is required', 422)
  const file = safeRelativeFile(input.file).relative
  const arrayKey = String(input.arrayKey || '').trim()
  const dateKey = String(input.dateKey || '').trim()
  const retentionDays = Math.min(3650, Math.max(1, Number(input.retentionDays || 90)))
  if (!arrayKey || !dateKey) throw new MigrationError('Retention policy requires arrayKey and dateKey', 422)
  return mutate(registry => {
    const policy = { id, name: String(input.name || id).trim().slice(0, 200), file, arrayKey, dateKey, retentionDays, enabled: input.enabled !== false, updatedAt: nowIso(), updatedBy: actor }
    const index = registry.retentionPolicies.findIndex(item => item.id === id)
    if (index >= 0) registry.retentionPolicies[index] = policy; else registry.retentionPolicies.push(policy)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'retention.policy-updated', policyId: id, actor, createdAt: nowIso() })
    return policy
  })
}
export async function retentionPlan(policyId) {
  const registry = await readRegistry()
  const policy = registry.retentionPolicies.find(item => item.id === safeName(policyId))
  if (!policy) throw new MigrationError('Retention policy not found', 404)
  const target = safeRelativeFile(policy.file)
  const document = await readJson(target.resolved, {})
  const array = getAt(document, policy.arrayKey)
  if (!array.exists || !Array.isArray(array.value)) throw new MigrationError('Retention policy array target is missing or invalid', 409)
  const cutoff = Date.now() - policy.retentionDays * 86400000
  const removable = array.value.filter(item => {
    const date = getAt(item, policy.dateKey)
    return date.exists && Number.isFinite(new Date(date.value).getTime()) && new Date(date.value).getTime() < cutoff
  })
  const confirmationToken = crypto.createHash('sha256').update(`${policy.id}:${registry.version}:${removable.length}:${cutoff}`).digest('hex')
  return { policy, total: array.value.length, removable: removable.length, retained: array.value.length - removable.length, cutoff: new Date(cutoff).toISOString(), confirmationToken, plannedAt: nowIso(), registryVersion: registry.version }
}
export async function executeRetention(policyId, input = {}, actor = null) {
  const plan = await retentionPlan(policyId)
  if (!plan.policy.enabled) throw new MigrationError('Retention policy is disabled', 409)
  if (input.confirmationToken !== plan.confirmationToken) throw new MigrationError('Retention confirmation token is invalid', 409)
  const scope = safeName(input.scope || 'retention')
  const preflight = await readRegistry(); requireLock(preflight, scope, input.lockToken)
  const backup = input.createBackup === false ? null : await createBackup({ label: `Pre-retention ${plan.policy.id}`, skipPrune: true })
  const target = safeRelativeFile(plan.policy.file)
  const document = await readJson(target.resolved, {})
  const location = getAt(document, plan.policy.arrayKey)
  const cutoff = new Date(plan.cutoff).getTime()
  const retained = location.value.filter(item => {
    const date = getAt(item, plan.policy.dateKey)
    return !date.exists || !Number.isFinite(new Date(date.value).getTime()) || new Date(date.value).getTime() >= cutoff
  })
  const { parent, leaf } = parentAt(document, plan.policy.arrayKey)
  parent[leaf] = retained
  if (plan.removable) await writeJson(target.resolved, document)
  const result = await mutate(registry => {
    const lock = requireLock(registry, scope, input.lockToken)
    if (registry.version !== plan.registryVersion) throw new MigrationError('Retention registry changed after planning', 409)
    const record = { id: crypto.randomUUID(), policyId: plan.policy.id, removed: plan.removable, retained: plan.retained, cutoff: plan.cutoff, backupId: backup?.id || null, status: 'completed', lockOwner: lock.owner, executedAt: nowIso(), executedBy: actor }
    registry.retentionRuns.unshift(record)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'retention.executed', policyId: plan.policy.id, removed: plan.removable, backupId: backup?.id || null, actor, createdAt: nowIso() })
    registry.retentionRuns = registry.retentionRuns.slice(0, 2000)
    registry.history = registry.history.slice(0, 5000)
    return record
  })
  publishIntegrationEvent('global', 'retention.executed', result, { dataLifecycle: true }).catch(() => {})
  return result
}
