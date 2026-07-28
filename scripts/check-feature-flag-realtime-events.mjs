import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/featureFlagRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishFeatureFlagRealtimeEvent('feature-flag.updated'",
  "publishFeatureFlagRealtimeEvent('feature-flag.deleted'",
  "publishFeatureFlagRealtimeEvent('feature-flag.kill-switch-changed'",
  "publishFeatureFlagRealtimeEvent('feature-flag.evaluated'",
  "publishFeatureFlagRealtimeEvent('feature-flag.batch-evaluated'",
  'flagCount:',
  'enabledFlagCount:',
  'killSwitchCount:',
  'rolloutPercentage:',
  'environmentCount:',
  'websiteTargetCount:',
  'userTargetCount:',
  'excludedWebsiteCount:',
  'excludedUserCount:',
  'evaluatedCount:',
  'enabledCount:',
  'blockedCount:',
  'targetedCount:',
  'hasWebsiteContext:',
  'hasUserContext:',
]) {
  if (!router.includes(token)) failures.push(`Missing feature flag realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function featureFlagRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishFeatureFlagRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'accountId:', 'flagKey:', 'websiteId:', 'userId:', 'environment:', 'environments:', 'reason:',
  'salt:', 'bucket:', 'subject:', 'websiteIds:', 'userIds:', 'excludedWebsiteIds:', 'excludedUserIds:',
  'actor:', 'session', 'email:', 'role:', 'createdAt:', 'updatedAt:', 'evaluatedAt:',
  'req.body', 'req.params', '...flag', '...evaluation', '...results',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Feature flag event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishFeatureFlagRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Feature flag events must publish aggregate payloads without actor-derived metadata')
}

const updateGuard = router.indexOf('if (!flagPatchChanges(existing, input)) return res.json(existing)')
const updateMutation = router.indexOf('const flag = await upsertFeatureFlag(')
const updatePublish = router.indexOf("await publishFeatureFlagRealtimeEvent('feature-flag.updated'")
if (updateGuard < 0 || updateMutation < updateGuard || updatePublish < updateMutation) {
  failures.push('Unchanged feature flags must return before persistence and publication')
}

const deleteGuard = router.indexOf("if (!existing) return res.json({ deleted: false, key: req.params.flagKey })")
const deleteMutation = router.indexOf('const result = await deleteFeatureFlag(')
const deletePublish = router.indexOf("await publishFeatureFlagRealtimeEvent('feature-flag.deleted'")
if (deleteGuard < 0 || deleteMutation < deleteGuard || deletePublish < deleteMutation) {
  failures.push('Missing feature flags must not be deleted or published')
}

const killGuard = router.indexOf('if ((existing.killSwitch === true) === enabled) return res.json(existing)')
const killMutation = router.indexOf('const flag = await setFeatureFlagKillSwitch(')
const killPublish = router.indexOf("await publishFeatureFlagRealtimeEvent('feature-flag.kill-switch-changed'")
if (killGuard < 0 || killMutation < killGuard || killPublish < killMutation) {
  failures.push('Unchanged kill-switch state must return before persistence and publication')
}

const batchGuard = router.indexOf('if (keys.length === 0) return res.json({})')
const batchMutation = router.indexOf('const results = await evaluateFeatureFlags(')
const batchPublish = router.indexOf("await publishFeatureFlagRealtimeEvent('feature-flag.batch-evaluated'")
if (batchGuard < 0 || batchMutation < batchGuard || batchPublish < batchMutation) {
  failures.push('Empty feature flag batches must return before evaluation persistence and publication')
}

for (const topic of [
  'feature-flag.updated',
  'feature-flag.deleted',
  'feature-flag.kill-switch-changed',
  'feature-flag.evaluated',
  'feature-flag.batch-evaluated',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Feature flag topic must be owned by the canonical feature flag publisher: ${topic}`)
}

if (failures.length) {
  console.error('Feature flag real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Feature flag real-time event checks passed')
