import { paths, readJson, safeName } from './storage.js'

function currentWebsiteIds(account, websites) {
  const role = String(account.role || '').toLowerCase() === 'owner' ? 'owner' : 'client'
  if (role === 'owner') return websites.map(site => safeName(site.id)).filter(Boolean)

  const existing = new Set(websites.map(site => safeName(site.id)).filter(Boolean))
  return (account.websiteIds || [])
    .map(safeName)
    .filter(websiteId => existing.has(websiteId))
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

      Object.assign(req.session, {
        email: account.email,
        name: account.name,
        role,
        websiteId: websiteIds[0],
        websiteIds,
        canPublish: role === 'owner',
        canManageClients: role === 'owner',
        canEdit: role === 'owner' || account.canEdit === true,
        canManageMedia: role === 'owner' || account.canManageMedia === true,
        canRequestUpdates: role === 'owner' || account.canRequestUpdates === true,
        canViewSupport: role === 'owner' || account.canViewSupport === true,
      })

      next()
    } catch (error) {
      console.error('Unable to refresh protected session access:', error)
      res.status(503).json({ error: 'Account permissions could not be verified' })
    }
  }
}
