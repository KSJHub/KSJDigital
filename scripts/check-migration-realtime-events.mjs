import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/migrationRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/migrationService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishMigrationRealtimeEvent('migration.registered'",
  "publishMigrationRealtimeEvent('migration.planned'",
  "publishMigrationRealtimeEvent(execution.direction === 'up' ? 'migration.applied' : 'migration.rolled-back'",
  "publishMigrationRealtimeEvent('migration.locked'",
  "publishMigrationRealtimeEvent('migration.unlocked'",
  "publishMigrationRealtimeEvent('retention.policy-updated'",
  "publishMigrationRealtimeEvent('retention.planned'",
  "publishMigrationRealtimeEvent('retention.executed'",
  'definitionCount:',
  'appliedCount:',
  'rollbackCount:',
  'lockCount:',
  'retentionPolicyCount:',
  'enabledRetentionPolicyCount:',
  'retentionRunCount:',
  'operationCount:',
  'changedOperationCount:',
  'changedFileCount:',
  'removableCount:',
  'retainedCount:',
  'checkCount:',
  'failedCheckCount:',
]) {
  if (!router.includes(token)) failures.push(`Missing migration realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function migrationRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishMigrationRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'migrationId:', 'policyId:', 'backupId:', 'releaseId:', 'restoreId:', 'version:', 'name:',
  'checksum:', 'scope:', 'owner:', 'environment:', 'direction:', 'status:', 'file:', 'arrayKey:',
  'dateKey:', 'retentionDays:', 'cutoff:', 'changedFiles:', 'changes:', 'operations:', 'up:', 'down:',
  'before:', 'after:', 'value:', 'description:', 'confirmationToken:', 'lockToken:', 'token:',
  'acquiredAt:', 'expiresAt:', 'executedAt:', 'plannedAt:', 'createdAt:', 'updatedAt:', 'actor:',
  'session', 'email:', 'role:', 'payload:', 'req.body', 'req.params', 'req.query', '...state',
  '...details', 'error.message', 'error.details', 'createdBy:', 'executedBy:', 'updatedBy:',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Migration event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishMigrationRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Migration events must use an awaited aggregate-only canonical publisher')
}

const registerOperation = router.indexOf('const migration = await registerMigration(')
const registerPublish = router.indexOf("await publishMigrationRealtimeEvent('migration.registered'")
if (registerOperation < 0 || registerPublish < registerOperation) failures.push('Migration registration must complete before publication')

const planOperation = router.indexOf('const plan = await migrationPlan(')
const planPublish = router.indexOf("await publishMigrationRealtimeEvent('migration.planned'")
if (planOperation < 0 || planPublish < planOperation) failures.push('Migration planning must complete before publication')

const executeOperation = router.indexOf('const execution = await executeMigration(')
const executePublish = router.indexOf("await publishMigrationRealtimeEvent(execution.direction === 'up' ? 'migration.applied' : 'migration.rolled-back'")
if (executeOperation < 0 || executePublish < executeOperation) failures.push('Migration execution must complete before publication')

const lockOperation = router.indexOf('const lock = await acquireMigrationLock(')
const lockPublish = router.indexOf("await publishMigrationRealtimeEvent('migration.locked'")
if (lockOperation < 0 || lockPublish < lockOperation) failures.push('Migration lock acquisition must complete before publication')

const unlockOperation = router.indexOf('const released = await releaseMigrationLock(')
const unlockPublish = router.indexOf("await publishMigrationRealtimeEvent('migration.unlocked'")
if (unlockOperation < 0 || unlockPublish < unlockOperation) failures.push('Migration unlock must complete before publication')

const policyOperation = router.indexOf('const policy = await upsertRetentionPolicy(')
const policyGuard = router.indexOf('if (policy.unchanged) return res.json(policy)')
const policyPublish = router.indexOf("await publishMigrationRealtimeEvent('retention.policy-updated'")
if (policyOperation < 0 || policyGuard < policyOperation || policyPublish < policyGuard) failures.push('Equivalent retention policies must return before publication')

const retentionPlanOperation = router.indexOf('const plan = await retentionPlan(req.params.policyId)')
const retentionPlanPublish = router.indexOf("await publishMigrationRealtimeEvent('retention.planned'")
if (retentionPlanOperation < 0 || retentionPlanPublish < retentionPlanOperation) failures.push('Retention planning must complete before publication')

const retentionExecuteOperation = router.indexOf('const execution = await executeRetention(')
const retentionNoopGuard = router.indexOf('if (execution.noop) return res.json(execution)')
const retentionExecutePublish = router.indexOf("await publishMigrationRealtimeEvent('retention.executed'")
if (retentionExecuteOperation < 0 || retentionNoopGuard < retentionExecuteOperation || retentionExecutePublish < retentionNoopGuard) failures.push('Empty retention executions must return before publication')

if (!service.includes('if (result?.__skipWrite === true) return result.value')) failures.push('Migration storage must support semantic no-write results')
if (!service.includes('return { __skipWrite: true, value: { ...existing, unchanged: true } }')) failures.push('Equivalent retention policies must not rewrite storage')
if (!service.includes("if (plan.removable === 0) return { policyId: plan.policy.id, removed: 0, retained: plan.retained, status: 'noop', noop: true }")) failures.push('Zero-removal retention runs must not create backups or registry writes')
if (service.indexOf('if (plan.removable === 0) return') > service.indexOf('await createBackup({ label: `Pre-retention')) failures.push('Zero-removal retention suppression must occur before backup creation')

for (const topic of [
  'migration.registered',
  'migration.planned',
  'migration.applied',
  'migration.rolled-back',
  'migration.locked',
  'migration.unlocked',
  'retention.policy-updated',
  'retention.planned',
  'retention.executed',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Migration topic must be owned by the canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('Migration real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Migration real-time event checks passed')
