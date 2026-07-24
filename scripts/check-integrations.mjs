import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-integrations-'))
process.env.DATA_DIR = root

const service = await import('../server/services/integrationService.js')
const routerSource = await fs.readFile(new URL('../server/integrationRouter.js', import.meta.url), 'utf8')
const startSource = await fs.readFile(new URL('../server/start.js', import.meta.url), 'utf8')

assert.equal(service.listIntegrationProviders().some(item => item.id === 'webhook'), true)
assert.match(routerSource, /createIntegrationEventCaptureMiddleware/)
assert.match(routerSource, /\/providers/)
assert.match(routerSource, /\/deliveries\/\:deliveryId\/retry/)
assert.match(startSource, /startIntegrationWorker\(\)/)
assert.match(startSource, /\/api\/integrations/)

const websiteId = `integration-check-${crypto.randomUUID()}`
const created = await service.upsertIntegration(websiteId, {
  name: 'Primary webhook',
  provider: 'webhook',
  url: 'https://example.com/webhook',
  events: ['content.*', 'asset-library.post'],
  secret: 'test-secret',
  maxAttempts: 3,
})
assert.equal(created.secret, '[configured]')
assert.deepEqual(created.events, ['content.*', 'asset-library.post'])

const queued = await service.publishIntegrationEvent(websiteId, 'content.patch', { id: 'record-1' })
assert.equal(queued.queued, 1)

const deliveries = await service.searchIntegrationDeliveries(websiteId, { event: 'content.patch' })
assert.equal(deliveries.total, 1)
assert.equal(deliveries.results[0].status, 'pending')

const retried = await service.retryIntegrationDelivery(websiteId, deliveries.results[0].id)
assert.equal(retried.status, 'pending')
assert.equal(retried.attempts, 0)

await service.updateIntegrationSettings(websiteId, { deliveryRetentionDays: 30, workerIntervalMs: 5000 })
const registry = await service.getIntegrationRegistry(websiteId)
assert.equal(registry.settings.deliveryRetentionDays, 30)
assert.equal(registry.subscriptions[0].secret, '[configured]')

await assert.rejects(
  () => service.upsertIntegration(websiteId, { name: 'Unsafe', url: 'http://localhost/hook', events: ['*'] }),
  /HTTPS|private network/,
)

await assert.rejects(
  () => service.upsertIntegration(websiteId, { name: 'No events', url: 'https://example.com/hook', events: [] }),
  /event subscription/,
)

const removed = await service.deleteIntegration(websiteId, created.id)
assert.equal(removed.deleted, true)

console.log('Integration engine checks passed')
