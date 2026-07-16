import crypto from 'node:crypto'
import { promisify } from 'node:util'
import path from 'node:path'
import { DATA_DIR, paths, readJson, safeName, writeJson } from './storage.js'

const scrypt = promisify(crypto.scrypt)
const CREDENTIAL_FILE = path.join(DATA_DIR, 'credentials.json')
const KEY_LENGTH = 64
const HASH_PREFIX = 'scrypt-v1'

function credentialId(value) {
  return safeName(value || '')
}

export async function hashPassword(password) {
  const value = String(password || '')
  if (value.length < 8) throw new Error('Password must be at least 8 characters')
  const salt = crypto.randomBytes(16)
  const derived = await scrypt(value, salt, KEY_LENGTH)
  return `${HASH_PREFIX}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`
}

export async function verifyPassword(password, encoded) {
  const [prefix, saltValue, hashValue] = String(encoded || '').split('$')
  if (prefix !== HASH_PREFIX || !saltValue || !hashValue) return false
  try {
    const expected = Buffer.from(hashValue, 'base64url')
    const actual = Buffer.from(await scrypt(String(password || ''), Buffer.from(saltValue, 'base64url'), expected.length))
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export async function getCredential(accountId) {
  const credentials = await readJson(CREDENTIAL_FILE, {})
  return credentials[credentialId(accountId)] || null
}

export async function setPassword(accountId, password) {
  const id = credentialId(accountId)
  if (!id) throw new Error('Account id is required')
  const credentials = await readJson(CREDENTIAL_FILE, {})
  const record = {
    passwordHash: await hashPassword(password),
    updatedAt: new Date().toISOString(),
  }
  await writeJson(CREDENTIAL_FILE, { ...credentials, [id]: record })
  return record
}

export async function removeCredential(accountId) {
  const id = credentialId(accountId)
  const credentials = await readJson(CREDENTIAL_FILE, {})
  if (!credentials[id]) return false
  const next = { ...credentials }
  delete next[id]
  await writeJson(CREDENTIAL_FILE, next)
  return true
}

export async function migratePlaintextCredentials() {
  const accounts = await readJson(paths.clients(), [])
  const credentials = await readJson(CREDENTIAL_FILE, {})
  let accountChanged = false
  let credentialChanged = false

  const migrated = []
  for (const account of accounts) {
    const id = credentialId(account.id)
    const plaintext = String(account.password || account.accessCode || '')
    if (id && plaintext && !credentials[id]?.passwordHash) {
      credentials[id] = {
        passwordHash: await hashPassword(plaintext),
        updatedAt: new Date().toISOString(),
        migratedAt: new Date().toISOString(),
      }
      credentialChanged = true
    }

    if ('password' in account || 'accessCode' in account) {
      const safeAccount = { ...account }
      delete safeAccount.password
      delete safeAccount.accessCode
      migrated.push(safeAccount)
      accountChanged = true
    } else {
      migrated.push(account)
    }
  }

  if (credentialChanged) await writeJson(CREDENTIAL_FILE, credentials)
  if (accountChanged) await writeJson(paths.clients(), migrated)
  return { accountsMigrated: accountChanged, credentialsCreated: credentialChanged }
}
