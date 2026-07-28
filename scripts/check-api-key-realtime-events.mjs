import fs from 'node:fs/promises'

const service = await fs.readFile(new URL('../server/services/serviceAccountService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishApiKeyRealtimeEvent('api-key.authenticated'",
  "publishApiKeyRealtimeEvent('api-key.authentication-failed'",
  "topic: 'api-key.expired'",
  "topic: 'api-key.rate-limit-exceeded'",
  'authenticated:',
  'scopeRequired:',
  'retryable:',
  'expired:',
  'rateLimited:',
  'accountDisabled:',
  'scopeDenied:',
  'invalidFormat:',
]) {
  if (!service.includes(token)) failures.push(`Missing API key realtime marker: ${token}`)
}

const payloadStart = service.indexOf('function apiKeyAuthenticationPayload(')
const payloadEnd = service.indexOf('\n}\n\nasync function publishApiKeyRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? service.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'accountId:', 'keyId:', 'method:', 'requiredScope:', 'scope:', 'resource:', 'reason:', 'category:',
  'token:', 'secret:', 'secretHash:', 'salt:', 'authorization', 'x-api-key', 'originalUrl',
  'actor:', 'session', 'email:', 'userId:', 'authenticatedAt:', 'occurredAt:', 'createdAt:',
  'error:', 'error.message', 'req.', '...authenticated', '...failure',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`API key event payload exposes forbidden data: ${forbidden}`)
}

if (!service.includes("async function publishApiKeyRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('API key events must publish aggregate payloads without actor-derived metadata')
}

const expiryMutation = service.indexOf("key.status = 'expired'")
const expiryOutcome = service.indexOf("return { authenticationError: { message: 'API key has expired', status: 401 } }")
const expiryThrow = service.indexOf('if (outcome?.authenticationError) throw new ServiceAccountError(')
const expiryPublish = service.indexOf("await publishApiKeyRealtimeEvent(failure.topic")
if (expiryMutation < 0 || expiryOutcome < expiryMutation || expiryThrow < expiryOutcome || expiryPublish < expiryThrow) {
  failures.push('API key expiry must persist before the expired realtime event is published')
}

const successMutation = service.indexOf('registry.usage.unshift(usage)')
const successPublish = service.indexOf("await publishApiKeyRealtimeEvent('api-key.authenticated'")
if (successMutation < 0 || successPublish < successMutation) {
  failures.push('Successful API key usage must persist before authentication publication')
}

if (!service.includes("if (!key || key.status !== 'active') throw new ServiceAccountError('API key is invalid or revoked', 401)")) {
  failures.push('Non-active API keys must be rejected before any repeated expiry mutation')
}

for (const topic of [
  'api-key.authenticated',
  'api-key.authentication-failed',
  'api-key.expired',
  'api-key.rate-limit-exceeded',
]) {
  if (service.includes(`publishDomainEvent('${topic}'`)) failures.push(`API key topic must be owned by the canonical API key publisher: ${topic}`)
}

if (failures.length) {
  console.error('API key real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('API key real-time event checks passed')
