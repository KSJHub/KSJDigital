import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-service-accounts-'))
process.chdir(temporary)

try {
  const service = await import(path.join(root, 'server/services/serviceAccountService.js'))

  const account = await service.upsertServiceAccount({ id: 'deployment-bot', name: 'Deployment bot' }, { id: 'check' })
  assert.equal(account.enabled, true)

  const issued = await service.issueApiKey(account.id, {
    name: 'Primary key',
    scopes: ['content:read', 'content:write'],
    rateLimit: { windowMs: 60_000, maximum: 3 },
  }, { id: 'check' })
  assert.match(issued.token, /^ksj_[a-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.equal(Object.hasOwn(issued.key, 'secretHash'), false)

  const authenticated = await service.authenticateApiKey(issued.token, { scope: 'content:read', resource: '/api/content' })
  assert.equal(authenticated.account.id, account.id)
  assert.equal(authenticated.key.usageCount, 1)

  await assert.rejects(
    () => service.authenticateApiKey(issued.token, { scope: 'releases:write' }),
    error => error.status === 403,
  )
  await assert.rejects(
    () => service.authenticateApiKey(`${issued.token}invalid`, { scope: 'content:read' }),
    error => error.status === 401,
  )

  const rotated = await service.rotateApiKey(issued.key.id, { expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, { id: 'check' })
  assert.notEqual(rotated.key.id, issued.key.id)
  await assert.rejects(() => service.authenticateApiKey(issued.token, { scope: 'content:read' }), error => error.status === 401)
  const rotatedAuth = await service.authenticateApiKey(rotated.token, { scope: 'content:write' })
  assert.equal(rotatedAuth.key.id, rotated.key.id)

  await service.revokeApiKey(rotated.key.id, { id: 'check' }, 'validation')
  await assert.rejects(() => service.authenticateApiKey(rotated.token, { scope: 'content:read' }), error => error.status === 401)

  const state = await service.getServiceAccountState({ limit: 100 })
  assert.equal(state.accounts.length, 1)
  assert.equal(state.keys.length, 2)
  assert(state.history.some(item => item.action === 'api-key.issued'))
  assert(state.history.some(item => item.action === 'api-key.revoked'))
  assert.equal(state.usage.length, 2)
  assert(state.keys.every(key => !Object.hasOwn(key, 'secretHash') && !Object.hasOwn(key, 'salt')))

  const routerSource = await fs.readFile(path.join(root, 'server/serviceAccountRouter.js'), 'utf8')
  const startSource = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(routerSource, /Owner permission required/)
  assert.match(routerSource, /\/keys\/:keyId\/rotate/)
  assert.match(startSource, /createServiceAccountRouter/)
  assert.match(startSource, /\/api\/service-accounts/)

  console.log('Service account and API key checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
