import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/collaborationRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishCollaborationRealtimeEvent('collaboration.session-created'",
  "publishCollaborationRealtimeEvent('collaboration.session-heartbeat'",
  "publishCollaborationRealtimeEvent('collaboration.session-closed'",
  "publishCollaborationRealtimeEvent('collaboration.session-recovered'",
  "publishCollaborationRealtimeEvent('collaboration.lock-acquired'",
  "publishCollaborationRealtimeEvent('collaboration.lock-released'",
  "publishCollaborationRealtimeEvent('collaboration.change-applied'",
  "publishCollaborationRealtimeEvent('collaboration.conflict-detected'",
  "publishCollaborationRealtimeEvent('collaboration.conflict-resolved'",
  'sessionCount:',
  'activeSessionCount:',
  'lockCount:',
  'activeLockCount:',
  'changeCount:',
  'conflictCount:',
  'openConflictCount:',
  'metadataFieldCount:',
  'hasCursor:',
  'hasSelection:',
]) {
  if (!router.includes(token)) failures.push(`Missing collaboration realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function collaborationRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishCollaborationRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'accountId:', 'websiteId:', 'resourceType:', 'resourceId:', 'resourceKey:', 'sessionId:',
  'participantId:', 'lockId:', 'changeId:', 'conflictId:', 'recoveredFromSessionId:',
  'baseVersion:', 'currentVersion:', 'operation:', 'path:', 'clientChangeId:', 'value:',
  'resolution:', 'notes:', 'displayName:', 'cursor:', 'selection:', 'metadata:',
  'createdAt:', 'updatedAt:', 'lastSeenAt:', 'expiresAt:', 'closedAt:', 'releasedAt:',
  'resolvedAt:', 'actor:', 'session', 'email:', 'role:', 'payload:', 'req.body', 'req.params',
  '...subject', '...result', 'error.message', 'error.details',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Collaboration event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishCollaborationRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Collaboration events must use an awaited aggregate-only canonical publisher')
}

const closeGuard = router.indexOf("if (existing?.status === 'closed') return existing")
const closeMutation = router.indexOf('const session = await closeCollaborationSession(')
const closePublish = router.indexOf("await publishCollaborationRealtimeEvent('collaboration.session-closed'")
if (closeGuard < 0 || closeMutation < closeGuard || closePublish < closeMutation) {
  failures.push('Already-closed collaboration sessions must return before persistence and publication')
}

const releaseGuard = router.indexOf("if (existing?.status === 'released') return existing")
const releaseMutation = router.indexOf('const lock = await releaseRecordLock(')
const releasePublish = router.indexOf("await publishCollaborationRealtimeEvent('collaboration.lock-released'")
if (releaseGuard < 0 || releaseMutation < releaseGuard || releasePublish < releaseMutation) {
  failures.push('Already-released collaboration locks must return before persistence and publication')
}

for (const [operation, topic] of [
  ['createCollaborationSession(', 'collaboration.session-created'],
  ['heartbeatSession(', 'collaboration.session-heartbeat'],
  ['recoverCollaborationSession(', 'collaboration.session-recovered'],
  ['acquireRecordLock(', 'collaboration.lock-acquired'],
  ['appendCollaborationChange(', 'collaboration.change-applied'],
  ['resolveCollaborationConflict(', 'collaboration.conflict-resolved'],
]) {
  const mutation = router.indexOf(`await ${operation}`)
  const publish = router.indexOf(`publishCollaborationRealtimeEvent('${topic}'`)
  if (mutation < 0 || publish < mutation) failures.push(`${topic} must publish after its collaboration operation`)
}

for (const topic of [
  'collaboration.session-created',
  'collaboration.session-heartbeat',
  'collaboration.session-closed',
  'collaboration.session-recovered',
  'collaboration.lock-acquired',
  'collaboration.lock-released',
  'collaboration.change-applied',
  'collaboration.conflict-detected',
  'collaboration.conflict-resolved',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Collaboration topic must be owned by the canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('Collaboration real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Collaboration real-time event checks passed')
