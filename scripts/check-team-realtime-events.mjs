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
const payloadEnd = source.indexOf('\n}\n\nfunction teamMemberState', payloadStart)
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
if (!source.includes("if (!Object.prototype.hasOwnProperty.call(payload, permission)) {\n      result[permission] = existing[permission] === true")) {
  failures.push('Team PATCH requests must preserve permissions omitted from the payload')
}
if (!source.includes('const permissions = boundedPermissions(req.session, req.body, existing)')) {
  failures.push('Team member updates must compare against existing permissions')
}
if (!source.includes('if (!credentialChanged && !teamMemberStateChanged(existing, updated)) return res.json(sanitise(existing))')) {
  failures.push('Semantic no-op team updates must not persist or publish')
}
if (!source.includes('if (credentialChanged && String(req.body.accessCode).length < 8)')) {
  failures.push('Invalid temporary-password updates must fail before persistence')
}

for (const [routeStart, routeEnd, writeToken, publishToken, label] of [
  ["router.post('/',", "router.patch('/:id'", 'await writeJson(paths.clients(), nextMembers)', "await publishTeamEvent('team.member-added'", 'team member creation'],
  ["router.patch('/:id'", "router.delete('/:id'", 'await writeJson(paths.clients(), nextMembers)', "await publishTeamEvent('team.member-updated'", 'team member update'],
  ["router.delete('/:id'", 'return router', 'await writeJson(paths.clients(), nextMembers)', "await publishTeamEvent('team.member-removed'", 'team member removal'],
]) {
  const start = source.indexOf(routeStart)
  const end = source.indexOf(routeEnd, start)
  const route = start >= 0 && end > start ? source.slice(start, end) : ''
  const writeAt = route.indexOf(writeToken)
  const publishAt = route.indexOf(publishToken)
  if (writeAt < 0 || publishAt < writeAt) failures.push(`${label} events must publish after client persistence`)
}

const createStart = source.indexOf("router.post('/',")
const createEnd = source.indexOf("router.patch('/:id'", createStart)
const createSource = createStart >= 0 && createEnd > createStart ? source.slice(createStart, createEnd) : ''
if (!createSource.includes("if (!email) return res.status(400)")) failures.push('Team creation must reject missing email before persistence')
if (!createSource.includes('if (temporaryPassword.length < 8) return res.status(400)')) failures.push('Team creation must reject invalid temporary passwords before persistence')
if (!createSource.includes("return res.status(409).json({ error: 'A user with this email already exists' })")) failures.push('Team creation must reject duplicate email addresses before persistence')

const updateStart = source.indexOf("router.patch('/:id'")
const updateEnd = source.indexOf("router.delete('/:id'", updateStart)
const updateSource = updateStart >= 0 && updateEnd > updateStart ? source.slice(updateStart, updateEnd) : ''
if (!updateSource.includes("return res.status(404).json({ error: 'Team member not found' })")) failures.push('Missing or inaccessible team updates must not persist or publish')

const deleteStart = source.indexOf("router.delete('/:id'")
const deleteSource = deleteStart >= 0 ? source.slice(deleteStart) : ''
if (!deleteSource.includes("return res.status(404).json({ error: 'Team member not found' })")) failures.push('Missing or inaccessible team removals must not persist or publish')
if (!deleteSource.includes('await removeCredential(existing.id)')) failures.push('Team member removal must delete the associated credential')
const deleteWriteAt = deleteSource.indexOf('await writeJson(paths.clients(), nextMembers)')
const credentialRemoveAt = deleteSource.indexOf('await removeCredential(existing.id)')
const deletePublishAt = deleteSource.indexOf("await publishTeamEvent('team.member-removed'")
if (credentialRemoveAt < deleteWriteAt || deletePublishAt < credentialRemoveAt) {
  failures.push('Team removal events must publish only after member and credential persistence complete')
}

if (failures.length) {
  console.error('Team real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Team real-time event checks passed')
