import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, writeJson } from '../storage.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'

const FILE = path.join(DATA_DIR, 'authentication', 'registry.json')
const mutations = new Map()
const IDLE_TTL_MS = 30 * 60 * 1000
const ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_SESSIONS_PER_ACCOUNT = 8
const MAX_HISTORY = 25000

function nowIso() { return new Date().toISOString() }
function initial() { return { sessions: [], loginHistory: [], securityEvents: [], version: 1, updatedAt: nowIso() } }
async function readRegistry() {
  const state = await readJson(FILE, null) || initial()
  state.sessions ||= []
  state.loginHistory ||= []
  state.securityEvents ||= []
  state.version ||= 1
  return state
}
async function mutate(operation) {
  const previous = mutations.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const state = structuredClone(await readRegistry())
    const result = await operation(state)
    state.version += 1
    state.updatedAt = nowIso()
    state.sessions = state.sessions.slice(0, 50000)
    state.loginHistory = state.loginHistory.slice(0, MAX_HISTORY)
    state.securityEvents = state.securityEvents.slice(0, MAX_HISTORY)
    await writeJson(FILE, state)
    return result === undefined ? state : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function safeSession(session) { const { tokenHash, ...safe } = session; return structuredClone(safe) }
function status(session, at = Date.now()) {
  if (session.revokedAt) return 'revoked'
  if (new Date(session.absoluteExpiresAt).getTime() <= at) return 'expired'
  if (new Date(session.idleExpiresAt).getTime() <= at) return 'idle-expired'
  return 'active'
}
async function publishAuthenticationPersistenceEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}
export function hashSessionToken(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex') }
export async function issuePersistentSession(account, context = {}, assurance = {}) {
  const plaintext = crypto.randomBytes(32).toString('base64url')
  const createdAt = nowIso()
  const session = {
    id: crypto.randomUUID(), tokenHash: hashSessionToken(plaintext), accountId: account.id,
    account: structuredClone(account), assuranceLevel: Number(assurance.assuranceLevel || 1),
    assuranceMethod: assurance.assuranceMethod || 'password',
    assuranceExpiresAt: assurance.assuranceExpiresAt || new Date(Date.now() + IDLE_TTL_MS).toISOString(),
    ip: String(context.ip || ''), userAgent: String(context.userAgent || '').slice(0, 1000),
    deviceName: String(context.deviceName || 'Unknown device').slice(0, 200), createdAt,
    lastActivityAt: createdAt, idleExpiresAt: new Date(Date.now() + IDLE_TTL_MS).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + ABSOLUTE_TTL_MS).toISOString(), revokedAt: null,
  }
  const result = await mutate(state => {
    const active = state.sessions.filter(item => item.accountId === account.id && status(item) === 'active')
    const revokedSessionCount = active.slice(MAX_SESSIONS_PER_ACCOUNT - 1).length
    for (const old of active.slice(MAX_SESSIONS_PER_ACCOUNT - 1)) { old.revokedAt = createdAt; old.revocationReason = 'concurrent-session-limit' }
    state.sessions.unshift(session)
    state.securityEvents.unshift({ id: crypto.randomUUID(), action: 'session.created', accountId: account.id, sessionId: session.id, createdAt, ip: session.ip })
    return {
      activeSessionCount: Math.min(MAX_SESSIONS_PER_ACCOUNT, active.length + 1),
      revokedSessionCount,
    }
  })
  await publishAuthenticationPersistenceEvent('authentication.session-issued', {
    activeSessionCount: result.activeSessionCount,
    revokedSessionCount: result.revokedSessionCount,
    elevatedAssurance: session.assuranceLevel > 1,
    trustedDevice: session.assuranceMethod === 'trusted-device',
  })
  return { token: plaintext, session: safeSession(session) }
}
export async function resolvePersistentSession(token) {
  const tokenHash = hashSessionToken(token)
  const state = await readRegistry()
  const session = state.sessions.find(item => item.tokenHash === tokenHash)
  if (!session || status(session) !== 'active') return null
  return mutate(registry => {
    const current = registry.sessions.find(item => item.id === session.id)
    if (!current || status(current) !== 'active') return null
    current.lastActivityAt = nowIso()
    current.idleExpiresAt = new Date(Date.now() + IDLE_TTL_MS).toISOString()
    return safeSession(current)
  })
}
export async function revokeSessionByToken(token, reason = 'logout') {
  const tokenHash = hashSessionToken(token)
  const revoked = await mutate(state => {
    const session = state.sessions.find(item => item.tokenHash === tokenHash)
    if (!session || session.revokedAt) return false
    session.revokedAt = nowIso(); session.revocationReason = reason
    state.securityEvents.unshift({ id: crypto.randomUUID(), action: 'session.revoked', accountId: session.accountId, sessionId: session.id, reason, createdAt: session.revokedAt })
    return true
  })
  if (revoked) {
    await publishAuthenticationPersistenceEvent('authentication.session-ended', {
      userInitiated: reason === 'logout',
      sessionRotated: reason === 'session-rotation' || reason === 'mfa-session-rotation',
      mfaRotation: reason === 'mfa-session-rotation',
    })
  }
  return revoked
}
export async function revokeSessionById(id, actor = null) {
  return mutate(state => {
    const session = state.sessions.find(item => item.id === id)
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404 })
    if (!session.revokedAt) { session.revokedAt = nowIso(); session.revocationReason = 'administrative-revocation'; session.revokedBy = actor }
    return safeSession(session)
  })
}
export async function revokeAccountSessions(accountId, reason = 'global-logout', exceptId = null) {
  const result = await mutate(state => {
    let revoked = 0
    for (const session of state.sessions) if (session.accountId === accountId && session.id !== exceptId && status(session) === 'active') { session.revokedAt = nowIso(); session.revocationReason = reason; revoked += 1 }
    state.securityEvents.unshift({ id: crypto.randomUUID(), action: 'account.sessions-revoked', accountId, reason, revoked, createdAt: nowIso() })
    return { revoked }
  })
  if (reason === 'global-logout') {
    await publishAuthenticationPersistenceEvent('authentication.global-logout-completed', {
      revokedSessionCount: result.revoked,
      sessionsRevoked: result.revoked > 0,
    })
  }
  return result
}
export async function recordLoginEvent(accountId, context = {}, success = false, details = {}) {
  const event = await mutate(state => {
    const record = { id: crypto.randomUUID(), accountId: accountId || null, success, ip: String(context.ip || ''), userAgent: String(context.userAgent || '').slice(0, 1000), createdAt: nowIso(), ...details }
    state.loginHistory.unshift(record)
    return record
  })
  await publishAuthenticationPersistenceEvent('authentication.login-recorded', {
    successful: event.success === true,
    failed: event.success !== true,
    riskEvaluated: typeof event.risk === 'string' && event.risk.length > 0,
    failureReasonRecorded: typeof event.reason === 'string' && event.reason.length > 0,
  })
  return event
}
export async function getAuthenticationState(query = {}) {
  const state = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return { ...state, sessions: state.sessions.slice(0, limit).map(item => ({ ...safeSession(item), effectiveStatus: status(item) })), loginHistory: state.loginHistory.slice(0, limit), securityEvents: state.securityEvents.slice(0, limit) }
}
