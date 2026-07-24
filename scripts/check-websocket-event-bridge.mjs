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

  const source = await fs.readFile(path.join(root, 'server/services/webSocketEventBridgeService.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  const router = await fs.readFile(path.join(root, 'server/webSocketRouter.js'), 'utf8')
  assert.match(source, /registerEventHandler\(HANDLER_NAME, deliverEvent\)/)
  assert.match(source, /topicPattern: '\*\*'/)
  assert.match(source, /broadcastWebSocketEvent/)
  assert.match(source, /maximumAttempts: 10/)
  assert.match(start, /await startWebSocketEventBridge\(\)/)
  assert.ok(start.indexOf('await startWebSocketEventBridge()') < start.indexOf('startEventBusWorker()'))
  assert.match(router, /getWebSocketEventBridgeState/)
  console.log('WebSocket Event Bus bridge checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
