import crypto from 'node:crypto'
import { promisify } from 'node:util'
import path from 'node:path'
import { DATA_DIR, paths, readJson, safeName, writeJson } from './storage.js'

const scrypt = promisify(crypto.scrypt)
const CREDENTIAL_FILE = path.join(DATA_DIR, 'credentials.json')
const KEY_LENGTH = 64
const HASH_PREFIX = 'scrypt-v1'
const HISTORY_LIMIT = 5
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000
function credentialId(value) { return safeName(value || '') }
function nowIso() { return new Date().toISOString() }
export function validateStrongPassword(password) {
  const value = String(password || '')
  if (value.length < 12) throw new Error('Password must be at least 12 characters')
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) throw new Error('Password must include upper, lower, number and symbol characters')
  return value
}
export async function hashPassword(password) {
  const value = String(password || '')
  if (value.length < 8) throw new Error('Password must be at least 8 characters')
  const salt = crypto.randomBytes(16)
  const derived = await scrypt(value, salt, KEY_LENGTH)
  return `${HASH_PREFIX}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`
}
export async function verifyPassword(password, encoded) {
  const [prefix, saltValue, hashValue] = String(encoded || '').split('$')
  if (prefix !== HASH_PREFIX || !saltValue || !hashValue) return false
  try { const expected = Buffer.from(hashValue, 'base64url'); const actual = Buffer.from(await scrypt(String(password || ''), Buffer.from(saltValue, 'base64url'), expected.length)); return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) } catch { return false }
}
export async function getCredential(accountId) { const credentials = await readJson(CREDENTIAL_FILE, {}); return credentials[credentialId(accountId)] || null }
export async function setPassword(accountId, password, options = {}) {
  const id = credentialId(accountId)
  if (!id) throw new Error('Account id is required')
  if (options.enforcePolicy === true) validateStrongPassword(password)
  const credentials = await readJson(CREDENTIAL_FILE, {})
  const current = credentials[id] || {}
  for (const encoded of [current.passwordHash, ...(current.passwordHistory || [])].filter(Boolean)) if (await verifyPassword(password, encoded)) throw new Error('Password was used recently')
  const passwordHash = await hashPassword(password)
  const record = { ...current, passwordHash, passwordHistory: [current.passwordHash, ...(current.passwordHistory || [])].filter(Boolean).slice(0, HISTORY_LIMIT), updatedAt: nowIso(), passwordChangedAt: nowIso(), passwordExpiresAt: options.passwordExpiresAt || null, forcePasswordReset: options.forcePasswordReset === true, failedAttempts: 0, lockedUntil: null }
  delete record.resetTokenHash; delete record.resetExpiresAt
  await writeJson(CREDENTIAL_FILE, { ...credentials, [id]: record })
  return record
}
export async function recordCredentialFailure(accountId) {
  const id = credentialId(accountId); const credentials = await readJson(CREDENTIAL_FILE, {}); const current = credentials[id]
  if (!current) return null
  current.failedAttempts = (current.failedAttempts || 0) + 1; current.lastFailedAt = nowIso()
  if (current.failedAttempts >= MAX_FAILURES) current.lockedUntil = new Date(Date.now() + LOCK_MS).toISOString()
  await writeJson(CREDENTIAL_FILE, credentials); return current
}
export async function recordCredentialSuccess(accountId) {
  const id = credentialId(accountId); const credentials = await readJson(CREDENTIAL_FILE, {}); const current = credentials[id]
  if (!current) return null
  current.failedAttempts = 0; current.lockedUntil = null; current.lastAuthenticatedAt = nowIso()
  await writeJson(CREDENTIAL_FILE, credentials); return current
}
export function credentialAvailable(record) {
  if (!record) return { available: false, reason: 'missing' }
  if (record.lockedUntil && new Date(record.lockedUntil).getTime() > Date.now()) return { available: false, reason: 'locked', lockedUntil: record.lockedUntil }
  if (record.passwordExpiresAt && new Date(record.passwordExpiresAt).getTime() <= Date.now()) return { available: false, reason: 'password-expired' }
  if (record.forcePasswordReset) return { available: false, reason: 'password-reset-required' }
  return { available: true }
}
export async function createPasswordReset(accountId, ttlMinutes = 30) {
  const id = credentialId(accountId); const credentials = await readJson(CREDENTIAL_FILE, {}); const current = credentials[id]
  if (!current) throw new Error('Credential not found')
  const token = crypto.randomBytes(32).toString('base64url')
  current.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex'); current.resetExpiresAt = new Date(Date.now() + Math.min(120, Math.max(5, Number(ttlMinutes))) * 60000).toISOString()
  await writeJson(CREDENTIAL_FILE, credentials); return { token, expiresAt: current.resetExpiresAt }
}
export async function completePasswordReset(accountId, token, password) {
  validateStrongPassword(password)
  const id = credentialId(accountId); const credentials = await readJson(CREDENTIAL_FILE, {}); const current = credentials[id]
  if (!current?.resetTokenHash || new Date(current.resetExpiresAt).getTime() <= Date.now()) throw new Error('Password reset token is invalid or expired')
  const supplied = crypto.createHash('sha256').update(String(token || '')).digest('hex')
  if (!crypto.timingSafeEqual(Buffer.from(current.resetTokenHash, 'hex'), Buffer.from(supplied, 'hex'))) throw new Error('Password reset token is invalid or expired')
  return setPassword(id, password, { enforcePolicy: true })
}
export async function removeCredential(accountId) { const id = credentialId(accountId); const credentials = await readJson(CREDENTIAL_FILE, {}); if (!credentials[id]) return false; const next = { ...credentials }; delete next[id]; await writeJson(CREDENTIAL_FILE, next); return true }
export async function migratePlaintextCredentials() {
  const accounts = await readJson(paths.clients(), []); const credentials = await readJson(CREDENTIAL_FILE, {}); let accountChanged = false; let credentialChanged = false; const migrated = []
  for (const account of accounts) {
    const id = credentialId(account.id); const plaintext = String(account.password || account.accessCode || '')
    if (id && plaintext && !credentials[id]?.passwordHash) { credentials[id] = { passwordHash: await hashPassword(plaintext), passwordHistory: [], updatedAt: nowIso(), migratedAt: nowIso(), failedAttempts: 0, lockedUntil: null }; credentialChanged = true }
    if ('password' in account || 'accessCode' in account) { const safeAccount = { ...account }; delete safeAccount.password; delete safeAccount.accessCode; migrated.push(safeAccount); accountChanged = true } else migrated.push(account)
  }
  if (credentialChanged) await writeJson(CREDENTIAL_FILE, credentials)
  if (accountChanged) await writeJson(paths.clients(), migrated)
  return { accountsMigrated: accountChanged, credentialsCreated: credentialChanged }
}
