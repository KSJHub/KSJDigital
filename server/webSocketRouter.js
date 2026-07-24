import express from 'express'
import { getWebSocketEventBridgeState } from './services/webSocketEventBridgeService.js'
import { disconnectWebSocketConnection, getWebSocketConnections, getWebSocketGatewayState } from './services/webSocketService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner access required' })
  return false
}

export function createWebSocketRouter() {
  const router = express.Router()
  router.get('/status', (req, res) => {
    if (!requireOwner(req, res)) return
    res.json({ gateway: getWebSocketGatewayState(), eventBridge: getWebSocketEventBridgeState() })
  })
  router.get('/connections', (req, res) => {
    if (!requireOwner(req, res)) return
    res.json(getWebSocketConnections())
  })
  router.delete('/connections/:connectionId', (req, res) => {
    if (!requireOwner(req, res)) return
    const disconnected = disconnectWebSocketConnection(req.params.connectionId, req.body?.reason)
    if (!disconnected) return res.status(404).json({ error: 'WebSocket connection not found' })
    res.json({ disconnected: true, connectionId: req.params.connectionId })
  })
  return router
}
