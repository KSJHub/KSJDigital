import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/auditTrailService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishAuditTrailEvent('audit.config-updated'",
  "publishAuditTrailEvent('audit.event-recorded'",
  "publishAuditTrailEvent('audit.events-pruned'",
  'retentionDays:',
  'outcome:',
  'hasActor:',
  'hasRequestContext:',
  'hasResource:',
  'hasChanges:',
  'metadataFieldCount:',
  'eventCount:',
  'removedEventCount:',
  'remainingEventCount:',
]) {
  if (!source.includes(token)) failures.push(`Missing audit trail realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function auditEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishAuditTrailEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'id: event.id',
  'websiteId: event.websiteId',
  'timestamp: event.timestamp',
  'category: event.category',
  'action: event.action',
  'actor: event.actor',
  'request: event.request',
  'resource: event.resource',
  'changes: event.changes',
  'metadata: event.metadata',
  'email:',
  'name:',
  'role:',
  'ip:',
  'path:',
  'requestId:',
  'userAgent:',
  '...event',
  '...input',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Audit event payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishAuditTrailEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Audit trail events must publish aggregate payloads without actor-derived metadata')
}

const configWrite = source.indexOf('await writeJson(configPath(id), config)')
const configPublish = source.indexOf("await publishAuditTrailEvent('audit.config-updated'")
if (configWrite < 0 || configPublish < configWrite) failures.push('Audit config events must publish after persistence')

const appendWrite = source.indexOf('const events = await mutate(id, existing => [event, ...existing])')
const appendPublish = source.indexOf("await publishAuditTrailEvent('audit.event-recorded'")
if (appendWrite < 0 || appendPublish < appendWrite) failures.push('Audit recorded events must publish after persistence')

const pruneWrite = source.indexOf('const events = await mutate(id, existing => {')
const prunePublish = source.indexOf("await publishAuditTrailEvent('audit.events-pruned'")
if (pruneWrite < 0 || prunePublish < pruneWrite) failures.push('Audit prune events must publish after persistence')

if (failures.length) {
  console.error('Audit trail real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Audit trail real-time event checks passed')
