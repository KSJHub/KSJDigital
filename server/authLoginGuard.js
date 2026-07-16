import express from 'express'

const WINDOW_MS = 15 * 60 * 1000
const LOCK_MS = 30 * 60 * 1000
const MAX_FAILURES = 5
const attempts = new Map()

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const address = forwarded || req.ip || req.socket?.remoteAddress || 'unknown'
  const email = String(req.body?.email || '').trim().toLowerCase()
  return `${address}|${email || 'missing-email'}`
}

function currentRecord(key, now = Date.now()) {
  const record = attempts.get(key)
  if (!record) return { failures: 0, windowStartedAt: now, lockedUntil: 0 }
  if (record.lockedUntil > now) return record
  if (now - record.windowStartedAt >= WINDOW_MS) {
    attempts.delete(key)
    return { failures: 0, windowStartedAt: now, lockedUntil: 0 }
  }
  return record
}

function retryAfterSeconds(record, now = Date.now()) {
  return Math.max(1, Math.ceil((record.lockedUntil - now) / 1000))
}

export function loginAttemptGuard(req, res, next) {
  const now = Date.now()
  const key = clientKey(req)
  const record = currentRecord(key, now)

  if (record.lockedUntil > now) {
    const retryAfter = retryAfterSeconds(record, now)
    res.setHeader('Retry-After', String(retryAfter))
    return res.status(429).json({ error: 'Too many login attempts. Please wait before trying again.' })
  }

  res.once('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      attempts.delete(key)
      return
    }
    if (res.statusCode !== 401) return

    const latest = currentRecord(key)
    const failures = latest.failures + 1
    attempts.set(key, {
      failures,
      windowStartedAt: latest.windowStartedAt,
      lockedUntil: failures >= MAX_FAILURES ? Date.now() + LOCK_MS : 0,
    })
  })

  next()
}

const originalPost = express.application.post

express.application.post = function guardedPost(path, ...handlers) {
  if (path === '/api/login') {
    return originalPost.call(this, path, loginAttemptGuard, ...handlers)
  }
  return originalPost.call(this, path, ...handlers)
}
