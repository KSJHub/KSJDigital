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
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

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

function backupRegistryPayload(state = {}, subject = {}, details = {}) {
  const backups = Array.isArray(state.backups) ? state.backups : []
  const restores = Array.isArray(state.restores) ? state.restores : []
  return {
    backupCount: backups.length,
    availableBackupCount: backups.filter(item => item.status === 'available').length,
    restoreCount: restores.length,
    completedRestoreCount: restores.filter(item => item.status === 'completed').length,
    failedRestoreCount: restores.filter(item => item.status === 'failed').length,
    fileCount: Number(subject.fileCount ?? subject.checkedFiles ?? subject.restoredFileCount) || 0,
    errorCount: Number(subject.errorCount) || 0,
    removedCount: Number(subject.removed) || 0,
    remainingCount: Number(subject.remaining) || backups.length,
    includeAssets: subject.includeAssets === true,
    valid: subject.valid === true,
    enabled: state.settings?.enabled !== false,
    created: details.created === true,
    pruned: details.pruned === true,
    settingsChanged: details.settingsChanged === true,
    verified: details.verified === true,
    previewed: details.previewed === true,
    restored: details.restored === true,
    deleted: details.deleted === true,
  }
}

async function publishBackupRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function normaliseBackupSettings(input = {}, existing = {}) {
  const number = (key, min, max, fallback) => Math.min(max, Math.max(min, Number(input[key] ?? existing[key] ?? fallback)))
  return {
    enabled: input.enabled === undefined ? existing.enabled !== false : input.enabled === true,
    intervalMs: number('intervalMs', 60 * 60_000, 365 * 86_400_000, 24 * 60 * 60_000),
    retentionDays: number('retentionDays', 1, 3650, 30),
    maximumBackups: number('maximumBackups', 1, 365, 30),
    includeAssets: input.includeAssets === undefined ? existing.includeAssets !== false : input.includeAssets === true,
  }
}

export function createBackupRouter() {
  const router = express.Router()
  router.use((req, res, next) => requireOwner(req, res) && next())

  router.get('/', async (_req, res) => {
    try { res.json(await listBackups()) } catch (error) { sendError(res, error) }
  })

  router.post('/', async (req, res) => {
    try {
      const backup = await createBackup(req.body || {})
      const state = await listBackups()
      await publishBackupRealtimeEvent('backup.created', backupRegistryPayload(state, backup, { created: true }))
      res.status(201).json(backup)
    } catch (error) { sendError(res, error) }
  })

  router.post('/prune', async (_req, res) => {
    try {
      const result = await pruneBackups()
      if (result.removed === 0) return res.json(result)
      const state = await listBackups()
      await publishBackupRealtimeEvent('backup.pruned', backupRegistryPayload(state, result, { pruned: true }))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  router.patch('/settings', async (req, res) => {
    try {
      const state = await listBackups()
      const requested = normaliseBackupSettings(req.body || {}, state.settings || {})
      if (JSON.stringify(requested) === JSON.stringify(state.settings || {})) return res.json(state.settings)
      const settings = await updateBackupSettings(req.body || {})
      const updatedState = await listBackups()
      await publishBackupRealtimeEvent('backup.settings-updated', backupRegistryPayload(updatedState, {}, { settingsChanged: true }))
      res.json(settings)
    } catch (error) { sendError(res, error) }
  })

  router.get('/:backupId/verify', async (req, res) => {
    try {
      const verification = await verifyBackup(req.params.backupId)
      const state = await listBackups()
      await publishBackupRealtimeEvent('backup.verified', backupRegistryPayload(state, {
        valid: verification.valid,
        checkedFiles: verification.checkedFiles,
        errorCount: verification.errors.length,
      }, { verified: true }))
      res.json(verification)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:backupId/restore-preview', async (req, res) => {
    try {
      const preview = await previewRestore(req.params.backupId, req.body || {})
      const state = await listBackups()
      await publishBackupRealtimeEvent('backup.restore-previewed', backupRegistryPayload(state, preview, { previewed: true }))
      res.json(preview)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:backupId/restore', async (req, res) => {
    try {
      const restore = await restoreBackup(req.params.backupId, req.body || {})
      const state = await listBackups()
      await publishBackupRealtimeEvent('backup.restored', backupRegistryPayload(state, {
        restoredFileCount: restore.restoredFiles.length,
      }, { restored: true }))
      res.json(restore)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/:backupId', async (req, res) => {
    try {
      const state = await listBackups()
      const existing = state.backups.find(item => item.id === req.params.backupId)
      if (!existing) return res.json({ deleted: false, id: req.params.backupId })
      const result = await deleteBackup(req.params.backupId)
      const updatedState = await listBackups()
      await publishBackupRealtimeEvent('backup.deleted', backupRegistryPayload(updatedState, {}, { deleted: result.deleted }))
      res.json(result)
    } catch (error) { sendError(res, error) }
  })

  return router
}
