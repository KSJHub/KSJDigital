import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { createBackup, previewRestore, restoreBackup } from './backupService.js'
import { deploymentReadiness } from './configurationService.js'
import { publishIntegrationEvent } from './integrationService.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'releases', 'registry.json')
const ENVIRONMENTS = ['development', 'test', 'staging', 'production']
const locks = new Map()
const DEFAULT_LOCK_MINUTES = 30

export class ReleaseError extends Error {
  constructor(message, status = 400, details = null) { super(message); this.name = 'ReleaseError'; this.status = status; this.details = details }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    releases: [], deployments: [],
    environments: Object.fromEntries(ENVIRONMENTS.map(name => [name, { currentReleaseId: null, previousReleaseId: null, updatedAt: null }])),
    maintenance: Object.fromEntries(ENVIRONMENTS.map(name => [name, { enabled: false, message: null, enabledAt: null, enabledBy: null }])),
    deploymentLocks: {}, history: [], version: 1, updatedAt: nowIso(),
  }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.releases ||= []; registry.deployments ||= []; registry.environments ||= {}; registry.maintenance ||= {}; registry.deploymentLocks ||= {}; registry.history ||= []
  for (const name of ENVIRONMENTS) {
    registry.environments[name] ||= { currentReleaseId: null, previousReleaseId: null, updatedAt: null }
    registry.maintenance[name] ||= { enabled: false, message: null, enabledAt: null, enabledBy: null }
  }
  registry.version ||= 1
  return registry
}
async function mutate(operation) {
  const previous = locks.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = structuredClone(await readRegistry())
    const result = await operation(registry)
    if (result?.__skipWrite === true) return result.value
    registry.version += 1; registry.updatedAt = nowIso()
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  locks.set('registry', current)
  try { return await current } finally { if (locks.get('registry') === current) locks.delete('registry') }
}
function environmentName(value) {
  const name = String(value || '').trim().toLowerCase()
  if (!ENVIRONMENTS.includes(name)) throw new ReleaseError('Environment is invalid', 422)
  return name
}
function actorId(actor) { return actor?.id || actor?.email || 'unknown' }
function cleanExpiredLocks(registry) {
  const now = Date.now()
  for (const [environment, lock] of Object.entries(registry.deploymentLocks)) if (new Date(lock.expiresAt).getTime() <= now) delete registry.deploymentLocks[environment]
}
function requireLock(registry, environment, token) {
  cleanExpiredLocks(registry)
  const lock = registry.deploymentLocks[environment]
  if (!lock) throw new ReleaseError(`No active deployment lock exists for ${environment}`, 409)
  if (!token || token !== lock.token) throw new ReleaseError('Deployment lock token is invalid', 409)
  return lock
}
function findRelease(registry, idValue) {
  const id = safeName(idValue)
  const release = registry.releases.find(item => item.id === id)
  if (!release) throw new ReleaseError('Release not found', 404)
  return release
}

export async function listReleaseState(query = {}) {
  const registry = await readRegistry(); cleanExpiredLocks(registry)
  const limit = Math.min(500, Math.max(1, Number(query.limit || 100)))
  return { ...registry, releases: registry.releases.slice(0, limit), deployments: registry.deployments.slice(0, limit), history: registry.history.slice(0, limit) }
}

export async function createRelease(input = {}, actor = null) {
  const version = String(input.version || '').trim()
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,99}$/.test(version)) throw new ReleaseError('Release version is invalid', 422)
  const artifact = input.artifact && typeof input.artifact === 'object' ? input.artifact : {}
  const checksum = String(artifact.sha256 || '').trim().toLowerCase()
  if (checksum && !/^[a-f0-9]{64}$/.test(checksum)) throw new ReleaseError('Artifact SHA-256 checksum is invalid', 422)
  return mutate(registry => {
    if (registry.releases.some(item => item.version === version)) throw new ReleaseError('Release version already exists', 409)
    const release = {
      id: safeName(`${version}-${crypto.randomBytes(4).toString('hex')}`), version, status: 'registered',
      notes: String(input.notes || '').trim().slice(0, 5000) || null,
      source: { commitSha: String(input.commitSha || '').trim() || null, branch: String(input.branch || '').trim() || null },
      artifact: { name: String(artifact.name || '').trim() || null, uri: String(artifact.uri || '').trim() || null, sha256: checksum || null, size: Number.isFinite(Number(artifact.size)) ? Number(artifact.size) : null },
      createdAt: nowIso(), createdBy: actor,
    }
    registry.releases.unshift(release)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'release.created', releaseId: release.id, actor, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 5000)
    return release
  })
}

export async function acquireDeploymentLock(environmentValue, input = {}, actor = null) {
  const environment = environmentName(environmentValue)
  const ttlMinutes = Math.min(240, Math.max(5, Number(input.ttlMinutes || DEFAULT_LOCK_MINUTES)))
  return mutate(registry => {
    cleanExpiredLocks(registry)
    const existing = registry.deploymentLocks[environment]
    if (existing) throw new ReleaseError(`Deployment environment ${environment} is already locked`, 409, { expiresAt: existing.expiresAt, owner: existing.owner })
    const token = crypto.randomBytes(32).toString('hex')
    const lock = { environment, token, owner: actorId(actor), acquiredAt: nowIso(), expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString() }
    registry.deploymentLocks[environment] = lock
    registry.history.unshift({ id: crypto.randomUUID(), action: 'deployment.locked', environment, owner: lock.owner, expiresAt: lock.expiresAt, createdAt: nowIso() })
    return lock
  })
}
export async function releaseDeploymentLock(environmentValue, token, actor = null) {
  const environment = environmentName(environmentValue)
  return mutate(registry => {
    const lock = requireLock(registry, environment, token)
    delete registry.deploymentLocks[environment]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'deployment.unlocked', environment, owner: lock.owner, actor, createdAt: nowIso() })
    return { released: true, environment }
  })
}

export async function deploymentPlan(releaseId, environmentValue) {
  const environment = environmentName(environmentValue)
  const registry = await readRegistry()
  const release = findRelease(registry, releaseId)
  const readiness = await deploymentReadiness(environment)
  const current = registry.environments[environment]
  const configurationChecks = readiness.checks.map(check => (
    environment !== 'production' && ['public-url-https', 'trusted-origins'].includes(check.id) && check.status === 'failed'
      ? { ...check, status: 'warning', message: `${check.id} is enforced for production promotion` }
      : check
  ))
  const checks = [
    ...configurationChecks,
    { id: 'release-artifact', status: release.artifact.name || release.source.commitSha ? 'passed' : 'warning' },
    { id: 'release-not-current', status: current.currentReleaseId === release.id ? 'failed' : 'passed' },
  ]
  const ready = checks.every(check => check.status !== 'failed')
  const confirmationToken = crypto.createHash('sha256').update(`${release.id}:${environment}:${registry.version}:${current.currentReleaseId || ''}`).digest('hex')
  return { release, environment, currentReleaseId: current.currentReleaseId, ready, checks, confirmationToken, plannedAt: nowIso() }
}

export async function promoteRelease(releaseId, environmentValue, input = {}, actor = null) {
  const environment = environmentName(environmentValue)
  const plan = await deploymentPlan(releaseId, environment)
  if (!plan.ready) throw new ReleaseError('Deployment readiness gates failed', 409, plan.checks)
  if (!input.confirmationToken || input.confirmationToken !== plan.confirmationToken) throw new ReleaseError('Deployment confirmation token is invalid', 409)
  const preflightRegistry = await readRegistry()
  requireLock(preflightRegistry, environment, input.lockToken)
  let backup = null
  if (input.createBackup !== false) backup = await createBackup({ label: `Pre-deployment ${plan.release.version} to ${environment}`, skipPrune: true })
  const result = await mutate(registry => {
    const lock = requireLock(registry, environment, input.lockToken)
    const release = findRelease(registry, releaseId)
    const target = registry.environments[environment]
    if (target.currentReleaseId !== plan.currentReleaseId) throw new ReleaseError('Environment changed after the deployment plan was created', 409)
    const deployment = {
      id: crypto.randomUUID(), releaseId: release.id, version: release.version, environment,
      previousReleaseId: target.currentReleaseId, backupId: backup?.id || null, status: 'completed',
      checks: plan.checks, startedAt: nowIso(), completedAt: nowIso(), deployedBy: actor,
    }
    target.previousReleaseId = target.currentReleaseId; target.currentReleaseId = release.id; target.updatedAt = nowIso()
    release.status = environment === 'production' ? 'released' : 'promoted'; release.lastPromotedAt = nowIso()
    registry.deployments.unshift(deployment)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'release.promoted', releaseId: release.id, environment, deploymentId: deployment.id, lockOwner: lock.owner, actor, createdAt: nowIso() })
    registry.history = registry.history.slice(0, 5000)
    return deployment
  })
  await writeStructuredLog('warn', 'Release promoted', result)
  publishIntegrationEvent('global', 'release.promoted', result, { releaseManagement: true }).catch(() => {})
  return result
}

export async function setMaintenanceMode(environmentValue, input = {}, actor = null) {
  const environment = environmentName(environmentValue); const enabled = input.enabled === true
  const message = enabled ? String(input.message || 'Scheduled maintenance is in progress.').trim().slice(0, 500) : null
  const result = await mutate(registry => {
    const existing = registry.maintenance[environment]
    if (existing?.enabled === enabled && existing.message === message) return { __skipWrite: true, value: { environment, ...existing, unchanged: true } }
    const state = { enabled, message, enabledAt: enabled ? nowIso() : null, enabledBy: enabled ? actor : null }
    registry.maintenance[environment] = state
    registry.history.unshift({ id: crypto.randomUUID(), action: enabled ? 'maintenance.enabled' : 'maintenance.disabled', environment, actor, createdAt: nowIso() })
    return { environment, ...state }
  })
  if (result.unchanged) return result
  publishIntegrationEvent('global', enabled ? 'maintenance.enabled' : 'maintenance.disabled', result, { releaseManagement: true }).catch(() => {})
  return result
}
export async function getMaintenanceMode(environmentValue) {
  const environment = environmentName(environmentValue || process.env.NODE_ENV || 'development')
  const registry = await readRegistry()
  return { environment, ...registry.maintenance[environment] }
}

export async function rollbackRelease(environmentValue, input = {}, actor = null) {
  const environment = environmentName(environmentValue)
  const registry = await readRegistry()
  const lock = requireLock(registry, environment, input.lockToken)
  const target = registry.environments[environment]
  if (!target.previousReleaseId) throw new ReleaseError('No previous release is available for rollback', 409)
  const latest = registry.deployments.find(item => item.environment === environment && item.releaseId === target.currentReleaseId && item.status === 'completed')
  let restoreRecord = null
  if (latest?.backupId && input.restoreData !== false) {
    const preview = await previewRestore(latest.backupId)
    restoreRecord = await restoreBackup(latest.backupId, { confirmationToken: preview.confirmationToken })
  }
  const result = await mutate(current => {
    requireLock(current, environment, input.lockToken)
    const state = current.environments[environment]
    if (state.currentReleaseId !== target.currentReleaseId || state.previousReleaseId !== target.previousReleaseId) throw new ReleaseError('Environment changed before rollback completed', 409)
    const fromReleaseId = state.currentReleaseId; const toReleaseId = state.previousReleaseId
    state.currentReleaseId = toReleaseId; state.previousReleaseId = fromReleaseId; state.updatedAt = nowIso()
    const record = { id: crypto.randomUUID(), environment, fromReleaseId, toReleaseId, restoreId: restoreRecord?.id || null, backupId: latest?.backupId || null, status: 'completed', rolledBackAt: nowIso(), rolledBackBy: actor }
    current.deployments.unshift({ ...record, type: 'rollback' })
    current.history.unshift({ id: crypto.randomUUID(), action: 'release.rolled-back', environment, fromReleaseId, toReleaseId, lockOwner: lock.owner, actor, createdAt: nowIso() })
    return record
  })
  await writeStructuredLog('warn', 'Release rolled back', result)
  publishIntegrationEvent('global', 'release.rolled-back', result, { releaseManagement: true }).catch(() => {})
  return result
}
