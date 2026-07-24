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

function actor(req) {
  return {
    id: req.session?.userId || null,
    email: req.session?.email || null,
  }
}

function sendError(res, error) {
  const body = { error: error.message || 'Backup request failed' }
  if (error.details) body.details = error.details
  res.status(Number(error.status) || 400).json(body)
}

export function createBackupRouter() {
  const router = express.Router()
  router.use((req, res, next) => requireOwner(req, res) && next())

  router.get('/', async (_req, res) => {
    try {
      res.json(await listBackups())
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const backup = await createBackup(req.body || {})
      await publishDomainEvent('backup.created', {
        backupId: backup.id,
        label: backup.label,
        fileCount: backup.fileCount,
        totalBytes: backup.totalBytes,
        includeAssets: backup.includeAssets,
        createdAt: backup.createdAt,
      }, requestedBy)
      res.status(201).json(backup)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/prune', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const result = await pruneBackups()
      await publishDomainEvent('backup.pruned', result, requestedBy)
      res.json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/settings', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const settings = await updateBackupSettings(req.body || {})
      await publishDomainEvent('backup.settings-updated', { settings }, requestedBy)
      res.json(settings)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:backupId/verify', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const verification = await verifyBackup(req.params.backupId)
      await publishDomainEvent('backup.verified', {
        backupId: verification.backup.id,
        valid: verification.valid,
        checkedFiles: verification.checkedFiles,
        errorCount: verification.errors.length,
        verifiedAt: verification.verifiedAt,
      }, requestedBy)
      res.json(verification)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:backupId/restore-preview', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const preview = await previewRestore(req.params.backupId, req.body || {})
      await publishDomainEvent('backup.restore-previewed', {
        backupId: preview.backupId,
        mode: preview.mode,
        fileCount: preview.fileCount,
        totalBytes: preview.totalBytes,
      }, requestedBy)
      res.json(preview)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:backupId/restore', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const restore = await restoreBackup(req.params.backupId, req.body || {})
      await publishDomainEvent('backup.restored', {
        restoreId: restore.id,
        backupId: restore.backupId,
        recoveryBackupId: restore.recoveryBackupId,
        mode: restore.mode,
        restoredFileCount: restore.restoredFiles.length,
        restoredAt: restore.restoredAt,
        status: restore.status,
      }, requestedBy)
      res.json(restore)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:backupId', async (req, res) => {
    try {
      const requestedBy = actor(req)
      const result = await deleteBackup(req.params.backupId)
      await publishDomainEvent('backup.deleted', {
        backupId: result.id,
        deleted: result.deleted,
      }, requestedBy)
      res.json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
