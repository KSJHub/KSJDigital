import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function decodeBase32(value) {
  let bits = ''
  for (const character of value) bits += BASE32.indexOf(character).toString(2).padStart(5, '0')
  const bytes = []
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  return Buffer.from(bytes)
}
function totp(secret, at = Date.now()) {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(message).digest()
  const offset = digest[digest.length - 1] & 15
  const binary = ((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255)
  return String(binary % 1000000).padStart(6, '0')
}

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-mfa-'))
process.chdir(temporary)
process.env.MFA_ENCRYPTION_KEY = 'validation-only-encryption-key-with-sufficient-entropy'
try {
  const serviceFile = path.join(root, 'server/services/mfaService.js')
  const mfa = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)
  const actor = { id: 'owner-check', email: 'owner@example.test', role: 'owner' }

  const enrollment = await mfa.beginTotpEnrollment('owner-check', { issuer: 'KSJ Digital', label: 'owner@example.test' }, actor)
  assert.match(enrollment.secret, /^[A-Z2-7]+$/)
  assert.match(enrollment.otpauthUri, /^otpauth:\/\/totp\//)

  const confirmed = await mfa.confirmTotpEnrollment('owner-check', totp(enrollment.secret), actor)
  assert.equal(confirmed.account.enabled, true)
  assert.equal(confirmed.recoveryCodes.length, 10)
  assert.equal('encryptedSecret' in confirmed.account, false)

  const verified = await mfa.verifySecondFactor('owner-check', { code: totp(enrollment.secret), trustDevice: true, deviceName: 'Validation device', userAgent: 'KSJ-Test', trustDays: 7 }, actor)
  assert.equal(verified.assuranceLevel, 2)
  assert.ok(verified.trustedDeviceToken)

  const trusted = await mfa.verifyTrustedDevice('owner-check', verified.trustedDeviceToken, 'KSJ-Test')
  assert.equal(trusted.trusted, true)

  const challenge = await mfa.createStepUpChallenge('owner-check', { purpose: 'delete-site', requiredLevel: 3 }, actor)
  const completed = await mfa.completeStepUpChallenge(challenge.id, { code: totp(enrollment.secret) }, actor)
  assert.equal(completed.assuranceLevel, 3)

  const recovery = await mfa.verifySecondFactor('owner-check', { recoveryCode: confirmed.recoveryCodes[0] }, actor)
  assert.equal(recovery.method, 'recovery')

  await mfa.evaluateLoginRisk('owner-check', { success: true, ip: '192.0.2.10', userAgent: 'KSJ-Test' })
  const risk = await mfa.evaluateLoginRisk('owner-check', { success: false, ip: '198.51.100.20', userAgent: 'Different-Agent' })
  assert.notEqual(risk.risk, 'low')

  const state = await mfa.getMfaState({ limit: 100 })
  assert.equal(state.accounts.length, 1)
  assert.equal('encryptedSecret' in state.accounts[0], false)
  assert.equal('tokenHash' in state.trustedDevices[0], true)
  assert.equal(state.trustedDevices[0].tokenHash, undefined)
  assert.equal(state.statistics.stepUpsCompleted, 1)

  const revoked = await mfa.revokeTrustedDevice(state.trustedDevices[0].id, actor)
  assert.ok(revoked.revokedAt)
  const disabled = await mfa.disableMfa('owner-check', actor)
  assert.equal(disabled.enabled, false)

  const router = await fs.readFile(path.join(root, 'server/mfaRouter.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(router, /Owner permission required/)
  assert.match(router, /step-up/)
  assert.match(start, /createMfaRouter/)
  assert.match(start, /\/api\/mfa/)

  console.log('Advanced authentication and MFA checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
