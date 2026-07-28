import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/serviceAccountRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishServiceAccountRealtimeEvent('service-account.updated'",
  "publishServiceAccountRealtimeEvent('service-account.disabled'",
  "publishServiceAccountRealtimeEvent('service-account.key-issued'",
  "publishServiceAccountRealtimeEvent('service-account.key-rotated'",
  "publishServiceAccountRealtimeEvent('service-account.key-revoked'",
  'accountCount:',
  'enabledAccountCount:',
  'keyCount:',
  'activeKeyCount:',
  'metadataFieldCount:',
  'scopeCount:',
  'hasExpiry:',
  'hasRateLimit:',
  'rotated:',
  'revoked:',
]) {
  if (!router.includes(token)) failures.push(`Missing service account realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function serviceAccountRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishServiceAccountRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'accountId:', 'keyId:', 'rotatedFromKeyId:', 'actorAccountId:', 'token:', 'secretHash:', 'salt:',
  'scopes:', 'expiresAt:', 'reason:', 'metadata:', 'actor:', 'session', 'email:', 'role:',
  'createdAt:', 'updatedAt:', 'revokedAt:', 'req.body', 'req.params', '...account', '...key',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Service account event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishServiceAccountRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Service account events must publish aggregate payloads without actor-derived metadata')
}

const updateGuard = router.indexOf('if (!accountPatchChanges(existing, input)) return res.json(existing)')
const updateMutation = router.indexOf('const account = await upsertServiceAccount(')
const updatePublish = router.indexOf("await publishServiceAccountRealtimeEvent('service-account.updated'")
if (updateGuard < 0 || updateMutation < updateGuard || updatePublish < updateMutation) {
  failures.push('Unchanged service accounts must return before persistence and publication')
}

const disableGuard = router.indexOf('if (existing.enabled === false) return res.json(existing)')
const disableMutation = router.indexOf('const account = await disableServiceAccount(')
const disablePublish = router.indexOf("await publishServiceAccountRealtimeEvent('service-account.disabled'")
if (disableGuard < 0 || disableMutation < disableGuard || disablePublish < disableMutation) {
  failures.push('Already-disabled service accounts must return before persistence and publication')
}

const rotateGuard = router.indexOf("if (existing.status !== 'active') return res.status(409).json({ error: 'Only active API keys can be rotated' })")
const rotateMutation = router.indexOf('const rotated = await rotateApiKey(')
const rotatePublish = router.indexOf("await publishServiceAccountRealtimeEvent('service-account.key-rotated'")
if (rotateGuard < 0 || rotateMutation < rotateGuard || rotatePublish < rotateMutation) {
  failures.push('Non-active API keys must not be rotated or published')
}

const revokeGuard = router.indexOf("if (existing.status === 'revoked') return res.json(existing)")
const revokeMutation = router.indexOf('const key = await revokeApiKey(')
const revokePublish = router.indexOf("await publishServiceAccountRealtimeEvent('service-account.key-revoked'")
if (revokeGuard < 0 || revokeMutation < revokeGuard || revokePublish < revokeMutation) {
  failures.push('Already-revoked API keys must return before persistence and publication')
}

for (const topic of [
  'service-account.updated',
  'service-account.disabled',
  'service-account.key-issued',
  'service-account.key-rotated',
  'service-account.key-revoked',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Service account topic must be owned by the canonical service account publisher: ${topic}`)
}

if (failures.length) {
  console.error('Service account real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Service account real-time event checks passed')
