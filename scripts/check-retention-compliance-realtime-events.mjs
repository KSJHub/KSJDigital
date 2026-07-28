import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/retentionComplianceRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/retentionComplianceService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishRetentionComplianceRealtimeEvent('retention-compliance.report-generated'",
  "publishRetentionComplianceRealtimeEvent('retention-compliance.policy-updated'",
  "publishRetentionComplianceRealtimeEvent('retention-compliance.policy-deleted'",
  "publishRetentionComplianceRealtimeEvent('retention-compliance.policy-previewed'",
  "publishRetentionComplianceRealtimeEvent('retention-compliance.policy-executed'",
  "publishRetentionComplianceRealtimeEvent('retention-compliance.legal-hold-updated'",
  "publishRetentionComplianceRealtimeEvent('retention-compliance.legal-hold-deleted'",
  "publishRetentionComplianceRealtimeEvent('retention-compliance.cycle-run'",
  'policyCount:',
  'enabledPolicyCount:',
  'legalHoldCount:',
  'activeLegalHoldCount:',
  'runCount:',
  'retentionDays:',
  'recordCount:',
  'candidateCount:',
  'heldCount:',
  'purgedCount:',
  'processedCount:',
  'hasExpiry:',
]) {
  if (!router.includes(token)) failures.push(`Missing retention compliance realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function retentionRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishRetentionComplianceRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'accountId:', 'policyId:', 'legalHoldId:', 'runId:', 'websiteId:', 'resourceType:',
  'timestampField:', 'priority:', 'cutoff:', 'recordIds:', 'reason:', 'statistics:', 'runIds:',
  'generatedAt:', 'createdAt:', 'updatedAt:', 'expiresAt:', 'actor:', 'session', 'email:', 'role:',
  'candidates:', 'held:', 'recordFingerprint:', 'fingerprint:', 'payload:', 'req.body', 'req.params',
  '...result', '...subject', 'error.message', 'error.details',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Retention compliance event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishRetentionComplianceRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Retention compliance events must use an awaited aggregate-only canonical publisher')
}

const policyGuard = router.indexOf('if (!retentionPolicyPatchChanges(existing, input)) return existing')
const policyMutation = router.indexOf('const policy = await upsertRetentionPolicy(')
const policyPublish = router.indexOf("await publishRetentionComplianceRealtimeEvent('retention-compliance.policy-updated'")
if (policyGuard < 0 || policyMutation < policyGuard || policyPublish < policyMutation) failures.push('Unchanged retention policies must return before persistence and publication')

const policyDeleteGuard = router.indexOf("if (!existing) return { deleted: false, id: req.params.policyId }")
const policyDeleteMutation = router.indexOf('const result = await deleteRetentionPolicy(')
const policyDeletePublish = router.indexOf("await publishRetentionComplianceRealtimeEvent('retention-compliance.policy-deleted'")
if (policyDeleteGuard < 0 || policyDeleteMutation < policyDeleteGuard || policyDeletePublish < policyDeleteMutation) failures.push('Missing retention policies must not be persisted or published')

const executionMutation = router.indexOf('const run = await executeRetentionPolicy(')
const executionGuard = router.indexOf('if (run.noop === true) return run', executionMutation)
const executionPublish = router.indexOf("await publishRetentionComplianceRealtimeEvent('retention-compliance.policy-executed'")
if (executionMutation < 0 || executionGuard < executionMutation || executionPublish < executionGuard) failures.push('Zero-candidate retention executions must not publish')

const holdGuard = router.indexOf('if (!legalHoldPatchChanges(existing, input)) return existing')
const holdMutation = router.indexOf('const hold = await upsertLegalHold(')
const holdPublish = router.indexOf("await publishRetentionComplianceRealtimeEvent('retention-compliance.legal-hold-updated'")
if (holdGuard < 0 || holdMutation < holdGuard || holdPublish < holdMutation) failures.push('Unchanged legal holds must return before persistence and publication')

const holdDeleteGuard = router.indexOf("if (!existing) return { deleted: false, id: req.params.legalHoldId }")
const holdDeleteMutation = router.indexOf('const result = await deleteLegalHold(')
const holdDeletePublish = router.indexOf("await publishRetentionComplianceRealtimeEvent('retention-compliance.legal-hold-deleted'")
if (holdDeleteGuard < 0 || holdDeleteMutation < holdDeleteGuard || holdDeletePublish < holdDeleteMutation) failures.push('Missing legal holds must not be persisted or published')

const cycleMutation = router.indexOf('const cycle = await runRetentionCycle(')
const cycleGuard = router.indexOf('if (cycle.processed === 0) return cycle', cycleMutation)
const cyclePublish = router.indexOf("await publishRetentionComplianceRealtimeEvent('retention-compliance.cycle-run'")
if (cycleMutation < 0 || cycleGuard < cycleMutation || cyclePublish < cycleGuard) failures.push('Empty retention cycles must not publish')

if (!service.includes('if (result?.__skipWrite === true) return result.value')) failures.push('Retention storage must support semantic no-write results')
if (!service.includes("if (!existed) return { __skipWrite: true, value: { deleted: false, id } }")) failures.push('Missing retention deletes must not rewrite storage')
if (!service.includes("if (!inspection.candidates.length) return { noop: true, purgedCount: 0, heldCount: inspection.held.length }")) failures.push('Zero-candidate retention execution must return before resource and registry writes')
if (!service.includes('if (result.noop !== true) results.push(result)')) failures.push('Retention cycles must exclude no-op executions')

for (const topic of [
  'retention-compliance.report-generated',
  'retention-compliance.policy-updated',
  'retention-compliance.policy-deleted',
  'retention-compliance.policy-previewed',
  'retention-compliance.policy-executed',
  'retention-compliance.legal-hold-updated',
  'retention-compliance.legal-hold-deleted',
  'retention-compliance.cycle-run',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Retention compliance topic must be owned by the canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('Retention compliance real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Retention compliance real-time event checks passed')
