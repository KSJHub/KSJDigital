import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/releaseRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/releaseService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishReleaseRealtimeEvent('release.created'",
  "publishReleaseRealtimeEvent(maintenance.enabled ? 'release.maintenance-enabled' : 'release.maintenance-disabled'",
  "publishReleaseRealtimeEvent('release.deployment-locked'",
  "publishReleaseRealtimeEvent('release.deployment-unlocked'",
  "publishReleaseRealtimeEvent('release.deployment-planned'",
  "publishReleaseRealtimeEvent('release.promoted'",
  "publishReleaseRealtimeEvent('release.rolled-back'",
  'releaseCount:',
  'registeredReleaseCount:',
  'promotedReleaseCount:',
  'releasedReleaseCount:',
  'deploymentCount:',
  'completedDeploymentCount:',
  'environmentCount:',
  'activeEnvironmentCount:',
  'maintenanceEnabledCount:',
  'deploymentLockCount:',
  'checkCount:',
  'failedCheckCount:',
  'warningCheckCount:',
]) {
  if (!router.includes(token)) failures.push(`Missing release realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function releaseRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishReleaseRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'releaseId:', 'deploymentId:', 'rollbackId:', 'backupId:', 'restoreId:', 'currentReleaseId:',
  'previousReleaseId:', 'fromReleaseId:', 'toReleaseId:', 'environment:', 'version:', 'status:',
  'commitSha:', 'branch:', 'artifactName:', 'artifactSize:', 'artifact:', 'source:', 'notes:', 'uri:',
  'sha256:', 'message:', 'owner:', 'acquiredAt:', 'expiresAt:', 'enabledAt:', 'completedAt:',
  'plannedAt:', 'rolledBackAt:', 'checks:', 'confirmationToken:', 'lockToken:', 'token:', 'actor:',
  'session', 'email:', 'role:', 'payload:', 'req.body', 'req.params', 'req.query', '...state',
  '...details', 'error.message', 'error.details', 'createdBy:', 'deployedBy:', 'rolledBackBy:',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Release event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishReleaseRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Release events must use an awaited aggregate-only canonical publisher')
}

const createOperation = router.indexOf('const release = await createRelease(')
const createPublish = router.indexOf("await publishReleaseRealtimeEvent('release.created'")
if (createOperation < 0 || createPublish < createOperation) failures.push('Release creation must complete before publication')

const maintenanceGuard = router.indexOf('if (before.enabled === enabled && before.message === message) return res.json(')
const maintenanceOperation = router.indexOf('const maintenance = await setMaintenanceMode(')
const maintenancePublish = router.indexOf("await publishReleaseRealtimeEvent(maintenance.enabled ? 'release.maintenance-enabled' : 'release.maintenance-disabled'")
if (maintenanceGuard < 0 || maintenanceOperation < maintenanceGuard || maintenancePublish < maintenanceOperation) failures.push('Unchanged maintenance state must return before persistence and publication')

const lockOperation = router.indexOf('const lock = await acquireDeploymentLock(')
const lockPublish = router.indexOf("await publishReleaseRealtimeEvent('release.deployment-locked'")
if (lockOperation < 0 || lockPublish < lockOperation) failures.push('Deployment lock acquisition must complete before publication')

const unlockOperation = router.indexOf('const result = await releaseDeploymentLock(')
const unlockPublish = router.indexOf("await publishReleaseRealtimeEvent('release.deployment-unlocked'")
if (unlockOperation < 0 || unlockPublish < unlockOperation) failures.push('Deployment unlock must complete before publication')

const planOperation = router.indexOf('const plan = await deploymentPlan(')
const planPublish = router.indexOf("await publishReleaseRealtimeEvent('release.deployment-planned'")
if (planOperation < 0 || planPublish < planOperation) failures.push('Deployment planning must complete before publication')

const promoteOperation = router.indexOf('const deployment = await promoteRelease(')
const promotePublish = router.indexOf("await publishReleaseRealtimeEvent('release.promoted'")
if (promoteOperation < 0 || promotePublish < promoteOperation) failures.push('Release promotion must complete before publication')

const rollbackOperation = router.indexOf('const rollback = await rollbackRelease(')
const rollbackPublish = router.indexOf("await publishReleaseRealtimeEvent('release.rolled-back'")
if (rollbackOperation < 0 || rollbackPublish < rollbackOperation) failures.push('Release rollback must complete before publication')

if (!service.includes('if (result?.__skipWrite === true) return result.value')) failures.push('Release storage must support semantic no-write results')
if (!service.includes("if (existing?.enabled === enabled && existing.message === message) return { __skipWrite: true")) failures.push('Equivalent maintenance state must not rewrite storage')
if (!service.includes('if (result.unchanged) return result')) failures.push('Unchanged maintenance state must not publish integration events')

for (const topic of [
  'release.created',
  'release.maintenance-enabled',
  'release.maintenance-disabled',
  'release.deployment-locked',
  'release.deployment-unlocked',
  'release.deployment-planned',
  'release.promoted',
  'release.rolled-back',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Release topic must be owned by the canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('Release real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Release real-time event checks passed')
