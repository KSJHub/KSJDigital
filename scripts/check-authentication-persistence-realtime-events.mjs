import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/authPersistenceService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishAuthenticationPersistenceEvent('authentication.session-issued'",
  "publishAuthenticationPersistenceEvent('authentication.login-recorded'",
  'activeSessionCount:',
  'revokedSessionCount:',
  'elevatedAssurance:',
  'trustedDevice:',
  'successful:',
  'failed:',
  'riskEvaluated:',
  'failureReasonRecorded:',
]) {
  if (!source.includes(token)) failures.push(`Missing authentication persistence realtime marker: ${token}`)
}

for (const payloadMarker of [
  "await publishAuthenticationPersistenceEvent('authentication.session-issued', {",
  "await publishAuthenticationPersistenceEvent('authentication.login-recorded', {",
]) {
  const start = source.indexOf(payloadMarker)
  const end = source.indexOf('\n  })', start)
  const payload = start >= 0 && end > start ? source.slice(start, end) : ''
  for (const forbidden of [
    'token:',
    'tokenHash:',
    'accountId:',
    'sessionId:',
    'id:',
    'email:',
    'ip:',
    'userAgent:',
    'deviceName:',
    'reason:',
    'risk:',
    'createdAt:',
    'updatedAt:',
    'expiresAt:',
    'assuranceMethod:',
    'actor:',
    'request:',
    'session:',
    '...event',
  ]) {
    if (payload.includes(forbidden)) failures.push(`Authentication persistence realtime payload exposes forbidden data: ${forbidden}`)
  }
}

if (!source.includes("async function publishAuthenticationPersistenceEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Authentication persistence events must publish aggregate payloads without actor metadata')
}

const sessionMutateAt = source.indexOf('const result = await mutate(state => {')
const sessionPublishAt = source.indexOf("await publishAuthenticationPersistenceEvent('authentication.session-issued'")
if (sessionMutateAt < 0 || sessionPublishAt < sessionMutateAt) {
  failures.push('Session-issued event must publish after authentication registry persistence')
}

const loginMutateAt = source.indexOf('const event = await mutate(state => {')
const loginPublishAt = source.indexOf("await publishAuthenticationPersistenceEvent('authentication.login-recorded'")
if (loginMutateAt < 0 || loginPublishAt < loginMutateAt) {
  failures.push('Login-recorded event must publish after authentication registry persistence')
}

for (const forbiddenTopic of [
  "publishDomainEvent('authentication.session-revoked'",
  "publishDomainEvent('authentication.password-reset-",
  "publishDomainEvent('audit-trail.",
]) {
  if (source.includes(forbiddenTopic)) failures.push(`Authentication persistence service must not duplicate another module topic: ${forbiddenTopic}`)
}

if (failures.length) {
  console.error('Authentication persistence real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Authentication persistence real-time event checks passed')
