import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { writeStructuredLog } from './systemHealthService.js'

const REGISTRY_FILE = path.join(DATA_DIR, 'mfa', 'registry.json')
const mutations = new Map()
const MAX_HISTORY = 10000
const STEP_UP_TTL_MS = 10 * 60 * 1000
const ASSURANCE_TTL_MS = 30 * 60 * 1000
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export class MfaError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'MfaError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() {
  return {
    accounts: [], challenges: [], trustedDevices: [], loginEvents: [], history: [],
    statistics: { enrolled: 0, verified: 0, failed: 0, recoveryUsed: 0, trustedDevicesCreated: 0, stepUpsCompleted: 0 },
    version: 1, updatedAt: nowIso(),
  }
}
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.accounts ||= []
  registry.challenges ||= []
  registry.trustedDevices ||= []
  registry.loginEvents ||= []
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
    registry.challenges = registry.challenges.slice(0, 10000)
    registry.trustedDevices = registry.trustedDevices.slice(0, 25000)
    registry.loginEvents = registry.loginEvents.slice(0, 25000)
    registry.history = registry.history.slice(0, MAX_HISTORY)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function required(value, label, maximum = 500) {
  const result = String(value || '').trim()
  if (!result) throw new MfaError(`${label} is required`, 422)
  if (result.length > maximum) throw new MfaError(`${label} is too long`, 422)
  return result
}
function accountId(value) {
  const id = safeName(required(value, 'Account ID', 200))
  if (!id || id === 'file') throw new MfaError('Account ID is invalid', 422)
  return id
}
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex') }
function timingSafeHex(expectedHex, supplied) {
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = Buffer.from(hash(supplied), 'hex')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}
function base32Encode(buffer) {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')
  let output = ''
  for (let index = 0; index < bits.length; index += 5) output += BASE32[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)]
  return output
}
function base32Decode(value) {
  let bits = ''
  for (const character of String(value).toUpperCase().replace(/=+$/g, '')) {
    const index = BASE32.indexOf(character)
    if (index < 0) throw new MfaError('TOTP secret is invalid', 422)
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  return Buffer.from(bytes)
}
function encryptionKey() {
  const configured = String(process.env.MFA_ENCRYPTION_KEY || '').trim()
  if (!configured) throw new MfaError('MFA_ENCRYPTION_KEY is not configured', 503)
  return crypto.createHash('sha256').update(configured).digest()
}
function encrypt(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}
function decrypt(value) {
  try {
    const [iv, tag, encrypted] = String(value).split('.')
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    throw new MfaError('Stored MFA secret could not be decrypted', 500)
  }
}
function totpCode(secret, at = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(at / 1000 / stepSeconds)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(message).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff)
  return String(binary % 1000000).padStart(6, '0')
}
function verifyTotp(secret, code, at = Date.now()) {
  const supplied = String(code || '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(supplied)) return false
  return [-1, 0, 1].some(offset => {
    const expected = Buffer.from(totpCode(secret, at + offset * 30000))
    const actual = Buffer.from(supplied)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  })
}
function recoveryCodes() {
  return Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-'))
}
function safeAccount(account) {
  if (!account) return null
  const { encryptedSecret, pendingEncryptedSecret, recoveryCodeHashes, ...safe } = account
  return { ...structuredClone(safe), recoveryCodesRemaining: recoveryCodeHashes?.length || 0 }
}
function trustedDeviceStatus(device, at = Date.now()) {
  if (device.revokedAt) return 'revoked'
  if (new Date(device.expiresAt).getTime() <= at) return 'expired'
  return 'active'
}

export async function getMfaState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return {
    accounts: registry.accounts.slice(0, limit).map(safeAccount),
    challenges: registry.challenges.slice(0, limit),
    trustedDevices: registry.trustedDevices.slice(0, limit).map(device => ({ ...device, tokenHash: undefined, effectiveStatus: trustedDeviceStatus(device) })),
    loginEvents: registry.loginEvents.slice(0, limit), history: registry.history.slice(0, limit), statistics: registry.statistics,
    version: registry.version, updatedAt: registry.updatedAt,
  }
}

export async function beginTotpEnrollment(value, input = {}, actor = null) {
  const id = accountId(value)
  const issuer = required(input.issuer || 'KSJ Digital', 'Issuer', 200)
  const label = required(input.label || id, 'Account label', 320)
  const secret = base32Encode(crypto.randomBytes(20))
  const createdAt = nowIso()
  await mutate(registry => {
    const existing = registry.accounts.find(item => item.accountId === id)
    const account = existing || { accountId: id, enabled: false, createdAt }
    account.pendingEncryptedSecret = encrypt(secret)
    account.enrollmentExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    account.updatedAt = createdAt; account.updatedBy = actor
    registry.accounts = [account, ...registry.accounts.filter(item => item.accountId !== id)]
    registry.history.unshift({ id: crypto.randomUUID(), action: 'mfa.enrollment-started', accountId: id, actor, createdAt })
  })
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
  return { accountId: id, secret, otpauthUri: uri, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() }
}

export async function confirmTotpEnrollment(value, code, actor = null) {
  const id = accountId(value)
  const codes = recoveryCodes()
  return mutate(registry => {
    const account = registry.accounts.find(item => item.accountId === id)
    if (!account?.pendingEncryptedSecret) throw new MfaError('MFA enrollment has not been started', 404)
    if (new Date(account.enrollmentExpiresAt).getTime() <= Date.now()) throw new MfaError('MFA enrollment has expired', 410)
    const secret = decrypt(account.pendingEncryptedSecret)
    if (!verifyTotp(secret, code)) throw new MfaError('TOTP code is invalid', 403)
    account.encryptedSecret = account.pendingEncryptedSecret
    delete account.pendingEncryptedSecret
    delete account.enrollmentExpiresAt
    account.enabled = true; account.enabledAt = nowIso(); account.updatedAt = account.enabledAt; account.updatedBy = actor
    account.recoveryCodeHashes = codes.map(hash)
    registry.statistics.enrolled += 1
    registry.history.unshift({ id: crypto.randomUUID(), action: 'mfa.enabled', accountId: id, actor, createdAt: account.enabledAt })
    return { account: safeAccount(account), recoveryCodes: codes }
  })
}

export async function verifySecondFactor(value, input = {}, actor = null) {
  const id = accountId(value)
  const registry = await readRegistry()
  const account = registry.accounts.find(item => item.accountId === id)
  if (!account?.enabled || !account.encryptedSecret) throw new MfaError('MFA is not enabled for this account', 409)
  let method = null
  if (input.code && verifyTotp(decrypt(account.encryptedSecret), input.code)) method = 'totp'
  if (!method && input.recoveryCode) {
    const index = account.recoveryCodeHashes.findIndex(codeHash => timingSafeHex(codeHash, String(input.recoveryCode).toUpperCase()))
    if (index >= 0) method = 'recovery'
  }
  if (!method) {
    await mutate(state => {
      const current = state.accounts.find(item => item.accountId === id); current.failedAttempts = (current.failedAttempts || 0) + 1; current.lastFailedAt = nowIso()
      state.statistics.failed += 1
      state.history.unshift({ id: crypto.randomUUID(), action: 'mfa.verification-failed', accountId: id, actor, createdAt: current.lastFailedAt })
    })
    throw new MfaError('Second-factor verification failed', 403)
  }
  const trustedToken = input.trustDevice === true ? crypto.randomBytes(32).toString('base64url') : null
  const result = await mutate(state => {
    const current = state.accounts.find(item => item.accountId === id)
    if (method === 'recovery') {
      const index = current.recoveryCodeHashes.findIndex(codeHash => timingSafeHex(codeHash, String(input.recoveryCode).toUpperCase()))
      current.recoveryCodeHashes.splice(index, 1); state.statistics.recoveryUsed += 1
    }
    current.lastVerifiedAt = nowIso(); current.failedAttempts = 0
    state.statistics.verified += 1
    let trustedDevice = null
    if (trustedToken) {
      trustedDevice = { id: crypto.randomUUID(), accountId: id, tokenHash: hash(trustedToken), name: String(input.deviceName || 'Trusted device').slice(0, 200), userAgentHash: hash(input.userAgent || ''), createdAt: nowIso(), lastUsedAt: null, expiresAt: new Date(Date.now() + Math.min(90, Math.max(1, Number(input.trustDays || 30))) * 86400000).toISOString(), revokedAt: null }
      state.trustedDevices.unshift(trustedDevice); state.statistics.trustedDevicesCreated += 1
    }
    state.history.unshift({ id: crypto.randomUUID(), action: 'mfa.verified', accountId: id, method, actor, createdAt: current.lastVerifiedAt })
    return { method, assuranceLevel: 2, assuranceExpiresAt: new Date(Date.now() + ASSURANCE_TTL_MS).toISOString(), trustedDevice: trustedDevice ? { ...trustedDevice, tokenHash: undefined } : null }
  })
  await writeStructuredLog('info', 'MFA verification succeeded', { accountId: id, method })
  return { ...result, trustedDeviceToken: trustedToken }
}

export async function verifyTrustedDevice(value, token, userAgent = '') {
  const id = accountId(value)
  const supplied = required(token, 'Trusted device token', 1000)
  return mutate(registry => {
    const device = registry.trustedDevices.find(item => item.accountId === id && timingSafeHex(item.tokenHash, supplied))
    if (!device || trustedDeviceStatus(device) !== 'active') throw new MfaError('Trusted device is invalid', 403)
    if (device.userAgentHash !== hash(userAgent || '')) throw new MfaError('Trusted device fingerprint does not match', 403)
    device.lastUsedAt = nowIso()
    return { trusted: true, deviceId: device.id, assuranceLevel: 2, assuranceExpiresAt: new Date(Date.now() + ASSURANCE_TTL_MS).toISOString() }
  })
}

export async function revokeTrustedDevice(deviceIdValue, actor = null) {
  const deviceId = required(deviceIdValue, 'Trusted device ID', 100)
  return mutate(registry => {
    const device = registry.trustedDevices.find(item => item.id === deviceId)
    if (!device) throw new MfaError('Trusted device not found', 404)
    device.revokedAt = nowIso(); device.revokedBy = actor
    registry.history.unshift({ id: crypto.randomUUID(), action: 'mfa.trusted-device-revoked', deviceId, accountId: device.accountId, actor, createdAt: device.revokedAt })
    const { tokenHash, ...safe } = device
    return safe
  })
}

export async function disableMfa(value, actor = null) {
  const id = accountId(value)
  return mutate(registry => {
    const account = registry.accounts.find(item => item.accountId === id)
    if (!account) throw new MfaError('MFA account not found', 404)
    account.enabled = false; account.disabledAt = nowIso(); account.updatedAt = account.disabledAt; account.updatedBy = actor
    delete account.encryptedSecret; delete account.pendingEncryptedSecret; account.recoveryCodeHashes = []
    for (const device of registry.trustedDevices.filter(item => item.accountId === id && !item.revokedAt)) { device.revokedAt = account.disabledAt; device.revokedBy = actor }
    registry.history.unshift({ id: crypto.randomUUID(), action: 'mfa.disabled', accountId: id, actor, createdAt: account.disabledAt })
    return safeAccount(account)
  })
}

export async function createStepUpChallenge(value, input = {}, actor = null) {
  const id = accountId(value)
  const requiredLevel = Math.min(3, Math.max(2, Number(input.requiredLevel || 2)))
  return mutate(registry => {
    const account = registry.accounts.find(item => item.accountId === id)
    if (!account?.enabled) throw new MfaError('MFA is not enabled for this account', 409)
    const challenge = { id: crypto.randomUUID(), accountId: id, requiredLevel, purpose: String(input.purpose || 'sensitive-operation').slice(0, 200), status: 'pending', createdAt: nowIso(), createdBy: actor, expiresAt: new Date(Date.now() + Math.min(30 * 60000, Math.max(60000, Number(input.ttlMs || STEP_UP_TTL_MS)))).toISOString() }
    registry.challenges.unshift(challenge)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'mfa.step-up-created', challengeId: challenge.id, accountId: id, actor, createdAt: challenge.createdAt })
    return challenge
  })
}

export async function completeStepUpChallenge(challengeIdValue, input = {}, actor = null) {
  const challengeId = required(challengeIdValue, 'Step-up challenge ID', 100)
  const registry = await readRegistry()
  const challenge = registry.challenges.find(item => item.id === challengeId)
  if (!challenge) throw new MfaError('Step-up challenge not found', 404)
  if (challenge.status !== 'pending') throw new MfaError('Step-up challenge is not pending', 409)
  if (new Date(challenge.expiresAt).getTime() <= Date.now()) throw new MfaError('Step-up challenge has expired', 410)
  const verification = await verifySecondFactor(challenge.accountId, input, actor)
  return mutate(state => {
    const current = state.challenges.find(item => item.id === challengeId)
    current.status = 'completed'; current.completedAt = nowIso(); current.completedBy = actor; current.method = verification.method
    state.statistics.stepUpsCompleted += 1
    state.history.unshift({ id: crypto.randomUUID(), action: 'mfa.step-up-completed', challengeId, accountId: current.accountId, actor, createdAt: current.completedAt })
    return { challenge: current, assuranceLevel: current.requiredLevel, assuranceExpiresAt: verification.assuranceExpiresAt }
  })
}

export async function evaluateLoginRisk(value, context = {}) {
  const id = accountId(value)
  const registry = await readRegistry()
  const recent = registry.loginEvents.filter(item => item.accountId === id).slice(0, 20)
  let score = 0
  const reasons = []
  if (context.success === false) { score += 30; reasons.push('failed-login') }
  if (context.ip && recent.length && !recent.some(item => item.ip === context.ip)) { score += 25; reasons.push('new-ip') }
  if (context.userAgent && recent.length && !recent.some(item => item.userAgentHash === hash(context.userAgent))) { score += 20; reasons.push('new-device') }
  const failedRecently = recent.filter(item => item.success === false && Date.now() - new Date(item.createdAt).getTime() < 15 * 60000).length
  if (failedRecently >= 3) { score += 30; reasons.push('repeated-failures') }
  const risk = score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low'
  await mutate(state => {
    state.loginEvents.unshift({ id: crypto.randomUUID(), accountId: id, success: context.success !== false, ip: String(context.ip || ''), userAgentHash: hash(context.userAgent || ''), risk, score, reasons, createdAt: nowIso() })
  })
  return { accountId: id, risk, score, reasons, requireMfa: risk !== 'low' }
}

export function requireAssurance(requiredLevel = 2) {
  return function assuranceMiddleware(req, res, next) {
    const level = Number(req.session?.assuranceLevel || 1)
    const expiresAt = req.session?.assuranceExpiresAt ? new Date(req.session.assuranceExpiresAt).getTime() : 0
    if (level >= requiredLevel && expiresAt > Date.now()) return next()
    return res.status(403).json({ error: 'Step-up authentication required', requiredAssuranceLevel: requiredLevel })
  }
}
