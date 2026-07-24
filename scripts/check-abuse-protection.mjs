import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-abuse-protection-'))
process.chdir(temporary)
try {
  const serviceFile = path.join(root, 'server/services/abuseProtectionService.js')
  const service = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)

  const policy = await service.upsertAbusePolicy({
    id: 'login-account',
    name: 'Login account protection',
    route: '/api/login',
    methods: ['POST'],
    subjectTypes: ['account'],
    windowMs: 60_000,
    maximum: 2,
    blockMs: 60_000,
    priority: 100,
  }, { id: 'check' })
  assert.equal(policy.maximum, 2)

  const context = { route: '/api/login', method: 'POST', accountId: 'member@example.com' }
  assert.equal((await service.evaluateAbuseRequest(context)).allowed, true)
  assert.equal((await service.evaluateAbuseRequest(context)).allowed, true)
  const blocked = await service.evaluateAbuseRequest(context)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.reason, 'rate-limit-exceeded')
  assert.equal(blocked.status, 429)

  const override = await service.setAbuseOverride({ subjectType: 'account', subjectId: 'member@example.com', policyId: policy.id, mode: 'allow', reason: 'Validation override' }, { id: 'check' })
  assert.ok(override.id)
  const allowed = await service.evaluateAbuseRequest(context)
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.decisions.some(item => item.reason === 'allow-override'), true)

  const blockOverride = await service.setAbuseOverride({ subjectType: 'api-key', subjectId: 'key-one', mode: 'block' }, { id: 'check' })
  const keyBlocked = await service.evaluateAbuseRequest({ route: '/api/anything', method: 'GET', apiKeyId: 'key-one' })
  assert.equal(keyBlocked.allowed, true, 'A block override only applies when a matching policy includes the subject type')
  await service.removeAbuseOverride(blockOverride.id, { id: 'check' })

  await service.updateTrustedProxies(['127.0.0.1', '::1'], { id: 'check' })
  const forwarded = service.resolveClientIp({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '203.0.113.10, 127.0.0.1' } }, ['127.0.0.1'])
  assert.equal(forwarded, '203.0.113.10')
  const untrusted = service.resolveClientIp({ socket: { remoteAddress: '198.51.100.2' }, headers: { 'x-forwarded-for': '203.0.113.10' } }, ['127.0.0.1'])
  assert.equal(untrusted, '198.51.100.2')

  const state = await service.getAbuseProtectionState({ limit: 100 })
  assert.equal(state.policies.some(item => item.id === policy.id), true)
  assert.equal(state.blocks.length >= 1, true)
  assert.equal(state.activeCounterCount >= 1, true)
  assert.equal(Object.hasOwn(state, 'counters'), true)
  assert.equal(state.counters, undefined)
  assert.equal(state.history.some(item => item.action === 'abuse-request.blocked'), true)

  const routerSource = await fs.readFile(path.join(root, 'server/abuseProtectionRouter.js'), 'utf8')
  const startSource = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(routerSource, /Owner permission required/)
  assert.match(routerSource, /trusted-proxies/)
  assert.match(startSource, /createAbuseProtectionMiddleware\(\)/)
  assert.match(startSource, /\/api\/abuse-protection/)

  console.log('Request throttling and abuse protection checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
