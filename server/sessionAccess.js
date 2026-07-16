import { paths, readJson, safeName } from './storage.js'

const ACCESS_PERMISSIONS = [
  'canEdit',
  'canManagePages',
  'canManageMedia',
  'canRequestUpdates',
  'canViewSupport',
]

function currentWebsiteIds(account, websites) {
  const role = String(account.role || '').toLowerCase() === 'owner' ? 'owner' : 'client'
  if (role === 'owner') return websites.map(site => safeName(site.id)).filter(Boolean)

  const existing = new Set(websites.map(site => safeName(site.id)).filter(Boolean))
  const assigned = Array.isArray(account.websiteIds)
    ? account.websiteIds
    : account.websiteId
      ? [account.websiteId]
      : []

  return assigned
    .map(safeName)
    .filter(websiteId => existing.has(websiteId))
}

function permissionValue(account, permission, role) {
  if (role === 'owner') return true
  if (typeof account[permission] === 'boolean') return account[permission]
  return String(account.access || '').trim().toLowerCase() !== 'read only'
}

export function createLiveSessionAccessMiddleware() {
  return async function refreshSessionAccess(req, res, next) {
    try {
      if (!req.session?.id) {
        return res.status(401).json({ error: 'Not signed in' })
      }

      const [accounts, websites] = await Promise.all([
        readJson(paths.clients(), []),
        readJson(paths.websites(), []),
      ])
      const account = accounts.find(item => safeName(item.id) === safeName(req.session.id))

      if (!account || account.status === 'Suspended') {
        return res.status(401).json({ error: 'This account is no longer active' })
      }

      const role = String(account.role || '').toLowerCase() === 'owner' ? 'owner' : 'client'
      const websiteIds = currentWebsiteIds(account, websites)
      const permissions = Object.fromEntries(
        ACCESS_PERMISSIONS.map(permission => [permission, permissionValue(account, permission, role)]),
      )

      Object.assign(req.session, {
        email: account.email,
        name: account.name,
        displayName: account.displayName || account.name,
        role,
        roleLabel: role === 'owner' ? 'Platform Owner' : (account.roleLabel || 'Website Owner'),
        websiteId: websiteIds[0] || '',
        websiteIds,
        canPublish: role === 'owner',
        canManageClients: role === 'owner',
        ...permissions,
      })

      if (req.method === 'GET' && req.path === '/session-access') {
        return res.json(req.session)
      }

      next()
    } catch (error) {
      console.error('Unable to refresh protected session access:', error)
      res.status(503).json({ error: 'Account permissions could not be verified' })
    }
  }
}
