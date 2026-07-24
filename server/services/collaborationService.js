import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'collaboration', 'registry.json')
const mutations = new Map()
const MAX_HISTORY = 5000
const MAX_CHANGES = 25000
const SESSION_TTL_MS = 30 * 60 * 1000
const LOCK_TTL_MS = 2 * 60 * 1000
let cleanupTimer = null

export class CollaborationError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'CollaborationError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    sessions: [], locks: [], changes: [], conflicts: [], history: [],
    statistics: { sessionsCreated: 0, changesApplied: 0, conflictsDetected: 0, locksAcquired: 0, sessionsRecovered: 0 },
    version: 1, updatedAt: nowIso(),
  }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.sessions ||= []
  registry.locks ||= []
  registry.changes ||= []
  registry.conflicts ||= []
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
    registry.changes = registry.changes.slice(0, MAX_CHANGES)
    registry.conflicts = registry.conflicts.slice(0, 10000)
    registry.history = registry.history.slice(0, MAX_HISTORY)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function required(value, label, maximum = 500) {
  const result = String(value || '').trim()
  if (!result) throw new CollaborationError(`${label} is required`, 422)
  if (result.length > maximum) throw new CollaborationError(`${label} is too long`, 422)
  return result
}
function resourceKey(input = {}) {
  const websiteId = safeName(required(input.websiteId, 'Website ID', 200))
  const resourceType = safeName(required(input.resourceType, 'Resource type', 200))
  const resourceId = required(input.resourceId, 'Resource ID', 300)
  return { websiteId, resourceType, resourceId, key: `${websiteId}:${resourceType}:${resourceId}` }
}
function actorId(actor = {}) { return String(actor.id || actor.email || 'unknown').slice(0, 320) }
function activeSession(session, at = Date.now()) { return session.status === 'active' && new Date(session.expiresAt).getTime() > at }
function activeLock(lock, at = Date.now()) { return lock.status === 'active' && new Date(lock.expiresAt).getTime() > at }

export async function getCollaborationState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  const now = Date.now()
  return {
    ...registry,
    sessions: registry.sessions.filter(item => !query.active || activeSession(item, now)).slice(0, limit),
    locks: registry.locks.filter(item => !query.active || activeLock(item, now)).slice(0, limit),
    changes: registry.changes.slice(0, limit), conflicts: registry.conflicts.slice(0, limit), history: registry.history.slice(0, limit),
  }
}

export async function createCollaborationSession(input = {}, actor = null) {
  const resource = resourceKey(input)
  const ttlMs = Math.min(24 * 3600000, Math.max(60000, Number(input.ttlMs || SESSION_TTL_MS)))
  return mutate(registry => {
    const id = crypto.randomUUID()
    const createdAt = nowIso()
    const session = {
      id, ...resource, participantId: actorId(actor), displayName: String(input.displayName || actor?.email || actorId(actor)).slice(0, 200),
      status: 'active', cursor: null, selection: null, metadata: input.metadata && typeof input.metadata === 'object' ? structuredClone(input.metadata) : {},
      lastSeenAt: createdAt, expiresAt: new Date(Date.now() + ttlMs).toISOString(), createdAt, recoveredFromSessionId: null,
    }
    registry.sessions.unshift(session)
    registry.statistics.sessionsCreated += 1
    registry.history.unshift({ id: crypto.randomUUID(), action: 'collaboration-session.created', sessionId: id, resourceKey: resource.key, actor, createdAt })
    return session
  })
}

export async function heartbeatSession(sessionIdValue, input = {}, actor = null) {
  const sessionId = required(sessionIdValue, 'Session ID', 100)
  return mutate(registry => {
    const session = registry.sessions.find(item => item.id === sessionId)
    if (!session) throw new CollaborationError('Collaboration session not found', 404)
    if (session.participantId !== actorId(actor) && actor?.role !== 'owner') throw new CollaborationError('Session ownership required', 403)
    if (session.status !== 'active') throw new CollaborationError('Collaboration session is not active', 409)
    const ttlMs = Math.min(24 * 3600000, Math.max(60000, Number(input.ttlMs || SESSION_TTL_MS)))
    session.lastSeenAt = nowIso()
    session.expiresAt = new Date(Date.now() + ttlMs).toISOString()
    if ('cursor' in input) session.cursor = input.cursor && typeof input.cursor === 'object' ? structuredClone(input.cursor) : null
    if ('selection' in input) session.selection = input.selection && typeof input.selection === 'object' ? structuredClone(input.selection) : null
    registry.history.unshift({ id: crypto.randomUUID(), action: 'collaboration-session.heartbeat', sessionId, actor, createdAt: session.lastSeenAt })
    return session
  })
}

export async function closeCollaborationSession(sessionIdValue, actor = null) {
  const sessionId = required(sessionIdValue, 'Session ID', 100)
  return mutate(registry => {
    const session = registry.sessions.find(item => item.id === sessionId)
    if (!session) throw new CollaborationError('Collaboration session not found', 404)
    if (session.participantId !== actorId(actor) && actor?.role !== 'owner') throw new CollaborationError('Session ownership required', 403)
    session.status = 'closed'; session.closedAt = nowIso()
    for (const lock of registry.locks.filter(item => item.sessionId === sessionId && item.status === 'active')) { lock.status = 'released'; lock.releasedAt = session.closedAt }
    registry.history.unshift({ id: crypto.randomUUID(), action: 'collaboration-session.closed', sessionId, actor, createdAt: session.closedAt })
    return session
  })
}

export async function acquireRecordLock(input = {}, actor = null) {
  const resource = resourceKey(input)
  const sessionId = required(input.sessionId, 'Session ID', 100)
  const ttlMs = Math.min(3600000, Math.max(10000, Number(input.ttlMs || LOCK_TTL_MS)))
  return mutate(registry => {
    const session = registry.sessions.find(item => item.id === sessionId && activeSession(item))
    if (!session) throw new CollaborationError('Active collaboration session not found', 404)
    if (session.participantId !== actorId(actor) && actor?.role !== 'owner') throw new CollaborationError('Session ownership required', 403)
    const existing = registry.locks.find(item => item.key === resource.key && activeLock(item))
    if (existing && existing.sessionId !== sessionId) throw new CollaborationError('Resource is locked by another session', 409, { lockId: existing.id, expiresAt: existing.expiresAt })
    const lock = existing || { id: crypto.randomUUID(), ...resource, sessionId, participantId: session.participantId, createdAt: nowIso() }
    lock.status = 'active'; lock.updatedAt = nowIso(); lock.expiresAt = new Date(Date.now() + ttlMs).toISOString()
    registry.locks = [lock, ...registry.locks.filter(item => item.id !== lock.id)]
    if (!existing) registry.statistics.locksAcquired += 1
    registry.history.unshift({ id: crypto.randomUUID(), action: existing ? 'collaboration-lock.renewed' : 'collaboration-lock.acquired', lockId: lock.id, sessionId, resourceKey: resource.key, actor, createdAt: lock.updatedAt })
    return lock
  })
}

export async function releaseRecordLock(lockIdValue, actor = null) {
  const lockId = required(lockIdValue, 'Lock ID', 100)
  return mutate(registry => {
    const lock = registry.locks.find(item => item.id === lockId)
    if (!lock) throw new CollaborationError('Collaboration lock not found', 404)
    if (lock.participantId !== actorId(actor) && actor?.role !== 'owner') throw new CollaborationError('Lock ownership required', 403)
    lock.status = 'released'; lock.releasedAt = nowIso()
    registry.history.unshift({ id: crypto.randomUUID(), action: 'collaboration-lock.released', lockId, actor, createdAt: lock.releasedAt })
    return lock
  })
}

export async function appendCollaborationChange(input = {}, actor = null) {
  const resource = resourceKey(input)
  const sessionId = required(input.sessionId, 'Session ID', 100)
  const baseVersion = Math.max(0, Number(input.baseVersion || 0))
  return mutate(registry => {
    const session = registry.sessions.find(item => item.id === sessionId && activeSession(item))
    if (!session) throw new CollaborationError('Active collaboration session not found', 404)
    if (session.participantId !== actorId(actor) && actor?.role !== 'owner') throw new CollaborationError('Session ownership required', 403)
    const latestVersion = registry.changes.filter(item => item.key === resource.key).reduce((max, item) => Math.max(max, item.version), 0)
    if (baseVersion !== latestVersion) {
      const conflict = { id: crypto.randomUUID(), ...resource, sessionId, baseVersion, currentVersion: latestVersion, status: 'open', createdAt: nowIso(), createdBy: actor }
      registry.conflicts.unshift(conflict)
      registry.statistics.conflictsDetected += 1
      registry.history.unshift({ id: crypto.randomUUID(), action: 'collaboration-conflict.detected', conflictId: conflict.id, resourceKey: resource.key, actor, createdAt: conflict.createdAt })
      throw new CollaborationError('Collaboration version conflict', 409, conflict)
    }
    const change = {
      id: crypto.randomUUID(), ...resource, sessionId, participantId: session.participantId, version: latestVersion + 1, baseVersion,
      operation: required(input.operation, 'Operation', 100), path: String(input.path || '').slice(0, 1000), value: structuredClone(input.value),
      clientChangeId: input.clientChangeId ? String(input.clientChangeId).slice(0, 200) : null, createdAt: nowIso(), createdBy: actor,
    }
    registry.changes.unshift(change)
    registry.statistics.changesApplied += 1
    registry.history.unshift({ id: crypto.randomUUID(), action: 'collaboration-change.applied', changeId: change.id, resourceKey: resource.key, version: change.version, actor, createdAt: change.createdAt })
    return change
  })
}

export async function resolveCollaborationConflict(conflictIdValue, input = {}, actor = null) {
  const conflictId = required(conflictIdValue, 'Conflict ID', 100)
  return mutate(registry => {
    const conflict = registry.conflicts.find(item => item.id === conflictId)
    if (!conflict) throw new CollaborationError('Collaboration conflict not found', 404)
    if (conflict.status !== 'open') throw new CollaborationError('Collaboration conflict is already resolved', 409)
    conflict.status = 'resolved'; conflict.resolution = required(input.resolution, 'Resolution', 100); conflict.notes = String(input.notes || '').slice(0, 2000)
    conflict.resolvedAt = nowIso(); conflict.resolvedBy = actor
    registry.history.unshift({ id: crypto.randomUUID(), action: 'collaboration-conflict.resolved', conflictId, resolution: conflict.resolution, actor, createdAt: conflict.resolvedAt })
    return conflict
  })
}

export async function recoverCollaborationSession(sessionIdValue, actor = null) {
  const sessionId = required(sessionIdValue, 'Session ID', 100)
  const registry = await readRegistry()
  const original = registry.sessions.find(item => item.id === sessionId)
  if (!original) throw new CollaborationError('Collaboration session not found', 404)
  if (original.participantId !== actorId(actor) && actor?.role !== 'owner') throw new CollaborationError('Session ownership required', 403)
  const recovered = await createCollaborationSession(original, actor)
  await mutate(current => { const session = current.sessions.find(item => item.id === recovered.id); session.recoveredFromSessionId = sessionId; current.statistics.sessionsRecovered += 1 })
  return { ...recovered, recoveredFromSessionId: sessionId }
}

export async function cleanupCollaborationState() {
  const at = Date.now()
  return mutate(registry => {
    let expiredSessions = 0; let expiredLocks = 0
    for (const session of registry.sessions) if (session.status === 'active' && new Date(session.expiresAt).getTime() <= at) { session.status = 'expired'; session.expiredAt = nowIso(); expiredSessions += 1 }
    for (const lock of registry.locks) if (lock.status === 'active' && new Date(lock.expiresAt).getTime() <= at) { lock.status = 'expired'; lock.expiredAt = nowIso(); expiredLocks += 1 }
    if (expiredSessions || expiredLocks) registry.history.unshift({ id: crypto.randomUUID(), action: 'collaboration.cleanup', expiredSessions, expiredLocks, createdAt: nowIso() })
    return { expiredSessions, expiredLocks }
  })
}

export function startCollaborationCleanup(options = {}) {
  if (cleanupTimer) return cleanupTimer
  const intervalMs = Math.min(3600000, Math.max(30000, Number(options.intervalMs || process.env.COLLABORATION_CLEANUP_INTERVAL_MS || 60000)))
  const run = () => cleanupCollaborationState().catch(error => writeStructuredLog('error', 'Collaboration cleanup failed', { error: error.message }))
  cleanupTimer = setInterval(run, intervalMs)
  cleanupTimer.unref?.()
  if (options.runImmediately === true) run()
  return cleanupTimer
}
