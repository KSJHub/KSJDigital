import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/websiteService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishWebsiteEvent('website.created'",
  "publishWebsiteEvent('website.updated'",
  "publishWebsiteEvent('website.deleted'",
  'status:',
  'plan:',
  'pageCount:',
  'mediaCount:',
  'capabilityCount:',
  'hasDomain:',
  'hasRepository:',
  'hasDevelopmentEditor:',
]) {
  if (!source.includes(token)) failures.push(`Missing website realtime marker: ${token}`)
}

const payloadFactory = source.match(/function websiteEventPayload\(website\) \{[\s\S]*?\n\}/)?.[0] || ''
for (const forbidden of [
  'id:',
  'name:',
  'domain:',
  'developmentEditorUrl:',
  'owner:',
  'logo:',
  'orderPrefix:',
  'repository:',
  'notes:',
  'createdAt:',
  'updatedAt:',
  'websiteId:',
]) {
  if (payloadFactory.includes(forbidden)) failures.push(`Website event payload exposes forbidden field: ${forbidden}`)
}

if (!source.includes('async function publishWebsiteEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}')) {
  failures.push('Website events must publish without actor-derived or website-derived identifying headers')
}
if (source.includes("publishWebsiteEvent('website.deleted', { ...website")) {
  failures.push('Website deletion events must not publish the raw website record')
}
if (source.includes("publishWebsiteEvent('website.created', website)")) {
  failures.push('Website creation events must not publish the raw website record')
}
if (source.includes("publishWebsiteEvent('website.updated', website)")) {
  failures.push('Website update events must not publish the raw website record')
}

if (failures.length) {
  console.error('Website real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Website real-time event checks passed')
