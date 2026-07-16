const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function configuredOrigins() {
  return new Set(
    [process.env.KSJ_PORTAL_ORIGIN, ...(process.env.KSJ_ALLOWED_ORIGINS || '').split(',')]
      .map(value => String(value || '').trim())
      .filter(Boolean),
  )
}

function isLocalDevelopmentOrigin(origin) {
  if (process.env.NODE_ENV === 'production') return false
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function originAllowed(origin) {
  if (!origin) return process.env.NODE_ENV !== 'production'
  if (isLocalDevelopmentOrigin(origin)) return true
  return configuredOrigins().has(origin)
}

export function trustedOriginGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next()

  const origin = String(req.headers.origin || '').trim()
  if (originAllowed(origin)) return next()

  return res.status(403).json({ error: 'This request did not come from an approved KSJ Digital workspace.' })
}

export const trustedOriginPolicy = {
  safeMethods: [...SAFE_METHODS],
  productionRequiresOrigin: true,
}
