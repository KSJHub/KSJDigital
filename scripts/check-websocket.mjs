import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  decodeWebSocketFrames,
  encodeWebSocketFrame,
  getWebSocketGatewayState,
} from '../server/services/webSocketService.js'

function maskedTextFrame(text) {
  const payload = Buffer.from(text)
  const mask = Buffer.from([1, 2, 3, 4])
  const header = Buffer.from([0x81, 0x80 | payload.length])
  const encoded = Buffer.from(payload)
  for (let index = 0; index < encoded.length; index += 1) encoded[index] ^= mask[index % 4]
  return Buffer.concat([header, mask, encoded])
}

const encoded = encodeWebSocketFrame(0x1, 'gateway-check')
assert.equal(encoded[0], 0x81)
assert.equal(encoded.subarray(2).toString(), 'gateway-check')

const decoded = decodeWebSocketFrames(maskedTextFrame('{"type":"ping"}'))
assert.equal(decoded.frames.length, 1)
assert.equal(decoded.frames[0].payload.toString(), '{"type":"ping"}')
assert.equal(decoded.remainder.length, 0)
assert.equal(getWebSocketGatewayState().running, false)

const root = process.cwd()
const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
const router = await fs.readFile(path.join(root, 'server/webSocketRouter.js'), 'utf8')
const service = await fs.readFile(path.join(root, 'server/services/webSocketService.js'), 'utf8')

assert.match(start, /createServer\(this\)/)
assert.match(start, /startWebSocketGateway\(server\)/)
assert.match(start, /createWebSocketRouter/)
assert.match(start, /express\.application\.listen/)
assert.match(router, /\/connections/)
assert.match(service, /findAuthenticationSession/)
assert.match(service, /heartbeatIntervalMs/)
assert.match(service, /maximumBufferedBytes/)
assert.match(service, /broadcastWebSocketEvent/)
assert.match(service, /type: 'connected', channelCount:/)
assert.match(service, /type: 'subscribed', changed, channelCount:/)
assert.match(service, /type: 'unsubscribed', changed, channelCount:/)
assert.match(service, /activeAccountCount:/)
assert.match(service, /maximumConnectionsForSingleAccount:/)

const connectedMessage = service.slice(service.indexOf("sendJson(connection, { type: 'connected'"), service.indexOf('\n}', service.indexOf("sendJson(connection, { type: 'connected'")))
for (const forbidden of ['connectionId:', 'channels:', 'sessionId:', 'accountId:', 'accountName:', 'connectedAt:', 'lastSeenAt:']) {
  assert.ok(!connectedMessage.includes(forbidden), `Connected WebSocket acknowledgement exposes ${forbidden}`)
}

const broadcastStart = service.indexOf('export function broadcastWebSocketEvent(')
const broadcastEnd = service.indexOf('\nexport function disconnectWebSocketConnection', broadcastStart)
const broadcast = service.slice(broadcastStart, broadcastEnd)
for (const forbidden of ['channel, event', 'channel:', 'publishedAt:', 'connectionId:', 'sessionId:', 'accountId:']) {
  if (forbidden === 'channel, event') continue
  assert.ok(!broadcast.includes(forbidden), `WebSocket broadcast envelope exposes ${forbidden}`)
}
assert.match(broadcast, /const message = \{ type: 'event', event: String\(event \|\| ''\), payload \}/)
assert.match(broadcast, /return \{ delivered \}/)

const connectionListStart = service.indexOf('export function getWebSocketConnections()')
const connectionListEnd = service.indexOf('\nexport function getWebSocketGatewayState()', connectionListStart)
const connectionList = service.slice(connectionListStart, connectionListEnd)
for (const forbidden of ['accountId:', 'accountName:', 'sessionId:', 'channels:']) {
  assert.ok(!connectionList.includes(forbidden), `Administrative WebSocket connection list exposes ${forbidden}`)
}

console.log('WebSocket gateway checks passed')
