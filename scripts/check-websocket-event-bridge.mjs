import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-websocket-events-'))
process.chdir(temporary)
try {
  const bridge = await import(`${pathToFileURL(path.join(root, 'server/services/webSocketEventBridgeService.js')).href}?check=${Date.now()}`)
  const channels = bridge.resolveWebSocketEventChannels({
    topic: 'notification.created',
    payload: { accountId: 'account-1', websiteId: 'site-1' },
    headers: { webSocketChannels: ['system:alerts', 'website:site-2', 'invalid channel'] },
  })
  assert.deepEqual(channels, ['event:notification.created', 'account:account-1', 'website:site-1', 'system:alerts', 'website:site-2'])
  assert.deepEqual(bridge.resolveWebSocketEventChannels({ topic: 'system.health', payload: { accountId: '../unsafe', websiteId: '' }, headers: {} }), ['event:system.health'])
  assert.deepEqual(bridge.aggregateRealtimePayload({ count: 4, enabled: true, status: 'active', accountId: 'account-1', nested: { value: 1 }, values: [1, 2, 3], labels: ['a'] }), { count: 4, enabled: true, values: [1, 2, 3] })

  const source = await fs.readFile(path.join(root, 'server/services/webSocketEventBridgeService.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  const router = await fs.readFile(path.join(root, 'server/webSocketRouter.js'), 'utf8')
  assert.match(source, /registerEventHandler\(HANDLER_NAME, deliverEvent\)/)
  assert.match(source, /topicPattern: '\*\*'/)
  assert.match(source, /broadcastWebSocketEvent/)
  assert.match(source, /maximumAttempts: 10/)
  assert.match(source, /aggregateRealtimePayload\(event\?\.payload\)/)
  assert.match(source, /if \(!subscriptionMatches\(existing\)\) await upsertSubscription\(SUBSCRIPTION, null\)/)
  assert.match(source, /if \(!bridgeState\.running\) return getWebSocketEventBridgeState\(\)/)
  assert.match(start, /await startWebSocketEventBridge\(\)/)
  assert.ok(start.indexOf('await startWebSocketEventBridge()') < start.indexOf('startEventBusWorker()'))
  assert.match(router, /getWebSocketEventBridgeState/)

  const deliveryStart = source.indexOf('async function deliverEvent(')
  const deliveryEnd = source.indexOf('\n}\n\nexport async function startWebSocketEventBridge', deliveryStart)
  const delivery = source.slice(deliveryStart, deliveryEnd)
  for (const forbidden of [
    'eventId:', 'headers:', 'correlationId:', 'causationId:', 'source:', 'publishedAt:',
    'accountId:', 'websiteId:', 'actor:', 'session:', 'email:', 'error.message', 'String(error',
  ]) {
    assert.ok(!delivery.includes(forbidden), `WebSocket bridge delivery exposes ${forbidden}`)
  }
  assert.match(delivery, /lastError: 'delivery-failed'/)

  const stateStart = source.indexOf('export function getWebSocketEventBridgeState()')
  const state = source.slice(stateStart)
  assert.ok(!state.includes('subscriptionId:'), 'WebSocket bridge state exposes its subscription identifier')
  assert.ok(!state.includes('handlerName:'), 'WebSocket bridge state exposes its handler identifier')
  console.log('WebSocket Event Bus bridge checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
