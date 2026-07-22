import { paths, readJson, safeName } from './storage.js'
import { normaliseWebsiteCapabilities } from './websiteCapabilities.js'

const ROUTE_CAPABILITIES = [
  { prefix: '/assets', capability: 'media' },
  { prefix: '/forms', capability: 'forms' },
  { prefix: '/cms', capability: 'website' },
  { prefix: '/team', capability: 'team' },
  { prefix: '/support', capability: 'support' },
  { prefix: '/orders', capability: 'commerce' },
  { prefix: '/order-refunds', capability: 'commerce' },
  { prefix: '/inventory', capability: 'commerce' },
  { prefix: '/commerce-settings', capability: 'commerce' },
  { prefix: '/content', capability: 'website' },
  { prefix: '/publish', capability: 'website' },
]

function routeCapability(pathname = '') {
  return ROUTE_CAPABILITIES.find(rule => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) || null
}

function pathWebsiteId(pathname = '') {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'assets') return safeName(parts[2] || '')
  if (['content', 'forms', 'cms', 'commerce-settings'].includes(parts[0])) return safeName(parts[1] || '')
  return ''
}

function requestedWebsiteId(req) {
  return safeName(pathWebsiteId(req.path) || req.body?.websiteId || req.query?.websiteId || '')
}

function sessionWebsiteIds(session = {}) {
  if (Array.isArray(session.websiteIds)) return session.websiteIds.map(safeName).filter(Boolean)
  return session.websiteId ? [safeName(session.websiteId)] : []
}

function hasSessionCapability(session = {}, capability) {
  return Array.isArray(session.websiteCapabilities) && session.websiteCapabilities.includes(capability)
}

export function createCapabilityAccessGuard() {
  return async function capabilityAccessGuard(req, res, next) {
    if (req.session?.role === 'owner') return next()

    const rule = routeCapability(req.path)
    if (!rule) return next()

    try {
      const targetWebsiteId = requestedWebsiteId(req)
      const assigned = new Set(sessionWebsiteIds(req.session))

      if (targetWebsiteId) {
        if (!assigned.has(targetWebsiteId)) {
          return res.status(403).json({ error: 'Website access denied' })
        }

        const websites = await readJson(paths.websites(), [])
        const website = websites.find(site => safeName(site?.id) === targetWebsiteId)
        if (!website) return res.status(404).json({ error: 'Website not found' })

        const capabilities = normaliseWebsiteCapabilities(website.capabilities)
        if (!capabilities.includes(rule.capability)) {
          return res.status(403).json({ error: 'This tool is not enabled for your website' })
        }

        return next()
      }

      if (!hasSessionCapability(req.session, rule.capability)) {
        return res.status(403).json({ error: 'This tool is not enabled for your website' })
      }

      next()
    } catch (error) {
      console.error('Unable to verify website capability access:', error)
      res.status(503).json({ error: 'Website tools could not be verified' })
    }
  }
}
