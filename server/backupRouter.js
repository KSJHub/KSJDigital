import express from 'express'
import {
  createBackup,
  deleteBackup,
  listBackups,
  previewRestore,
  pruneBackups,
  restoreBackup,
  updateBackupSettings,
  verifyBackup,
} from './services/backupService.js'

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}
function sendError(res, error) {
  const body = { error: error.message || 'Backup request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createBackupRouter() {
  const router = express.Router()
  router.use((req, res, next) => requireOwner(req, res) && next())
  router.get('/', async (_req, res) => { try { res.json(await listBackups()) } catch (error) { sendError(res, error) } })
  router.post('/', async (req, res) => { try { res.status(201).json(await createBackup(req.body || {})) } catch (error) { sendError(res, error) } })
  router.post('/prune', async (_req, res) => { try { res.json(await pruneBackups()) } catch (error) { sendError(res, error) } })
  router.patch('/settings', async (req, res) => { try { res.json(await updateBackupSettings(req.body || {})) } catch (error) { sendError(res, error) } })
  router.get('/:backupId/verify', async (req, res) => { try { res.json(await verifyBackup(req.params.backupId)) } catch (error) { sendError(res, error) } })
  router.post('/:backupId/restore-preview', async (req, res) => { try { res.json(await previewRestore(req.params.backupId, req.body || {})) } catch (error) { sendError(res, error) } })
  router.post('/:backupId/restore', async (req, res) => { try { res.json(await restoreBackup(req.params.backupId, req.body || {})) } catch (error) { sendError(res, error) } })
  router.delete('/:backupId', async (req, res) => { try { res.json(await deleteBackup(req.params.backupId)) } catch (error) { sendError(res, error) } })
  return router
}
