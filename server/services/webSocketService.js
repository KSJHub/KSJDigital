import crypto from 'node:crypto'
import { findAuthenticationSession } from './authenticationService.js'

const connections = new Map()
let gateway = null

export class WebSocketGatewayError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'WebSocketGatewayError'; this.status = status }
}

function nowIso() { return new Date().toISOString() }
function socketKey(request) { return String(request.headers['sec-websocket-key'] || '').trim() }
function acceptKey(key) { return crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64') }
function accountChannels(account) {
  const channels = new Set([`account:${account.id}`])
  for (const websiteId of account.websiteIds || (account.websiteId ? [account.websiteId] : [])) channels.add(`website:${websiteId}`)
  return channels
}
function canSubscribe(account, channel) {
  if (typeof channel !== 'string' || channel.length < 3 || channel.length > 250) return false
  if (account.role === 'owner') return /^(account|website|event|system):[a-zA-Z0-9._-]+$/.test(channel)
  return accountChannels(account).has(channel)
}
function sendHttpError(socket, status, message) {
  const labels = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable' }
  const body = JSON.stringify({ error: message })
  socket.end(`HTTP/1.1 ${status} ${labels[status] || 'Error'}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

export function encodeWebSocketFrame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload))
  if (body.length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, body.length]), body])
  if (body.length <= 0xffff) { const header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(body.length, 2); return Buffer.concat([header, body]) }
  const header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(body.length), 2); return Buffer.concat([header, body])
}

export function decodeWebSocketFrames(buffer, maximumPayloadBytes = 65536) {
  const frames = []
  let offset = 0
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset]; const second = buffer[offset + 1]
    const final = Boolean(first & 0x80); const opcode = first & 0x0f; const masked = Boolean(second & 0x80)
    let length = second & 0x7f; let headerLength = 2
    if (!final) throw new WebSocketGatewayError('Fragmented frames are not supported', 1003)
    if (!masked) throw new WebSocketGatewayError('Client frames must be masked', 1002)
    if (length === 126) { if (offset + 4 > buffer.length) break; length = buffer.readUInt16BE(offset + 2); headerLength = 4 }
    if (length === 127) { if (offset + 10 > buffer.length) break; const large = buffer.readBigUInt64BE(offset + 2); if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new WebSocketGatewayError('Frame is too large', 1009); length = Number(large); headerLength = 10 }
    if (length > maximumPayloadBytes) throw new WebSocketGatewayError('Frame exceeds the payload limit', 1009)
    const frameLength = headerLength + 4 + length
    if (offset + frameLength > buffer.length) break
    const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4)
    const payload = Buffer.from(buffer.subarray(offset + headerLength + 4, offset + frameLength))
    for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
    frames.push({ opcode, payload })
    offset += frameLength
  }
  return { frames, remainder: buffer.subarray(offset) }
}

function sendFrame(connection, opcode, payload) {
  if (connection.closed || connection.socket.destroyed) return false
  if (connection.socket.writableLength > gateway.options.maximumBufferedBytes) { closeConnection(connection, 1013, 'Back-pressure limit exceeded'); return false }
  connection.socket.write(encodeWebSocketFrame(opcode, payload)); return true
}
function sendJson(connection, value) { return sendFrame(connection, 0x1, JSON.stringify(value)) }
function closeConnection(connection, code = 1000, reason = '') {
  if (!connection || connection.closed) return
  connection.closed = true
  const reasonBuffer = Buffer.from(String(reason).slice(0, 123)); const payload = Buffer.alloc(2 + reasonBuffer.length); payload.writeUInt16BE(code, 0); reasonBuffer.copy(payload, 2)
  try { connection.socket.write(encodeWebSocketFrame(0x8, payload)) } catch { /* Socket may already be closed. */ }
  connection.socket.end(); connections.delete(connection.id)
}
function handleMessage(connection, payload) {
  let message
  try { message = JSON.parse(payload.toString('utf8')) } catch { return sendJson(connection, { type: 'error', invalidJson: true }) }
  if (message.type === 'ping') return sendJson(connection, { type: 'pong' })
  if (message.type === 'subscribe') {
    const channel = String(message.channel || '')
    if (!canSubscribe(connection.account, channel)) return sendJson(connection, { type: 'error', accessDenied: true })
    const changed = !connection.channels.has(channel)
    if (changed) connection.channels.add(channel)
    return sendJson(connection, { type: 'subscribed', changed, channelCount: connection.channels.size })
  }
  if (message.type === 'unsubscribe') {
    const channel = String(message.channel || '')
    const changed = connection.channels.delete(channel)
    return sendJson(connection, { type: 'unsubscribed', changed, channelCount: connection.channels.size })
  }
  return sendJson(connection, { type: 'error', unsupportedMessage: true })
}
function handleData(connection, chunk) {
  connection.buffer = Buffer.concat([connection.buffer, chunk])
  let decoded
  try { decoded = decodeWebSocketFrames(connection.buffer, gateway.options.maximumPayloadBytes) } catch (error) { closeConnection(connection, Number(error.status || 1002), error.message); return }
  connection.buffer = decoded.remainder
  for (const frame of decoded.frames) {
    connection.lastSeenAt = nowIso()
    if (frame.opcode === 0x8) return closeConnection(connection)
    if (frame.opcode === 0x9) sendFrame(connection, 0xA, frame.payload)
    else if (frame.opcode === 0xA) connection.awaitingPong = false
    else if (frame.opcode === 0x1) handleMessage(connection, frame.payload)
    else closeConnection(connection, 1003, 'Unsupported frame type')
  }
}
async function handleUpgrade(request, socket, head) {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  if (pathname !== gateway.options.path) return sendHttpError(socket, 404, 'WebSocket endpoint not found')
  if (connections.size >= gateway.options.maximumConnections) return sendHttpError(socket, 503, 'WebSocket connection limit reached')
  const key = socketKey(request)
  const connectionHeaders = String(request.headers.connection || '').toLowerCase().split(',').map(value => value.trim())
  if (String(request.headers.upgrade || '').toLowerCase() !== 'websocket' || !connectionHeaders.includes('upgrade') || request.headers['sec-websocket-version'] !== '13' || !key) return sendHttpError(socket, 400, 'Invalid WebSocket upgrade request')
  const session = await findAuthenticationSession(request)
  if (!session) return sendHttpError(socket, 401, 'Authentication required')
  const account = session.account
  const accountCount = [...connections.values()].filter(item => item.account.id === account.id).length
  if (accountCount >= gateway.options.maximumConnectionsPerAccount) return sendHttpError(socket, 429, 'Account WebSocket connection limit reached')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`)
  const connection = { id: crypto.randomUUID(), socket, account, sessionId: session.id, channels: accountChannels(account), connectedAt: nowIso(), lastSeenAt: nowIso(), awaitingPong: false, buffer: Buffer.alloc(0), closed: false }
  connections.set(connection.id, connection)
  socket.on('data', chunk => handleData(connection, chunk)); socket.on('error', () => closeConnection(connection, 1011, 'Socket error')); socket.on('end', () => closeConnection(connection)); socket.on('close', () => { connection.closed = true; connections.delete(connection.id) })
  if (head?.length) handleData(connection, head)
  sendJson(connection, { type: 'connected', channelCount: connection.channels.size, heartbeatIntervalMs: gateway.options.heartbeatIntervalMs })
}
function heartbeat() {
  const now = Date.now()
  for (const connection of connections.values()) {
    if (connection.awaitingPong && now - new Date(connection.lastSeenAt).getTime() >= gateway.options.idleTimeoutMs) { closeConnection(connection, 1001, 'Heartbeat timeout'); continue }
    connection.awaitingPong = true; sendFrame(connection, 0x9, Buffer.from(String(now)))
  }
}

export function startWebSocketGateway(server, options = {}) {
  if (gateway) throw new WebSocketGatewayError('WebSocket gateway is already running', 409)
  const resolved = { path: '/ws', heartbeatIntervalMs: 30000, idleTimeoutMs: 90000, maximumConnections: 1000, maximumConnectionsPerAccount: 10, maximumPayloadBytes: 65536, maximumBufferedBytes: 1048576, ...options }
  const upgradeHandler = (request, socket, head) => { handleUpgrade(request, socket, head).catch(() => sendHttpError(socket, 500, 'WebSocket upgrade failed')) }
  server.on('upgrade', upgradeHandler)
  const timer = setInterval(heartbeat, resolved.heartbeatIntervalMs); timer.unref?.()
  gateway = { server, options: resolved, upgradeHandler, timer, startedAt: nowIso() }
  return getWebSocketGatewayState()
}
export function stopWebSocketGateway() {
  if (!gateway) return { stopped: false }
  clearInterval(gateway.timer); gateway.server.off('upgrade', gateway.upgradeHandler)
  for (const connection of [...connections.values()]) closeConnection(connection, 1001, 'Gateway shutdown')
  gateway = null; return { stopped: true }
}
export function broadcastWebSocketEvent(channel, event, payload = null) {
  const message = { type: 'event', event: String(event || ''), payload }
  let delivered = 0
  for (const connection of connections.values()) if (connection.channels.has(channel) && sendJson(connection, message)) delivered += 1
  return { delivered }
}
export function disconnectWebSocketConnection(connectionId, reason = 'Administrative disconnect') { const connection = connections.get(connectionId); if (!connection) return false; closeConnection(connection, 1001, reason); return true }
export function getWebSocketConnections() { return [...connections.values()].map(item => ({ id: item.id, role: item.account.role, channelCount: item.channels.size, connectedAt: item.connectedAt, lastSeenAt: item.lastSeenAt, bufferedBytes: item.socket.writableLength || 0 })) }
export function getWebSocketGatewayState() {
  const counts = [...connections.values()].reduce((map, item) => map.set(item.account.id, (map.get(item.account.id) || 0) + 1), new Map())
  return { running: Boolean(gateway), path: gateway?.options.path || '/ws', startedAt: gateway?.startedAt || null, connectionCount: connections.size, activeAccountCount: counts.size, maximumConnectionsForSingleAccount: Math.max(0, ...counts.values()), limits: gateway ? { maximumConnections: gateway.options.maximumConnections, maximumConnectionsPerAccount: gateway.options.maximumConnectionsPerAccount, maximumPayloadBytes: gateway.options.maximumPayloadBytes, maximumBufferedBytes: gateway.options.maximumBufferedBytes } : null }
}
