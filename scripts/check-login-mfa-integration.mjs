import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-login-mfa-'))
process.chdir(temporary)
process.env.MFA_ENCRYPTION_KEY = 'integration-check-encryption-key'
function response() { return { statusCode: 200, headers: {}, body: null, status(code) { this.statusCode = code; return this }, setHeader(name, value) { this.headers[name] = value }, json(value) { this.body = value; return this } } }
function request(body = {}, headers = {}) { return { body, headers, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } }
const base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function decodeBase32(value) { let bits = ''; for (const character of value) bits += base32.indexOf(character).toString(2).padStart(5, '0'); const bytes = []; for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2)); return Buffer.from(bytes) }
function totp(secret) { const counter = Math.floor(Date.now() / 30000); const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter)); const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(message).digest(); const offset = digest[digest.length - 1] & 0x0f; const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff); return String(binary % 1000000).padStart(6, '0') }
try {
  const storage = await import(`${pathToFileURL(path.join(root, 'server/storage.js')).href}?check=${Date.now()}`)
  const credentials = await import(`${pathToFileURL(path.join(root, 'server/credentialStore.js')).href}?check=${Date.now()}`)
  const mfa = await import(`${pathToFileURL(path.join(root, 'server/services/mfaService.js')).href}?check=${Date.now()}`)
  const authentication = await import(`${pathToFileURL(path.join(root, 'server/services/authenticationService.js')).href}?check=${Date.now()}`)
  const account = { id: 'owner-check', name: 'Owner', email: 'owner@example.test', role: 'owner' }
  await storage.writeJson(storage.paths.clients(), [{ ...account, status: '  SUSPENDED  ' }])
  await credentials.setPassword('owner-check', 'correct-password')
  const suspendedLogin = response()
  await authentication.loginWithPassword(request({ email: 'owner@example.test', password: 'correct-password' }, { 'user-agent': 'Integration Agent' }), suspendedLogin)
  assert.equal(suspendedLogin.statusCode, 401); assert.equal(suspendedLogin.body.error, 'This account is no longer active'); assert.equal(suspendedLogin.headers['Set-Cookie'], undefined)
  await storage.writeJson(storage.paths.clients(), [{ ...account, status: 'Active' }])
  const firstLogin = response()
  await authentication.loginWithPassword(request({ email: 'owner@example.test', password: 'correct-password' }, { 'user-agent': 'Integration Agent' }), firstLogin)
  assert.equal(firstLogin.statusCode, 200); assert.equal(firstLogin.body.assuranceLevel, 1); assert.match(firstLogin.headers['Set-Cookie'], /HttpOnly/)
  const firstCookie = firstLogin.headers['Set-Cookie'].split(';')[0]
  const enrollment = await mfa.beginTotpEnrollment('owner-check', { label: 'Owner' }, { id: 'owner-check', role: 'owner' })
  const confirmation = await mfa.confirmTotpEnrollment('owner-check', totp(enrollment.secret), { id: 'owner-check', role: 'owner' })
  assert.equal(confirmation.account.enabled, true)
  const pendingLogin = response()
  await authentication.loginWithPassword(request({ email: 'owner@example.test', password: 'correct-password' }, { cookie: firstCookie, 'user-agent': 'Integration Agent' }), pendingLogin)
  assert.equal(pendingLogin.statusCode, 202); assert.equal(pendingLogin.body.mfaRequired, true); assert.ok(pendingLogin.body.pendingLoginToken)
  const oldSession = response(); await authentication.getCurrentAuthenticationSession(request({}, { cookie: firstCookie }), oldSession); assert.equal(oldSession.statusCode, 401)
  const completed = response()
  await authentication.completeMfaLogin(request({ pendingLoginToken: pendingLogin.body.pendingLoginToken, code: totp(enrollment.secret), trustDevice: true, deviceName: 'Integration device' }, { 'user-agent': 'Integration Agent' }), completed)
  assert.equal(completed.statusCode, 200); assert.equal(completed.body.assuranceLevel, 2); assert.ok(completed.body.trustedDeviceToken); assert.match(completed.headers['Set-Cookie'], /ksj_session=/)
  const current = response(); await authentication.getCurrentAuthenticationSession(request({}, { cookie: completed.headers['Set-Cookie'].split(';')[0] }), current); assert.equal(current.statusCode, 200); assert.equal(current.body.assuranceLevel, 2)
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8'); const router = await fs.readFile(path.join(root, 'server/authenticationRouter.js'), 'utf8'); const authenticationSource = await fs.readFile(path.join(root, 'server/services/authenticationService.js'), 'utf8')
  assert.match(start, /migratePlaintextCredentials/); assert.match(start, /requireAuthenticationSession/); assert.match(start, /loginWithPassword/); assert.match(start, /requireAssurance\(2\)/); assert.match(router, /\/api\/login\/mfa/)
  assert.match(authenticationSource, /function accountIsSuspended/); assert.match(authenticationSource, /accountIsSuspended\(client\)/); assert.match(authenticationSource, /reason: 'account-suspended'/)
  const mfaCompletionStart = authenticationSource.indexOf('export async function completeMfaLogin')
  const mfaCompletionEnd = authenticationSource.indexOf('\nexport async function logoutAuthenticationSession', mfaCompletionStart)
  const mfaCompletion = authenticationSource.slice(mfaCompletionStart, mfaCompletionEnd)
  assert.match(mfaCompletion, /MFA login completion failed/)
  assert.match(mfaCompletion, /error: 'Second-factor verification failed'/)
  assert.ok(!/error\?\.message|error\.message/.test(mfaCompletion), 'Public MFA completion must not expose raw verification errors')
  console.log('Login and MFA integration checks passed')
} finally { process.chdir(root); await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
