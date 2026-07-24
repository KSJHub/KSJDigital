import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, writeJson } from '../storage.js'

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
  await mutate(state => {
    const active = state.sessions.filter(item => item.accountId === account.id && status(item) === 'active')
    for (const old of active.slice(MAX_SESSIONS_PER_ACCOUNT - 1)) { old.revokedAt = createdAt; old.revocationReason = 'concurrent-session-limit' }
    state.sessions.unshift(session)
    state.securityEvents.unshift({ id: crypto.randomUUID(), action: 'session.created', accountId: account.id, sessionId: session.id, createdAt, ip: session.ip })
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
  return mutate(state => {
    const session = state.sessions.find(item => item.tokenHash === tokenHash)
    if (!session || session.revokedAt) return false
    session.revokedAt = nowIso(); session.revocationReason = reason
    state.securityEvents.unshift({ id: crypto.randomUUID(), action: 'session.revoked', accountId: session.accountId, sessionId: session.id, reason, createdAt: session.revokedAt })
    return true
  })
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
  return mutate(state => {
    let revoked = 0
    for (const session of state.sessions) if (session.accountId === accountId && session.id !== exceptId && status(session) === 'active') { session.revokedAt = nowIso(); session.revocationReason = reason; revoked += 1 }
    state.securityEvents.unshift({ id: crypto.randomUUID(), action: 'account.sessions-revoked', accountId, reason, revoked, createdAt: nowIso() })
    return { revoked }
  })
}
export async function recordLoginEvent(accountId, context = {}, success = false, details = {}) {
  return mutate(state => {
    const event = { id: crypto.randomUUID(), accountId: accountId || null, success, ip: String(context.ip || ''), userAgent: String(context.userAgent || '').slice(0, 1000), createdAt: nowIso(), ...details }
    state.loginHistory.unshift(event)
    return event
  })
}
export async function getAuthenticationState(query = {}) {
  const state = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return { ...state, sessions: state.sessions.slice(0, limit).map(item => ({ ...safeSession(item), effectiveStatus: status(item) })), loginHistory: state.loginHistory.slice(0, limit), securityEvents: state.securityEvents.slice(0, limit) }
}
