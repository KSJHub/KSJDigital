import express from 'express'
import {
  collectSystemHealth,
  getSystemHealthHistory,
  updateSystemHealthSettings,
  writeStructuredLog,
} from './services/systemHealthService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function sendError(res, error) {
  const body = { error: error.message || 'System health request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createSystemHealthRouter() {
  const router = express.Router()

  router.get('/', async (_req, res) => {
    try { res.json(await collectSystemHealth()) } catch (error) { sendError(res, error) }
  })

  router.get('/history', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await getSystemHealthHistory(req.query)) } catch (error) { sendError(res, error) }
  })

  router.patch('/settings', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await updateSystemHealthSettings(req.body || {})) } catch (error) { sendError(res, error) }
  })

  router.post('/logs', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.status(201).json(await writeStructuredLog(req.body?.level, req.body?.message, req.body?.context || {})) } catch (error) { sendError(res, error) }
  })

  return router
}
