import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-api-keys-'))
process.chdir(temporary)
try {
  const serviceFile = path.join(root, 'server/services/apiKeyService.js')
  const apiKeys = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)
  const owner = { id: 'owner-check', email: 'owner@example.test', role: 'owner' }

  const created = await apiKeys.createApiKey({
    id: 'integration-key', name: 'Integration Key', scopes: ['content', 'assets'], websiteIds: ['site-one'],
    environment: 'development', readOnly: true,
    restrictions: { allowedIps: ['127.0.0.1', '10.0.0.0/8'], allowedOrigins: ['https://example.test'], allowedUserAgents: ['KSJ-Test'], maximumRequests: 5 },
  }, owner)
  assert.match(created.secret, /^ksj_integration-key_/)
  assert.equal(created.key.secretHash, undefined)

  const state = await apiKeys.getApiKeyState({ limit: 100 })
  assert.equal(state.keys.length, 1)
  assert.equal(state.keys[0].secretHash, undefined)
  assert.deepEqual(state.keys[0].scopes, ['content', 'assets'])

  const authenticated = await apiKeys.authenticateApiKey(created.secret, {
    scope: 'content', websiteId: 'site-one', environment: 'development', write: false,
    ip: '127.0.0.1', origin: 'https://example.test', userAgent: 'KSJ-Test/1.0',
  })
  assert.equal(authenticated.id, 'integration-key')
  assert.equal(authenticated.usageCount, 1)

  let denied
  try {
    await apiKeys.authenticateApiKey(created.secret, {
      scope: 'content', websiteId: 'site-one', environment: 'development', write: true,
      ip: '127.0.0.1', origin: 'https://example.test', userAgent: 'KSJ-Test/1.0',
    })
  } catch (error) { denied = error }
  assert.equal(denied?.status, 403)

  const rotated = await apiKeys.rotateApiKey('integration-key', { transitionSeconds: 0 }, owner)
  assert.notEqual(rotated.key.id, 'integration-key')
  assert.ok(rotated.secret)
  const afterRotation = await apiKeys.getApiKeyState({ limit: 100 })
  assert.equal(afterRotation.keys.find(item => item.id === 'integration-key').effectiveStatus, 'superseded')
  assert.equal(afterRotation.statistics.rotated, 1)

  const revoked = await apiKeys.revokeApiKey(rotated.key.id, { reason: 'Validation complete' }, owner)
  assert.equal(revoked.status, 'revoked')

  let revokedError
  try {
    await apiKeys.authenticateApiKey(rotated.secret, {
      scope: 'content', websiteId: 'site-one', environment: 'development', write: false,
      ip: '127.0.0.1', origin: 'https://example.test', userAgent: 'KSJ-Test/1.0',
    })
  } catch (error) { revokedError = error }
  assert.equal(revokedError?.status, 403)

  const finalState = await apiKeys.getApiKeyState({ limit: 100 })
  assert.ok(finalState.statistics.authenticated >= 1)
  assert.ok(finalState.statistics.failed >= 2)
  assert.ok(finalState.history.some(item => item.action === 'api-key.rotated'))
  assert.ok(finalState.history.some(item => item.action === 'api-key.revoked'))

  const router = await fs.readFile(path.join(root, 'server/apiKeyRouter.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(router, /Owner permission required/)
  assert.match(router, /rotate/)
  assert.match(router, /revoke/)
  assert.match(start, /createApiKeyRouter/)
  assert.match(start, /\/api\/api-keys/)

  console.log('API key lifecycle checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
