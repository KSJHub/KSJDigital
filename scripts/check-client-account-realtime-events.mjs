import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/services/clientAccountService.js', import.meta.url), 'utf8')
const start = await fs.readFile(new URL('../server/start.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { revokeAccountSessions } from './authPersistenceService.js'",
  "import { removeCredential, setPassword } from '../credentialStore.js'",
  "import { publishDomainEvent } from './realtimeDomainEventService.js'",
  "publishClientAccountEvent('client-account.created'",
  "publishClientAccountEvent('client-account.updated'",
  "publishClientAccountEvent('client-account.deleted'",
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
  'password:',
  'accessCode:',
  '.password',
  '.accessCode',
  'email:',
  'name:',
  'client.id',
  'current.id',
  'websiteId:',
  'websiteIds:',
  'session:',
  'cookie:',
  'authorization:',
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

const createStart = source.indexOf('export async function createClientAccount(')
const createEnd = source.indexOf('\nexport async function updateClientAccount', createStart)
const createSource = createStart >= 0 && createEnd > createStart ? source.slice(createStart, createEnd) : ''
const createWriteAt = createSource.indexOf('await writeJson(paths.clients(), [...clients, client])')
const createPublishAt = createSource.indexOf("await publishClientAccountEvent('client-account.created'")
if (createWriteAt < 0 || createPublishAt < createWriteAt) {
  failures.push('Client account creation events must publish after account persistence')
}
if (!createSource.includes("if (clients.some(item => item.id === id)) return res.status(409)")) {
  failures.push('Duplicate client account creation must not persist or publish')
}
if (!createSource.includes("if (!password) return res.status(422)")) {
  failures.push('Client account creation without a password must not persist or publish')
}

const updateStart = source.indexOf('export async function updateClientAccount(')
const updateEnd = source.indexOf('\nexport async function deleteClientAccount', updateStart)
const updateSource = updateStart >= 0 && updateEnd > updateStart ? source.slice(updateStart, updateEnd) : ''
const updateWriteAt = updateSource.indexOf('await writeJson(paths.clients(), clients.map(')
const updateRevokeAt = updateSource.indexOf('await revokeAccountSessions(current.id,')
const updatePublishAt = updateSource.indexOf("await publishClientAccountEvent('client-account.updated'")
if (updateWriteAt < 0 || updatePublishAt < updateWriteAt) {
  failures.push('Client account update events must publish after account persistence')
}
if (updateRevokeAt < updateWriteAt || updatePublishAt < updateRevokeAt) {
  failures.push('Client account updates must revoke existing sessions after persistence and before publishing completion')
}
if (!updateSource.includes("password ? 'account-credentials-changed' : 'account-access-changed'")) {
  failures.push('Client account session revocation must distinguish credential and access changes')
}
if (!updateSource.includes('const profileChanged = accountStateChanged(current, proposedClient)')) {
  failures.push('Client account updates must compare semantic profile state before persistence')
}
if (!updateSource.includes('if (!password && !profileChanged) return res.json(sanitise(current))')) {
  failures.push('Client account updates must not persist or publish when profile and password are unchanged')
}
if (!updateSource.includes('if (password) await setPassword(')) {
  failures.push('Password-only client account updates must remain valid persisted changes')
}

const deleteStart = source.indexOf('export async function deleteClientAccount(')
const deleteSource = deleteStart >= 0 ? source.slice(deleteStart) : ''
const deleteWriteAt = deleteSource.indexOf('await writeJson(paths.clients(), clients.filter(')
const deleteCredentialAt = deleteSource.indexOf('await removeCredential(current.id)')
const deleteRevokeAt = deleteSource.indexOf("await revokeAccountSessions(current.id, 'account-deleted')")
const deletePublishAt = deleteSource.indexOf("await publishClientAccountEvent('client-account.deleted'")
if (deleteWriteAt < 0 || deleteCredentialAt < deleteWriteAt || deleteRevokeAt < deleteCredentialAt || deletePublishAt < deleteRevokeAt) {
  failures.push('Client account deletion must persist deletion, remove credentials, revoke sessions, then publish completion')
}
if (!deleteSource.includes("if (!current) return res.status(404).json({ error: 'Client not found' })")) {
  failures.push('Client account deletion must reject unknown accounts before changing state')
}
for (const marker of [
  "import { createClientAccount, deleteClientAccount, updateClientAccount } from './services/clientAccountService.js'",
  'const originalDelete = express.application.delete',
  "if (args[0] === '/api/clients/:id') return originalDelete.call(this, args[0], deleteClientAccount)",
  'express.application.delete = originalDelete',
]) {
  if (!start.includes(marker)) failures.push(`Client account deletion routing marker is missing: ${marker}`)
}

if (failures.length) {
  console.error('Client account real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Client account real-time event checks passed')
