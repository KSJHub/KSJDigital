import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/credentialStore.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishCredentialEvent('credential.password-updated'",
  "publishCredentialEvent('credential.removed'",
  "publishCredentialEvent('credential.plaintext-migrated'",
  'existingCredential:',
  'historyCount:',
  'passwordExpiryConfigured:',
  'forcedResetRequired:',
  'policyEnforced:',
  'remainingCredentialCount:',
  'credentialsCreatedCount,',
  'accountsSanitisedCount,',
  'credentialsCreated:',
  'accountsSanitised:',
]) {
  if (!source.includes(token)) failures.push(`Missing credential realtime marker: ${token}`)
}

for (const payloadMarker of [
  "await publishCredentialEvent('credential.password-updated', {",
  "await publishCredentialEvent('credential.removed', {",
  "await publishCredentialEvent('credential.plaintext-migrated', {",
]) {
  const start = source.indexOf(payloadMarker)
  const end = source.indexOf('\n  })', start)
  const payload = start >= 0 && end > start ? source.slice(start, end) : ''
  for (const forbidden of [
    'accountId:',
    'id:',
    'password:',
    'passwordHash:',
    'passwordHistory:',
    'resetTokenHash:',
    'token:',
    'salt:',
    'encoded:',
    'email:',
    'failedAttempts:',
    'lockedUntil:',
    'lastFailedAt:',
    'lastAuthenticatedAt:',
    'updatedAt:',
    'passwordChangedAt:',
    'passwordExpiresAt:',
    'migratedAt:',
    'actor:',
    'request:',
    'session:',
    '...record',
    '...current',
  ]) {
    if (payload.includes(forbidden)) failures.push(`Credential realtime payload exposes forbidden data: ${forbidden}`)
  }
}

if (!source.includes("async function publishCredentialEvent(topic, payload) { await publishDomainEvent(topic, payload) }")) {
  failures.push('Credential events must publish aggregate payloads without actor metadata')
}

const passwordWriteAt = source.indexOf('await writeJson(CREDENTIAL_FILE, { ...credentials, [id]: record })')
const passwordPublishAt = source.indexOf("await publishCredentialEvent('credential.password-updated'")
if (passwordWriteAt < 0 || passwordPublishAt < passwordWriteAt) failures.push('Password-updated event must publish after credential persistence')

const removeWriteAt = source.indexOf('await writeJson(CREDENTIAL_FILE, next)')
const removePublishAt = source.indexOf("await publishCredentialEvent('credential.removed'")
if (removeWriteAt < 0 || removePublishAt < removeWriteAt) failures.push('Credential-removed event must publish after credential persistence')

const migrationPublishAt = source.indexOf("await publishCredentialEvent('credential.plaintext-migrated'")
const credentialMigrationWriteAt = source.indexOf('if (credentialChanged) await writeJson(CREDENTIAL_FILE, credentials)')
const accountMigrationWriteAt = source.indexOf('if (accountChanged) await writeJson(paths.clients(), migrated)')
if (migrationPublishAt < credentialMigrationWriteAt || migrationPublishAt < accountMigrationWriteAt) {
  failures.push('Plaintext-migrated event must publish after all applicable migration writes')
}

for (const forbiddenTopic of [
  "publishDomainEvent('authentication.password-reset-",
  "publishDomainEvent('authentication.session-",
  "publishDomainEvent('audit-trail.",
]) {
  if (source.includes(forbiddenTopic)) failures.push(`Credential store must not duplicate another module topic: ${forbiddenTopic}`)
}

if (failures.length) {
  console.error('Credential real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Credential real-time event checks passed')
