import crypto from 'node:crypto'
import { getCredential, verifyPassword } from '../credentialStore.js'
import { paths, readJson } from '../storage.js'
import {
  evaluateLoginRisk,
  getMfaState,
  verifySecondFactor,
  verifyTrustedDevice,
} from './mfaService.js'

const SESSION_COOKIE = 'ksj_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000
const sessions = new Map()
const pendingLogins = new Map()

function nowIso() { return new Date().toISOString() }
function token() { return crypto.randomBytes(32).toString('base64url') }
function tokenHash(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex') }

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map(cookie => cookie.trim().split('='))
      .filter(parts => parts[0])
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]),
  )
}

function sessionCookie(value, { clear = false } = {}) {
  const maxAge = clear ? 0 : Math.floor(SESSION_TTL_MS / 1000)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${clear ? '' : encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

function requestContext(req, success = true) {
  return {
    success,
    ip: req.ip || req.socket?.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
  }
}

function accountPayload(client) {
  return {
    id: client.id,
    name: client.name,
    email: String(client.email || '').trim().toLowerCase(),
    role: client.role,
    websiteId: client.websiteId || '',
    websiteIds: client.websiteIds || (client.websiteId ? [client.websiteId] : []),
    canEdit: client.canEdit !== false,
    canManageMedia: client.canManageMedia !== false,
    canRequestUpdates: client.canRequestUpdates !== false,
    canViewSupport: client.canViewSupport !== false,
  }
}

function publicSession(session) {
  const { createdAt, expiresAt, ...account } = session
  return { ...account, sessionCreatedAt: createdAt, sessionExpiresAt: expiresAt }
}

function purgeExpired() {
  const now = Date.now()
  for (const [key, session] of sessions) if (new Date(session.expiresAt).getTime() <= now) sessions.delete(key)
  for (const [key, pending] of pendingLogins) if (new Date(pending.expiresAt).getTime() <= now) pendingLogins.delete(key)
}

function issueSession(account, assurance = {}) {
  purgeExpired()
  const plaintext = token()
  const createdAt = nowIso()
  const session = {
    ...account,
    assuranceLevel: Number(assurance.assuranceLevel || 1),
    assuranceMethod: assurance.assuranceMethod || 'password',
    assuranceExpiresAt: assurance.assuranceExpiresAt || new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    createdAt,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  }
  sessions.set(tokenHash(plaintext), session)
  return { plaintext, session }
}

function revokeRequestSession(req) {
  const current = parseCookies(req.headers.cookie || '')[SESSION_COOKIE]
  if (current) sessions.delete(tokenHash(current))
}

async function mfaAccount(accountId) {
  const state = await getMfaState({ limit: 1000 })
  return state.accounts.find(item => item.accountId === accountId) || null
}

export function findAuthenticationSession(req) {
  purgeExpired()
  const plaintext = parseCookies(req.headers.cookie || '')[SESSION_COOKIE]
  if (!plaintext) return null
  return sessions.get(tokenHash(plaintext)) || null
}

export function requireAuthenticationSession(req, res, next) {
  const session = findAuthenticationSession(req)
  if (!session) return res.status(401).json({ error: 'Login required' })
  req.session = session
  next()
}

export async function loginWithPassword(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const clients = await readJson(paths.clients(), [])
  const client = clients.find(item => String(item.email || '').trim().toLowerCase() === email)
  const credential = client ? await getCredential(client.id) : null
  const valid = Boolean(client && credential?.passwordHash && await verifyPassword(password, credential.passwordHash))

  if (!valid) {
    if (client?.id) await evaluateLoginRisk(client.id, requestContext(req, false))
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  revokeRequestSession(req)
  const account = accountPayload(client)
  const risk = await evaluateLoginRisk(account.id, requestContext(req, true))
  const mfa = await mfaAccount(account.id)
  const trustedDeviceToken = String(req.body?.trustedDeviceToken || '').trim()

  if (mfa?.enabled && trustedDeviceToken && risk.risk === 'low') {
    try {
      const trusted = await verifyTrustedDevice(account.id, trustedDeviceToken, req.headers['user-agent'] || '')
      const issued = issueSession(account, {
        assuranceLevel: trusted.assuranceLevel,
        assuranceMethod: 'trusted-device',
        assuranceExpiresAt: trusted.assuranceExpiresAt,
      })
      res.setHeader('Set-Cookie', sessionCookie(issued.plaintext))
      return res.json({ ...publicSession(issued.session), risk })
    } catch {
      // Continue to a fresh second-factor challenge when a remembered device is invalid.
    }
  }

  if (mfa?.enabled) {
    const pendingToken = token()
    const expiresAt = new Date(Date.now() + PENDING_LOGIN_TTL_MS).toISOString()
    pendingLogins.set(tokenHash(pendingToken), { account, risk, createdAt: nowIso(), expiresAt })
    res.setHeader('Set-Cookie', sessionCookie('', { clear: true }))
    return res.status(202).json({ mfaRequired: true, pendingLoginToken: pendingToken, expiresAt, risk })
  }

  const issued = issueSession(account)
  res.setHeader('Set-Cookie', sessionCookie(issued.plaintext))
  return res.json({ ...publicSession(issued.session), risk, mfaEnrollmentRecommended: risk.requireMfa })
}

export async function completeMfaLogin(req, res) {
  purgeExpired()
  const pendingToken = String(req.body?.pendingLoginToken || '').trim()
  const pendingKey = tokenHash(pendingToken)
  const pending = pendingLogins.get(pendingKey)
  if (!pending) return res.status(401).json({ error: 'Pending MFA login is invalid or expired' })

  try {
    const verification = await verifySecondFactor(pending.account.id, {
      code: req.body?.code,
      recoveryCode: req.body?.recoveryCode,
      trustDevice: req.body?.trustDevice === true,
      deviceName: req.body?.deviceName,
      trustDays: req.body?.trustDays,
      userAgent: req.headers['user-agent'] || '',
    }, { id: pending.account.id, email: pending.account.email, role: pending.account.role })
    pendingLogins.delete(pendingKey)
    revokeRequestSession(req)
    const issued = issueSession(pending.account, {
      assuranceLevel: verification.assuranceLevel,
      assuranceMethod: verification.method,
      assuranceExpiresAt: verification.assuranceExpiresAt,
    })
    res.setHeader('Set-Cookie', sessionCookie(issued.plaintext))
    return res.json({ ...publicSession(issued.session), trustedDeviceToken: verification.trustedDeviceToken, risk: pending.risk })
  } catch (error) {
    const status = Number(error?.status || 403)
    return res.status(status).json({ error: error?.message || 'Second-factor verification failed' })
  }
}

export function logoutAuthenticationSession(req, res) {
  revokeRequestSession(req)
  res.setHeader('Set-Cookie', sessionCookie('', { clear: true }))
  return res.json({ ok: true })
}

export function getCurrentAuthenticationSession(req, res) {
  const session = findAuthenticationSession(req)
  if (!session) return res.status(401).json({ error: 'Login required' })
  return res.json(publicSession(session))
}

export function authenticationSessionStatistics() {
  purgeExpired()
  return { activeSessions: sessions.size, pendingMfaLogins: pendingLogins.size }
}
