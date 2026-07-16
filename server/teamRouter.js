import express from 'express'
import crypto from 'node:crypto'
import { paths, readJson, safeName, writeJson } from './storage.js'

const TEAM_PERMISSIONS = ['canEdit', 'canManagePages', 'canManageMedia', 'canRequestUpdates', 'canViewSupport', 'canManageTeam']

function websiteIds(account = {}) {
  if (Array.isArray(account.websiteIds)) return account.websiteIds.map(safeName).filter(Boolean)
  return account.websiteId ? [safeName(account.websiteId)] : []
}

function sharesWebsite(account, member) {
  const allowed = new Set(websiteIds(account))
  return websiteIds(member).some(id => allowed.has(id))
}

function sanitise(member = {}) {
  const { password, accessCode, ...safe } = member
  return safe
}

function canManageTeam(session = {}) {
  return session.role === 'owner' || session.canManageTeam === true || session.roleLabel === 'Website Owner'
}

function boundedPermissions(session, payload = {}) {
  const result = {}
  TEAM_PERMISSIONS.forEach(permission => {
    result[permission] = session.role === 'owner'
      ? payload[permission] === true
      : session[permission] === true && payload[permission] === true
  })
  return result
}

function teamScope(session, members) {
  if (session.role === 'owner') return members.filter(member => member.role !== 'owner')
  return members.filter(member => member.role !== 'owner' && sharesWebsite(session, member))
}

export function createTeamRouter() {
  const router = express.Router()

  router.get('/', async (req, res) => {
    const members = await readJson(paths.clients(), [])
    res.json(teamScope(req.session, members).map(sanitise))
  })

  router.post('/', async (req, res) => {
    if (!canManageTeam(req.session)) return res.status(403).json({ error: 'Team management permission required' })

    const assigned = websiteIds(req.session)
    const requestedWebsite = safeName(req.body?.websiteId || assigned[0])
    if (req.session.role !== 'owner' && !assigned.includes(requestedWebsite)) {
      return res.status(403).json({ error: 'Website access denied' })
    }

    const email = String(req.body?.email || '').trim().toLowerCase()
    const accessCode = String(req.body?.accessCode || '')
    if (!email) return res.status(400).json({ error: 'Email is required' })
    if (accessCode.length < 8) return res.status(400).json({ error: 'Temporary password must be at least 8 characters' })

    const members = await readJson(paths.clients(), [])
    if (members.some(member => String(member.email || '').toLowerCase() === email)) {
      return res.status(409).json({ error: 'A user with this email already exists' })
    }

    const permissions = boundedPermissions(req.session, req.body)
    const member = {
      id: safeName(req.body?.name || email.split('@')[0] || crypto.randomUUID()),
      name: String(req.body?.name || 'Team Member').trim(),
      displayName: String(req.body?.name || 'Team Member').trim(),
      email,
      accessCode,
      role: 'client',
      roleLabel: req.body?.roleLabel || 'Website Editor',
      access: 'Team access',
      status: 'Active',
      websiteId: requestedWebsite,
      websiteIds: [requestedWebsite],
      ...permissions,
    }

    if (members.some(item => item.id === member.id)) member.id = `${member.id}-${Date.now()}`
    await writeJson(paths.clients(), [...members, member])
    res.json(sanitise(member))
  })

  router.patch('/:id', async (req, res) => {
    if (!canManageTeam(req.session)) return res.status(403).json({ error: 'Team management permission required' })
    if (safeName(req.params.id) === safeName(req.session.id)) return res.status(400).json({ error: 'Use Account Settings to change your own account' })

    const members = await readJson(paths.clients(), [])
    const existing = members.find(member => safeName(member.id) === safeName(req.params.id))
    if (!existing || existing.role === 'owner' || (req.session.role !== 'owner' && !sharesWebsite(req.session, existing))) {
      return res.status(404).json({ error: 'Team member not found' })
    }

    const permissions = boundedPermissions(req.session, req.body)
    const updated = {
      ...existing,
      name: String(req.body?.name ?? existing.name).trim(),
      displayName: String(req.body?.name ?? existing.displayName ?? existing.name).trim(),
      roleLabel: req.body?.roleLabel || existing.roleLabel,
      status: ['Active', 'Suspended'].includes(req.body?.status) ? req.body.status : existing.status,
      ...permissions,
      role: 'client',
      websiteId: existing.websiteId,
      websiteIds: existing.websiteIds,
    }
    if (req.body?.accessCode) {
      if (String(req.body.accessCode).length < 8) return res.status(400).json({ error: 'Temporary password must be at least 8 characters' })
      updated.accessCode = String(req.body.accessCode)
    }

    await writeJson(paths.clients(), members.map(member => member.id === existing.id ? updated : member))
    res.json(sanitise(updated))
  })

  router.delete('/:id', async (req, res) => {
    if (!canManageTeam(req.session)) return res.status(403).json({ error: 'Team management permission required' })
    if (safeName(req.params.id) === safeName(req.session.id)) return res.status(400).json({ error: 'You cannot remove your own account' })

    const members = await readJson(paths.clients(), [])
    const existing = members.find(member => safeName(member.id) === safeName(req.params.id))
    if (!existing || existing.role === 'owner' || (req.session.role !== 'owner' && !sharesWebsite(req.session, existing))) {
      return res.status(404).json({ error: 'Team member not found' })
    }

    await writeJson(paths.clients(), members.filter(member => member.id !== existing.id))
    res.json({ ok: true })
  })

  return router
}
