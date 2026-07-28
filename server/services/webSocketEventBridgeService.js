import { getEventBusState, registerEventHandler, upsertSubscription } from './eventBusService.js'
import { broadcastWebSocketEvent } from './webSocketService.js'

const SUBSCRIPTION_ID = 'websocket-realtime-delivery'
const HANDLER_NAME = 'websocket.broadcast'
const SUBSCRIPTION = { id: SUBSCRIPTION_ID, name: 'WebSocket real-time delivery', topicPattern: '**', handler: HANDLER_NAME, enabled: true, retry: { maximumAttempts: 10, baseDelayMs: 500, maximumDelayMs: 30000 }, metadata: { system: true, transport: 'websocket' } }
let unregisterHandler = null
let bridgeState = { running: false, startedAt: null, deliveredEvents: 0, deliveredMessages: 0, lastEventAt: null, lastError: null }

function nowIso() { return new Date().toISOString() }
function normaliseIdentifier(value) { const result = String(value || '').trim(); return /^[a-zA-Z0-9._-]{1,200}$/.test(result) ? result : null }
function explicitChannels(event) {
  const values = event?.headers?.webSocketChannels
  if (!Array.isArray(values)) return []
  return values.map(value => String(value || '').trim()).filter(value => /^(account|website|event|system):[a-zA-Z0-9._-]+$/.test(value)).slice(0, 50)
}
function eventChannels(event) {
  const channels = new Set([`event:${event.topic}`])
  const payload = event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload : {}
  const accountId = normaliseIdentifier(payload.accountId || payload.actorAccountId || event?.headers?.accountId)
  const websiteId = normaliseIdentifier(payload.websiteId || event?.headers?.websiteId)
  if (accountId) channels.add(`account:${accountId}`)
  if (websiteId) channels.add(`website:${websiteId}`)
  for (const channel of explicitChannels(event)) channels.add(channel)
  return [...channels]
}

function aggregateRealtimePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) result[key] = item
    else if (Array.isArray(item) && item.every(entry => typeof entry === 'boolean' || (typeof entry === 'number' && Number.isFinite(entry)))) result[key] = [...item]
  }
  return result
}

function subscriptionMatches(existing) {
  return existing
    && existing.name === SUBSCRIPTION.name
    && existing.topicPattern === SUBSCRIPTION.topicPattern
    && existing.handler === SUBSCRIPTION.handler
    && existing.enabled !== false
    && JSON.stringify(existing.retry || {}) === JSON.stringify(SUBSCRIPTION.retry)
    && JSON.stringify(existing.metadata || {}) === JSON.stringify(SUBSCRIPTION.metadata)
}

async function deliverEvent(event) {
  try {
    let delivered = 0
    const payload = aggregateRealtimePayload(event?.payload)
    for (const channel of eventChannels(event)) delivered += broadcastWebSocketEvent(channel, event.topic, payload).delivered
    bridgeState = { ...bridgeState, deliveredEvents: bridgeState.deliveredEvents + 1, deliveredMessages: bridgeState.deliveredMessages + delivered, lastEventAt: nowIso(), lastError: null }
  } catch (error) {
    bridgeState = { ...bridgeState, lastError: 'delivery-failed', lastEventAt: nowIso() }
    throw error
  }
}

export async function startWebSocketEventBridge() {
  if (bridgeState.running) return getWebSocketEventBridgeState()
  unregisterHandler = registerEventHandler(HANDLER_NAME, deliverEvent)
  const state = await getEventBusState({ limit: 1 })
  const existing = state.subscriptions.find(item => item.id === SUBSCRIPTION_ID)
  if (!subscriptionMatches(existing)) await upsertSubscription(SUBSCRIPTION, null)
  bridgeState = { running: true, startedAt: nowIso(), deliveredEvents: 0, deliveredMessages: 0, lastEventAt: null, lastError: null }
  return getWebSocketEventBridgeState()
}

export function stopWebSocketEventBridge() {
  if (!bridgeState.running) return getWebSocketEventBridgeState()
  if (unregisterHandler) unregisterHandler()
  unregisterHandler = null
  bridgeState = { ...bridgeState, running: false }
  return getWebSocketEventBridgeState()
}

export function getWebSocketEventBridgeState() { return { ...bridgeState, subscriptionConfigured: true, handlerRegistered: Boolean(unregisterHandler) } }
export { aggregateRealtimePayload, eventChannels as resolveWebSocketEventChannels }
