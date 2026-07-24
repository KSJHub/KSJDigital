import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-auth-persistence-'))
process.chdir(temporary)
try {
  const credentials = await import(`${pathToFileURL(path.join(root, 'server/credentialStore.js')).href}?check=${Date.now()}`)
  const persistence = await import(`${pathToFileURL(path.join(root, 'server/services/authPersistenceService.js')).href}?check=${Date.now()}`)
  await credentials.setPassword('account-one', 'Strong-password1!')
  const stored = await credentials.getCredential('account-one')
  assert.ok(stored.passwordHash)
  assert.equal(await credentials.verifyPassword('Strong-password1!', stored.passwordHash), true)
  await assert.rejects(() => credentials.setPassword('account-one', 'Strong-password1!'), /used recently/)
  for (let index = 0; index < 5; index += 1) await credentials.recordCredentialFailure('account-one')
  assert.equal(credentials.credentialAvailable(await credentials.getCredential('account-one')).reason, 'locked')
  const reset = await credentials.createPasswordReset('account-one', 5)
  assert.ok(reset.token)
  await credentials.completePasswordReset('account-one', reset.token, 'Changed-password2!')
  assert.equal(await credentials.verifyPassword('Changed-password2!', (await credentials.getCredential('account-one')).passwordHash), true)

  const account = { id: 'account-one', email: 'one@example.test', role: 'owner' }
  const issued = await persistence.issuePersistentSession(account, { ip: '127.0.0.1', userAgent: 'check-agent', deviceName: 'Check device' }, { assuranceLevel: 2, assuranceMethod: 'totp' })
  assert.ok(issued.token)
  const resolved = await persistence.resolvePersistentSession(issued.token)
  assert.equal(resolved.accountId, 'account-one')
  assert.equal(resolved.assuranceLevel, 2)
  const state = await persistence.getAuthenticationState({ limit: 100 })
  assert.equal(state.sessions.length, 1)
  assert.equal('tokenHash' in state.sessions[0], false)
  await persistence.recordLoginEvent('account-one', { ip: '127.0.0.1', userAgent: 'check-agent' }, true)
  assert.equal((await persistence.getAuthenticationState({ limit: 100 })).loginHistory.length, 1)
  await persistence.revokeSessionByToken(issued.token)
  assert.equal(await persistence.resolvePersistentSession(issued.token), null)
  const second = await persistence.issuePersistentSession(account, {})
  const revoked = await persistence.revokeAccountSessions('account-one')
  assert.ok(revoked.revoked >= 1)
  assert.equal(await persistence.resolvePersistentSession(second.token), null)

  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(start, /createClientAccount/)
  assert.match(start, /updateClientAccount/)
  assert.match(start, /createAuthenticationAdminRouter/)
  assert.match(start, /createPasswordResetPublicRouter/)
  assert.match(start, /requireAuthenticationSession/)
  const service = await fs.readFile(path.join(root, 'server/services/authenticationService.js'), 'utf8')
  assert.match(service, /issuePersistentSession/)
  assert.match(service, /recordCredentialFailure/)
  assert.match(service, /revokeAccountSessions/)
  console.log('Persistent authentication checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
