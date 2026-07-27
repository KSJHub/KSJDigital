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
  failures.push('Website events must use aggregate payloads without identifying headers')
}

const createStart = source.indexOf('export async function createWebsite(')
const updateStart = source.indexOf('export async function updateWebsite(')
const deleteStart = source.indexOf('export async function deleteWebsite(')
const createBlock = source.slice(createStart, updateStart)
const updateBlock = source.slice(updateStart, deleteStart)
const deleteBlock = source.slice(deleteStart)

for (const [block, writeToken, publishToken, label] of [
  [createBlock, 'await writeJson(paths.websites(), [...websites, website])', "await publishWebsiteEvent('website.created'", 'creation'],
  [updateBlock, 'await writeJson(paths.websites(), next)', "await publishWebsiteEvent('website.updated'", 'update'],
  [deleteBlock, 'await writeJson(paths.websites(), next)', "await publishWebsiteEvent('website.deleted'", 'deletion'],
]) {
  const writeAt = block.indexOf(writeToken)
  const publishAt = block.indexOf(publishToken)
  if (writeAt < 0 || publishAt < writeAt) failures.push(`Website ${label} must publish after persistence`)
}

if (!createBlock.includes('assertUnique(websites, website)')) failures.push('Website creation must validate uniqueness before persistence')
if (!updateBlock.includes("if (!existing) throw new WebsiteServiceError('Website not found', 404)")) failures.push('Missing website updates must stop before persistence')
if (!updateBlock.includes('if (!websiteStateChanged(existing, website)) return existing')) failures.push('Unchanged website updates must not persist or publish')
if (!deleteBlock.includes('if (websiteId === PLATFORM_WEBSITE_ID) {')) failures.push('Platform website removal must be blocked before persistence')
if (!deleteBlock.includes("throw new WebsiteServiceError('Website not found', 404)")) failures.push('Missing website removal must stop before persistence')

if (failures.length) {
  console.error('Website real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Website real-time event checks passed')
