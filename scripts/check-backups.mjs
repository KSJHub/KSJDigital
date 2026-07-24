import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  createBackup,
  deleteBackup,
  previewRestore,
  updateBackupSettings,
  verifyBackup,
} from '../server/services/backupService.js'
import { DATA_DIR, writeJson } from '../server/storage.js'

const fixture = path.join(DATA_DIR, 'backup-check-fixture.json')
await writeJson(fixture, { value: 'before' })
const backup = await createBackup({ label: 'Validation backup' })
assert.ok(backup.id)
assert.ok(backup.files.some(item => item.path === 'backup-check-fixture.json'))
const verification = await verifyBackup(backup.id)
assert.equal(verification.valid, true)
const preview = await previewRestore(backup.id, { paths: ['backup-check-fixture.json'] })
assert.equal(preview.mode, 'selective')
assert.equal(preview.fileCount, 1)
assert.equal(preview.confirmationToken.length, 64)
const settings = await updateBackupSettings({ intervalMs: 3600000, retentionDays: 7, maximumBackups: 10 })
assert.equal(settings.intervalMs, 3600000)
assert.equal(settings.retentionDays, 7)
await deleteBackup(backup.id)
await fs.rm(fixture, { force: true })

const router = await fs.readFile(path.resolve('server/backupRouter.js'), 'utf8')
assert.match(router, /requireOwner/)
assert.match(router, /restore-preview/)
const start = await fs.readFile(path.resolve('server/start.js'), 'utf8')
assert.match(start, /startBackupScheduler\(\)/)
assert.match(start, /createBackupRouter\(\)/)
console.log('Backup and disaster recovery checks passed')
