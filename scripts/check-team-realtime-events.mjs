import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/teamRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishTeamEvent('team.member-added'",
  "publishTeamEvent('team.member-updated'",
  "publishTeamEvent('team.member-removed'",
  'status:',
  'enabledPermissionCount:',
  'websiteCount:',
  'credentialChanged:',
  'teamSize:',
]) {
  if (!source.includes(token)) failures.push(`Missing team realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function teamEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishTeamEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'req.body',
  'req.params',
  'member.id',
  'member.name',
  'member.displayName',
  'member.email',
  'member.roleLabel',
  'member.websiteId',
  'member.websiteIds',
  'password',
  'accessCode',
  'temporaryPassword',
  'session',
  'cookie',
  'authorization',
  'actor(req)',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Team event payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes('async function publishTeamEvent(topic, payload) { await publishDomainEvent(topic, payload) }')) {
  failures.push('Team events must publish without actor-derived identifying headers')
}
if (!source.includes('await publishTeamEvent') || !source.includes('await writeJson')) {
  failures.push('Team lifecycle events must publish after successful persistence')
}
if (!source.includes('await removeCredential(existing.id)')) {
  failures.push('Team member removal must delete the associated credential')
}

if (failures.length) {
  console.error('Team real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Team real-time event checks passed')
