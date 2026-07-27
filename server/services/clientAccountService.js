import { setPassword } from '../credentialStore.js'
import { paths, readJson, safeName, writeJson } from '../storage.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'

function idFrom(value = 'new-record') { return safeName(value).replace(/[._]+/g, '-') }
function sanitise(client) { const { password, accessCode, ...safe } = client; return safe }
function requireOwner(req, res) { if (req.session?.role === 'owner') return true; res.status(403).json({ error: 'Owner access required' }); return false }
function accountFields(input = {}, existing = {}) {
  return {
    ...existing,
    name: input.name ?? existing.name ?? 'New Client',
    email: input.email === undefined ? existing.email || '' : String(input.email || '').trim().toLowerCase(),
    role: input.role ?? existing.role ?? 'client',
    websiteId: input.websiteId ?? existing.websiteId ?? '',
    websiteIds: input.websiteIds ?? existing.websiteIds ?? (input.websiteId ? [input.websiteId] : []),
    canEdit: input.canEdit === undefined ? existing.canEdit !== false : input.canEdit !== false,
    canManageMedia: input.canManageMedia === undefined ? existing.canManageMedia !== false : input.canManageMedia !== false,
    canRequestUpdates: input.canRequestUpdates === undefined ? existing.canRequestUpdates !== false : input.canRequestUpdates !== false,
    canViewSupport: input.canViewSupport === undefined ? existing.canViewSupport !== false : input.canViewSupport !== false,
  }
}
function accountState(client = {}) {
  return {
    name: client.name || '',
    email: client.email || '',
    role: client.role || 'client',
    websiteId: client.websiteId || '',
    websiteIds: Array.isArray(client.websiteIds) ? client.websiteIds : [],
    canEdit: client.canEdit !== false,
    canManageMedia: client.canManageMedia !== false,
    canRequestUpdates: client.canRequestUpdates !== false,
    canViewSupport: client.canViewSupport !== false,
  }
}
function accountStateChanged(current, updated) { return JSON.stringify(accountState(current)) !== JSON.stringify(accountState(updated)) }
function accountEventPayload(client, options = {}) {
  const websiteIds = new Set([client.websiteId, ...(Array.isArray(client.websiteIds) ? client.websiteIds : [])].filter(Boolean))
  const permissions = [client.canEdit, client.canManageMedia, client.canRequestUpdates, client.canViewSupport]
  return {
    role: String(client.role || 'client').slice(0, 50),
    websiteCount: websiteIds.size,
    enabledPermissionCount: permissions.filter(Boolean).length,
    passwordChanged: options.passwordChanged === true,
    forcePasswordReset: options.forcePasswordReset === true,
  }
}
async function publishClientAccountEvent(topic, payload) { await publishDomainEvent(topic, payload) }

export async function createClientAccount(req, res) {
  if (!requireOwner(req, res)) return
  const clients = await readJson(paths.clients(), [])
  const id = idFrom(req.body?.id || req.body?.name || `client-${Date.now()}`)
  if (clients.some(item => item.id === id)) return res.status(409).json({ error: 'Client ID already exists' })
  const password = String(req.body?.password || req.body?.accessCode || '')
  if (!password) return res.status(422).json({ error: 'Password is required' })
  const client = { id, ...accountFields(req.body), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  const forcePasswordReset = req.body?.forcePasswordReset === true
  await setPassword(id, password, { enforcePolicy: true, forcePasswordReset })
  await writeJson(paths.clients(), [...clients, client])
  await publishClientAccountEvent('client-account.created', accountEventPayload(client, { passwordChanged: true, forcePasswordReset }))
  return res.status(201).json(sanitise(client))
}

export async function updateClientAccount(req, res) {
  if (!requireOwner(req, res)) return
  const clients = await readJson(paths.clients(), [])
  const current = clients.find(item => item.id === req.params.id)
  if (!current) return res.status(404).json({ error: 'Client not found' })
  const password = String(req.body?.password || req.body?.accessCode || '')
  const forcePasswordReset = req.body?.forcePasswordReset === true
  const cleanInput = { ...req.body }; delete cleanInput.password; delete cleanInput.accessCode
  const proposedClient = { id: current.id, ...accountFields(cleanInput, current) }
  const profileChanged = accountStateChanged(current, proposedClient)
  if (!password && !profileChanged) return res.json(sanitise(current))
  if (password) await setPassword(current.id, password, { enforcePolicy: true, forcePasswordReset })
  const updatedClient = { ...proposedClient, updatedAt: new Date().toISOString() }
  await writeJson(paths.clients(), clients.map(item => item.id === current.id ? updatedClient : item))
  await publishClientAccountEvent('client-account.updated', accountEventPayload(updatedClient, { passwordChanged: Boolean(password), forcePasswordReset }))
  return res.json(sanitise(updatedClient))
}
