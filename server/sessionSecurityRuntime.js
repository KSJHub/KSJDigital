import express from 'express'

const SESSION_COOKIE = 'ksj_session'
const IDLE_TIMEOUT_MS = 30 * 60 * 1000
const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000
const sessions = new Map()

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map(cookie => cookie.trim().split('='))
      .filter(parts => parts[0])
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]),
  )
}

function tokenFromRequest(req) {
  return parseCookies(req.headers.cookie || '')[SESSION_COOKIE] || ''
}

function tokenFromSetCookie(value) {
  const header = Array.isArray(value) ? value.find(item => String(item).startsWith(`${SESSION_COOKIE}=`)) : value
  if (!header) return ''
  const first = String(header).split(';')[0]
  const separator = first.indexOf('=')
  return separator >= 0 ? decodeURIComponent(first.slice(separator + 1)) : ''
}

function clearCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`)
}

function sessionExpired(record, now = Date.now()) {
  return !record || now - record.lastSeenAt > IDLE_TIMEOUT_MS || now - record.createdAt > ABSOLUTE_TIMEOUT_MS
}

function enforceSessionLifetime(req, res, next) {
  const token = tokenFromRequest(req)
  if (!token) return next()

  const record = sessions.get(token)
  if (sessionExpired(record)) {
    sessions.delete(token)
    clearCookie(res)
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  }

  record.lastSeenAt = Date.now()
  next()
}

const originalPost = express.application.post
const originalGet = express.application.get
const originalUse = express.application.use

express.application.post = function secureSessionPost(path, ...handlers) {
  if (path === '/api/login') {
    return originalPost.call(this, path, ...handlers.map((handler, index) => {
      if (index !== handlers.length - 1) return handler
      return async function sessionIssuingLogin(req, res, next) {
        res.once('finish', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return
          const token = tokenFromSetCookie(res.getHeader('Set-Cookie'))
          if (token) sessions.set(token, { createdAt: Date.now(), lastSeenAt: Date.now() })
        })
        return handler(req, res, next)
      }
    }))
  }

  if (path === '/api/logout') {
    return originalPost.call(this, path, (req, _res, next) => {
      const token = tokenFromRequest(req)
      if (token) sessions.delete(token)
      next()
    }, ...handlers)
  }

  return originalPost.call(this, path, ...handlers)
}

express.application.get = function secureSessionGet(path, ...handlers) {
  if (path === '/api/me') return originalGet.call(this, path, enforceSessionLifetime, ...handlers)
  return originalGet.call(this, path, ...handlers)
}

express.application.use = function secureSessionUse(...args) {
  const mountPath = typeof args[0] === 'string' ? args[0] : ''
  const middleware = mountPath ? args[1] : args[0]
  if (mountPath === '/api' && middleware?.name === 'requireSession') {
    return originalUse.call(this, '/api', enforceSessionLifetime, ...args.slice(1))
  }
  return originalUse.apply(this, args)
}

export const sessionSecurityPolicy = {
  idleTimeoutMs: IDLE_TIMEOUT_MS,
  absoluteTimeoutMs: ABSOLUTE_TIMEOUT_MS,
}
