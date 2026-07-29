import crypto from 'node:crypto'
import { credentialAvailable, getCredential, recordCredentialFailure, recordCredentialSuccess, verifyPassword } from '../credentialStore.js'
import { paths, readJson } from '../storage.js'
import { evaluateLoginRisk, getMfaState, verifySecondFactor, verifyTrustedDevice } from './mfaService.js'
import {
  issuePersistentSession,
  recordLoginEvent,
  resolvePersistentSession,
  revokeAccountSessions,
  revokeSessionByToken,
} from './authPersistenceService.js'

const SESSION_COOKIE = 'ksj_session'
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000
const pendingLogins = new Map()
function nowIso() { return new Date().toISOString() }
function randomToken() { return crypto.randomBytes(32).toString('base64url') }
function tokenHash(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex') }
function parseCookies(header = '') { return Object.fromEntries(String(header).split(';').map(cookie => cookie.trim().split('=')).filter(parts => parts[0]).map(([key, ...value]) => [key, decodeURIComponent(value.join('='))])) }
function sessionCookie(value, { clear = false } = {}) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${clear ? '' : encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_TTL_SECONDS}${secure}`
}
function requestContext(req, success = true) { return { success, ip: req.ip || req.socket?.remoteAddress || '', userAgent: req.headers['user-agent'] || '', deviceName: req.body?.deviceName || '' } }
function accountPayload(client) { return { id: client.id, name: client.name, email: String(client.email || '').trim().toLowerCase(), role: client.role, websiteId: client.websiteId || '', websiteIds: client.websiteIds || (client.websiteId ? [client.websiteId] : []), canEdit: client.canEdit !== false, canManageMedia: client.canManageMedia !== false, canRequestUpdates: client.canRequestUpdates !== false, canViewSupport: client.canViewSupport !== false } }
function publicSession(session) { const { account, ...metadata } = session; return { ...account, ...metadata } }
function purgePending() { const now = Date.now(); for (const [key, pending] of pendingLogins) if (new Date(pending.expiresAt).getTime() <= now) pendingLogins.delete(key) }
async function mfaAccount(accountId) { const state = await getMfaState({ limit: 1000 }); return state.accounts.find(item => item.accountId === accountId) || null }
async function currentToken(req) { return parseCookies(req.headers.cookie || '')[SESSION_COOKIE] || '' }
export async function findAuthenticationSession(req) { const plaintext = await currentToken(req); return plaintext ? resolvePersistentSession(plaintext) : null }
export async function requireAuthenticationSession(req, res, next) { try { const session = await findAuthenticationSession(req); if (!session) return res.status(401).json({ error: 'Login required' }); req.session = { ...session.account, assuranceLevel: session.assuranceLevel, assuranceMethod: session.assuranceMethod, assuranceExpiresAt: session.assuranceExpiresAt, sessionId: session.id }; next() } catch (error) { next(error) } }
export async function loginWithPassword(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase(); const password = String(req.body?.password || '')
  const clients = await readJson(paths.clients(), []); const client = clients.find(item => String(item.email || '').trim().toLowerCase() === email)
  const credential = client ? await getCredential(client.id) : null; const availability = credentialAvailable(credential)
  if (!client || !credential?.passwordHash || !availability.available || !(await verifyPassword(password, credential.passwordHash))) {
    if (client?.id) { await recordCredentialFailure(client.id); await evaluateLoginRisk(client.id, requestContext(req, false)); await recordLoginEvent(client.id, requestContext(req, false), false, { reason: availability.reason || 'invalid-password' }) }
    return res.status(availability.reason === 'locked' ? 423 : 401).json({ error: availability.reason === 'locked' ? 'Account is temporarily locked' : 'Invalid email or password', lockedUntil: availability.lockedUntil })
  }
  await recordCredentialSuccess(client.id); const previous = await currentToken(req); if (previous) await revokeSessionByToken(previous, 'session-rotation')
  const account = accountPayload(client); const risk = await evaluateLoginRisk(account.id, requestContext(req, true)); await recordLoginEvent(account.id, requestContext(req, true), true, { risk: risk.risk })
  const mfa = await mfaAccount(account.id); const trustedDeviceToken = String(req.body?.trustedDeviceToken || '').trim()
  if (mfa?.enabled && trustedDeviceToken && risk.risk === 'low') {
    try { const trusted = await verifyTrustedDevice(account.id, trustedDeviceToken, req.headers['user-agent'] || ''); const issued = await issuePersistentSession(account, requestContext(req), { assuranceLevel: trusted.assuranceLevel, assuranceMethod: 'trusted-device', assuranceExpiresAt: trusted.assuranceExpiresAt }); res.setHeader('Set-Cookie', sessionCookie(issued.token)); return res.json({ ...publicSession(issued.session), risk }) } catch { /* require fresh factor */ }
  }
  if (mfa?.enabled) { const pendingToken = randomToken(); const expiresAt = new Date(Date.now() + PENDING_LOGIN_TTL_MS).toISOString(); pendingLogins.set(tokenHash(pendingToken), { account, risk, context: requestContext(req), createdAt: nowIso(), expiresAt }); res.setHeader('Set-Cookie', sessionCookie('', { clear: true })); return res.status(202).json({ mfaRequired: true, pendingLoginToken: pendingToken, expiresAt, risk }) }
  const issued = await issuePersistentSession(account, requestContext(req)); res.setHeader('Set-Cookie', sessionCookie(issued.token)); return res.json({ ...publicSession(issued.session), risk, mfaEnrollmentRecommended: risk.requireMfa })
}
export async function completeMfaLogin(req, res) {
  purgePending(); const key = tokenHash(req.body?.pendingLoginToken); const pending = pendingLogins.get(key)
  if (!pending) return res.status(401).json({ error: 'Pending MFA login is invalid or expired' })
  try {
    const verification = await verifySecondFactor(pending.account.id, { code: req.body?.code, recoveryCode: req.body?.recoveryCode, trustDevice: req.body?.trustDevice === true, deviceName: req.body?.deviceName, trustDays: req.body?.trustDays, userAgent: req.headers['user-agent'] || '' }, { id: pending.account.id, email: pending.account.email, role: pending.account.role })
    pendingLogins.delete(key); const previous = await currentToken(req); if (previous) await revokeSessionByToken(previous, 'mfa-session-rotation')
    const issued = await issuePersistentSession(pending.account, pending.context, { assuranceLevel: verification.assuranceLevel, assuranceMethod: verification.method, assuranceExpiresAt: verification.assuranceExpiresAt })
    res.setHeader('Set-Cookie', sessionCookie(issued.token)); return res.json({ ...publicSession(issued.session), trustedDeviceToken: verification.trustedDeviceToken, risk: pending.risk })
  } catch (error) {
    console.error('MFA login completion failed', error)
    return res.status(Number(error?.status || 403)).json({ error: 'Second-factor verification failed' })
  }
}
export async function logoutAuthenticationSession(req, res) { const token = await currentToken(req); if (token) await revokeSessionByToken(token); res.setHeader('Set-Cookie', sessionCookie('', { clear: true })); return res.json({ ok: true }) }
export async function logoutAllAuthenticationSessions(req, res) { const session = await findAuthenticationSession(req); if (!session) return res.status(401).json({ error: 'Login required' }); const result = await revokeAccountSessions(session.accountId, 'global-logout'); res.setHeader('Set-Cookie', sessionCookie('', { clear: true })); return res.json(result) }
export async function getCurrentAuthenticationSession(req, res) { const session = await findAuthenticationSession(req); if (!session) return res.status(401).json({ error: 'Login required' }); return res.json(publicSession(session)) }
