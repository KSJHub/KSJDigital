import express from 'express'
import { runVerifiedLogin } from './credentialContext.js'
import { getCredential, verifyPassword } from './credentialStore.js'
import { paths, readJson, safeName } from './storage.js'

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

function recordOutcome(res, key) {
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
}

export async function loginAttemptGuard(req, res, next) {
  const now = Date.now()
  const key = clientKey(req)
  const record = currentRecord(key, now)

  if (record.lockedUntil > now) {
    const retryAfter = retryAfterSeconds(record, now)
    res.setHeader('Retry-After', String(retryAfter))
    return res.status(429).json({ error: 'Too many login attempts. Please wait before trying again.' })
  }

  recordOutcome(res, key)

  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const accounts = await readJson(paths.clients(), [])
  const account = accounts.find(item => String(item.email || '').trim().toLowerCase() === email)
  const credential = account ? await getCredential(account.id) : null
  const verified = Boolean(account && credential?.passwordHash && await verifyPassword(password, credential.passwordHash))

  if (!verified) return res.status(401).json({ error: 'Invalid email or password' })

  return runVerifiedLogin({
    verified: true,
    accountId: safeName(account.id),
    email,
    password,
  }, next)
}

const originalPost = express.application.post

express.application.post = function guardedPost(path, ...handlers) {
  if (path === '/api/login') {
    return originalPost.call(this, path, loginAttemptGuard, ...handlers)
  }
  return originalPost.call(this, path, ...handlers)
}
