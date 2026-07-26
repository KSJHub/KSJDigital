import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/clientAccountService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishClientAccountEvent('client-account.created'",
  "publishClientAccountEvent('client-account.updated'",
  'role:',
  'websiteCount:',
  'enabledPermissionCount:',
  'passwordChanged:',
  'forcePasswordReset:',
]) {
  if (!source.includes(token)) failures.push(`Missing client account realtime marker: ${token}`)
}

const publisherCalls = [...source.matchAll(/publishClientAccountEvent\([\s\S]*?\)\)/g)].map(match => match[0]).join('\n')
for (const forbidden of [
  'req.body',
  'req.params',
  'password',
  'accessCode',
  'email',
  'name',
  'client.id',
  'current.id',
  'websiteId',
  'websiteIds',
  'session',
  'cookie',
  'authorization',
  'actor(req)',
]) {
  if (publisherCalls.includes(forbidden)) failures.push(`Client account event publisher exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishClientAccountEvent(topic, payload) { await publishDomainEvent(topic, payload) }")) {
  failures.push('Client account events must publish without actor-derived identifying headers')
}
if (!source.includes('delete cleanInput.password; delete cleanInput.accessCode')) {
  failures.push('Client account updates must strip password and access-code fields before persistence')
}

if (failures.length) {
  console.error('Client account real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Client account real-time event checks passed')
