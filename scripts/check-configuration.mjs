import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-configuration-check-'))
process.chdir(root)
process.env.CONFIGURATION_MASTER_KEY = 'configuration-check-master-key-32-characters'

const service = await import('../server/services/configurationService.js')

const initial = await service.getConfiguration('development')
assert.equal(initial.environment, 'development')
assert.equal(initial.values['backup.enabled'], true)

const updated = await service.updateConfiguration('development', { values: { 'runtime.logLevel': 'warn', 'backup.intervalMs': 7200000 } }, { id: 'check' })
assert.equal(updated.values['runtime.logLevel'], 'warn')
assert.equal(updated.values['backup.intervalMs'], 7200000)

await service.setSecret('SESSION_SECRET', { source: 'stored', value: 'a-production-session-secret-value' }, { id: 'check' })
assert.equal(await service.resolveSecret('secret://SESSION_SECRET'), 'a-production-session-secret-value')

await service.setSecret('INTEGRATION_SIGNING_SECRET', { source: 'environment', environment: 'CHECK_INTEGRATION_SECRET' }, { id: 'check' })
process.env.CHECK_INTEGRATION_SECRET = 'integration-secret-from-environment'
assert.equal(await service.resolveSecret('secret://INTEGRATION_SIGNING_SECRET'), 'integration-secret-from-environment')

await assert.rejects(
  service.updateConfiguration('production', { values: { 'runtime.trustedOrigins': ['https://example.test/path'] } }),
  /origin-array schema/,
)
await assert.rejects(
  service.updateConfiguration('production', { values: { 'runtime.trustedOrigins': ['javascript:alert(1)'] } }),
  /origin-array schema/,
)

await service.updateConfiguration('production', { values: { 'runtime.publicUrl': 'https://example.test', 'runtime.trustedOrigins': ['http://example.test'] } })
const insecureReadiness = await service.deploymentReadiness('production')
assert.equal(insecureReadiness.ready, false)
assert.equal(insecureReadiness.checks.find(check => check.id === 'trusted-origins')?.status, 'failed')

await service.updateConfiguration('production', { values: { 'runtime.trustedOrigins': ['https://example.test', 'https://example.test'] } })
const validation = await service.validateConfiguration('production')
assert.equal(validation.valid, true)
const readiness = await service.deploymentReadiness('production')
assert.equal(readiness.ready, true)
const configured = await service.getConfiguration('production')
assert.deepEqual(configured.values['runtime.trustedOrigins'], ['https://example.test'])

const history = await service.configurationHistory({ limit: 20 })
assert.ok(history.some(item => item.action === 'configuration.updated'))
assert.ok(history.some(item => item.action === 'secret.updated'))

const registry = JSON.parse(await fs.readFile(path.join(root, 'server-data', 'configuration', 'registry.json'), 'utf8'))
assert.equal(JSON.stringify(registry).includes('a-production-session-secret-value'), false)
assert.equal(registry.secrets.SESSION_SECRET.encrypted.algorithm, 'aes-256-gcm')

const routerSource = await fs.readFile(new URL('../server/configurationRouter.js', import.meta.url), 'utf8')
assert.match(routerSource, /Owner permission required/)
assert.match(routerSource, /deployment-readiness/)
assert.match(routerSource, /restore|activate|secrets/)
assert.match(routerSource, /import \{ requireAssurance \} from '\.\/services\/mfaService\.js'/)
assert.match(routerSource, /const requireStepUp = requireAssurance\(2\)/)
for (const route of [
  "router.patch('/environments/:environment', requireStepUp",
  "router.post('/environments/:environment/activate', requireStepUp",
  "router.put('/secrets/:name', requireStepUp",
  "router.delete('/secrets/:name', requireStepUp",
]) assert.ok(routerSource.includes(route), `Configuration mutation is missing step-up protection: ${route}`)

console.log('Configuration and secrets management checks passed')
