import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/backupRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/backupService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishBackupRealtimeEvent('backup.created'",
  "publishBackupRealtimeEvent('backup.pruned'",
  "publishBackupRealtimeEvent('backup.settings-updated'",
  "publishBackupRealtimeEvent('backup.verified'",
  "publishBackupRealtimeEvent('backup.restore-previewed'",
  "publishBackupRealtimeEvent('backup.restored'",
  "publishBackupRealtimeEvent('backup.deleted'",
  'backupCount:',
  'availableBackupCount:',
  'restoreCount:',
  'completedRestoreCount:',
  'failedRestoreCount:',
  'fileCount:',
  'errorCount:',
  'removedCount:',
  'remainingCount:',
  'includeAssets:',
  'valid:',
]) {
  if (!router.includes(token)) failures.push(`Missing backup realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function backupRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishBackupRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'backupId:', 'restoreId:', 'recoveryBackupId:', 'label:', 'totalBytes:', 'mode:', 'status:',
  'createdAt:', 'verifiedAt:', 'restoredAt:', 'updatedAt:', 'lastScheduledAt:', 'confirmationToken:',
  'files:', 'restoredFiles:', 'settings:', 'intervalMs:', 'retentionDays:', 'maximumBackups:',
  'actor:', 'session', 'email:', 'role:', 'payload:', 'req.body', 'req.params', 'req.query',
  '...result', '...subject', 'error.message', 'error.details',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Backup event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishBackupRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Backup events must use an awaited aggregate-only canonical publisher')
}

const createMutation = router.indexOf('const backup = await createBackup(')
const createPublish = router.indexOf("await publishBackupRealtimeEvent('backup.created'")
if (createMutation < 0 || createPublish < createMutation) failures.push('Backup creation must persist before publication')

const pruneMutation = router.indexOf('const result = await pruneBackups()')
const pruneGuard = router.indexOf('if (result.removed === 0) return res.json(result)', pruneMutation)
const prunePublish = router.indexOf("await publishBackupRealtimeEvent('backup.pruned'")
if (pruneMutation < 0 || pruneGuard < pruneMutation || prunePublish < pruneGuard) failures.push('Empty backup pruning runs must not publish')

const settingsGuard = router.indexOf("if (JSON.stringify(requested) === JSON.stringify(state.settings || {})) return res.json(state.settings)")
const settingsMutation = router.indexOf('const settings = await updateBackupSettings(')
const settingsPublish = router.indexOf("await publishBackupRealtimeEvent('backup.settings-updated'")
if (settingsGuard < 0 || settingsMutation < settingsGuard || settingsPublish < settingsMutation) {
  failures.push('Unchanged backup settings must return before persistence and publication')
}

const verifyMutation = router.indexOf('const verification = await verifyBackup(')
const verifyPublish = router.indexOf("await publishBackupRealtimeEvent('backup.verified'")
if (verifyMutation < 0 || verifyPublish < verifyMutation) failures.push('Backup verification must complete before publication')

const previewMutation = router.indexOf('const preview = await previewRestore(')
const previewPublish = router.indexOf("await publishBackupRealtimeEvent('backup.restore-previewed'")
if (previewMutation < 0 || previewPublish < previewMutation) failures.push('Restore preview must complete before publication')

const restoreMutation = router.indexOf('const restore = await restoreBackup(')
const restorePublish = router.indexOf("await publishBackupRealtimeEvent('backup.restored'")
if (restoreMutation < 0 || restorePublish < restoreMutation) failures.push('Backup restore must persist before publication')

const deleteGuard = router.indexOf("if (!existing) return res.json({ deleted: false, id: req.params.backupId })")
const deleteMutation = router.indexOf('const result = await deleteBackup(')
const deletePublish = router.indexOf("await publishBackupRealtimeEvent('backup.deleted'")
if (deleteGuard < 0 || deleteMutation < deleteGuard || deletePublish < deleteMutation) failures.push('Missing backups must not be deleted or published')

if (!service.includes('if (result?.__skipWrite === true) return result.value')) failures.push('Backup storage must support semantic no-write results')
if (!service.includes('if (!registry.backups.some(item => item.id === id)) return { deleted: false, id }')) failures.push('Missing backup deletes must return before filesystem and registry writes')
if (!service.includes("if (JSON.stringify(settings) === JSON.stringify(registry.settings)) return { __skipWrite: true, value: registry.settings }")) failures.push('Unchanged backup settings must not rewrite storage')
if (!service.includes('if (!remove.length) return { removed: 0, remaining: keep.length }')) failures.push('Empty backup pruning must not rewrite storage')

for (const topic of [
  'backup.created',
  'backup.pruned',
  'backup.settings-updated',
  'backup.verified',
  'backup.restore-previewed',
  'backup.restored',
  'backup.deleted',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Backup topic must be owned by the canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('Backup real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Backup real-time event checks passed')
