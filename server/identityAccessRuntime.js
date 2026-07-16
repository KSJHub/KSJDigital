import express from 'express'
import { starterClients, starterWebsites } from './defaults.js'
import { paths, readJson, safeName, writeJson } from './storage.js'
import { normaliseWebsiteCapabilities } from './websiteCapabilities.js'

const PLATFORM_ACCOUNT_ID = 'morgan'
const PLATFORM_DISPLAY_NAME = 'KSJ Digital'
const ACCESS_PERMISSIONS = [
  'canEdit',
  'canManagePages',
  'canRequestUpdates',
  'canManageMedia',
  'canViewSupport',
  'canManageTeam',
]

function normaliseRole(account = {}) {
  const role = String(account.role || '').trim().toLowerCase().replace(/[ _-]+/g, '_')
  if (account.id === PLATFORM_ACCOUNT_ID || role === 'platform_owner') return 'owner'
  return 'client'
}

function normalisePermissions(account = {}, role = normaliseRole(account)) {
  const readOnly = String(account.access || '').trim().toLowerCase() === 'read only'
  return Object.fromEntries(
    ACCESS_PERMISSIONS.map(permission => {
      if (role === 'owner') return [permission, true]
      if (typeof account[permission] === 'boolean') return [permission, account[permission]]
      if (permission === 'canManageTeam') return [permission, String(account.roleLabel || '').trim() === 'Website Owner']
      return [permission, !readOnly]
    }),
  )
}

function normaliseAccount(account = {}) {
  const platformOwner = account.id === PLATFORM_ACCOUNT_ID
  const role = normaliseRole(account)
  const websiteIds = Array.isArray(account.websiteIds)
    ? account.websiteIds.map(safeName).filter(Boolean)
    : account.websiteId
      ? [safeName(account.websiteId)]
      : []

  return {
    ...account,
    name: platformOwner ? PLATFORM_DISPLAY_NAME : account.name,
    displayName: platformOwner ? PLATFORM_DISPLAY_NAME : (account.displayName || account.name),
    role,
    roleLabel: platformOwner ? 'Platform Owner' : (account.roleLabel || 'Website Owner'),
    access: platformOwner ? 'Platform administration' : (account.access || 'Full website access'),
    websiteIds,
    websiteId: websiteIds[0] || '',
    ...normalisePermissions(account, role),
  }
}

async function migrateAccounts() {
  const stored = await readJson(paths.clients(), null)
  const source = Array.isArray(stored) ? stored : starterClients
  const migrated = source.map(account => {
    if (account.id === PLATFORM_ACCOUNT_ID) {
      const assigned = Array.isArray(account.websiteIds) && account.websiteIds.length
        ? account.websiteIds
        : starterWebsites.map(site => site.id)
      return normaliseAccount({ ...account, name: PLATFORM_DISPLAY_NAME, role: 'owner', websiteIds: assigned })
    }

    const assigned = Array.isArray(account.websiteIds) && account.websiteIds.length
      ? account.websiteIds
      : account.websiteId
        ? [account.websiteId]
        : account.id === 'taj'
          ? ['twotonetaj']
          : []

    return normaliseAccount({
      ...account,
      role: 'client',
      roleLabel: account.roleLabel || (account.id === 'taj' ? 'Website Owner' : 'Website Editor'),
      access: account.access === 'Read only' ? 'Read only' : 'Full website access',
      websiteIds: assigned.filter(id => id !== 'ksjdigital'),
    })
  })

  await writeJson(paths.clients(), migrated)
}

async function migrateWebsiteIdentity() {
  const stored = await readJson(paths.websites(), null)
  const source = Array.isArray(stored) ? stored : starterWebsites
  const defaults = new Map(starterWebsites.map(site => [site.id, site]))
  const migrated = source.map(site => {
    const fallback = defaults.get(site.id) || {}
    return {
      ...site,
      developmentEditorUrl: site.developmentEditorUrl || fallback.developmentEditorUrl || '',
      capabilities: normaliseWebsiteCapabilities(site.capabilities || fallback.capabilities),
      ...(site.id === 'ksjdigital' ? { owner: PLATFORM_DISPLAY_NAME, notes: 'KSJ Digital platform website' } : {}),
    }
  })
  await writeJson(paths.websites(), migrated)
}

await Promise.all([migrateAccounts(), migrateWebsiteIdentity()])

const originalGet = express.application.get

express.application.get = function scopedGet(path, ...handlers) {
  if (path !== '/api/websites') return originalGet.call(this, path, ...handlers)

  return originalGet.call(this, path, async (req, res) => {
    try {
      const websites = await readJson(paths.websites(), starterWebsites)
      const allowed = new Set((req.session?.websiteIds || []).map(safeName))
      const visible = websites.filter(site => allowed.has(safeName(site.id)))
      return res.json(visible)
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Website access unavailable' })
    }
  })
}
