import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { currentVerifiedLogin } from './credentialContext.js'

export const DATA_DIR = path.resolve(process.cwd(), 'server-data')
export const ASSET_DIR = path.join(DATA_DIR, 'assets')
export const BACKUP_DIR = path.join(DATA_DIR, 'backups')
export const STORAGE_LIMIT_BYTES = 2147483648

const TRANSIENT_FILE_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES'])
const WRITE_RETRY_DELAYS = [40, 100, 220, 450, 900]
const BACKUP_RETENTION_PER_FILE = 20
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json')

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

export async function readJson(file, fallback) {
  let source
  try {
    source = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new Error(`Stored JSON is invalid: ${path.relative(DATA_DIR, file)}`, { cause: error })
  }

  const login = currentVerifiedLogin()
  if (login?.verified && path.resolve(file) === CLIENTS_FILE && Array.isArray(parsed)) {
    return parsed.map(account => (
      String(account.email || '').trim().toLowerCase() === login.email
        ? { ...account, accessCode: login.password }
        : account
    ))
  }

  return parsed
}

function pause(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function replaceFileWithRetry(temporaryFile, file) {
  for (const delay of WRITE_RETRY_DELAYS) {
    try {
      await fs.rename(temporaryFile, file)
      return
    } catch (error) {
      if (!TRANSIENT_FILE_ERRORS.has(error?.code)) throw error
      await pause(delay)
    }
  }

  try {
    await fs.copyFile(temporaryFile, file)
    await fs.rm(temporaryFile, { force: true })
  } catch (error) {
    throw new Error(`Could not update ${path.relative(DATA_DIR, file)} because Windows or OneDrive kept the file locked`, {
      cause: error,
    })
  }
}

function isManagedJsonFile(file) {
  const resolved = path.resolve(file)
  const relative = path.relative(DATA_DIR, resolved)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) && resolved.endsWith('.json') && !resolved.startsWith(BACKUP_DIR)
}

function backupFolderFor(file) {
  const relative = path.relative(DATA_DIR, file)
  return path.join(BACKUP_DIR, path.dirname(relative), path.basename(relative, '.json'))
}

async function pruneBackups(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(error => {
    if (error?.code === 'ENOENT') return []
    throw error
  })
  const files = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort()
    .reverse()

  await Promise.all(files.slice(BACKUP_RETENTION_PER_FILE).map(name => fs.rm(path.join(folder, name), { force: true })))
}

async function backupExistingJson(file, nextPayload) {
  if (!isManagedJsonFile(file)) return

  let existing
  try {
    existing = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  if (existing === nextPayload) return

  try {
    JSON.parse(existing)
  } catch {
    return
  }

  const folder = backupFolderFor(file)
  await ensureDir(folder)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(folder, `${timestamp}-${crypto.randomBytes(4).toString('hex')}.json`)
  await fs.writeFile(backupFile, existing, { encoding: 'utf8', flag: 'wx' })
  await pruneBackups(folder)
}

export async function writeJson(file, data) {
  await ensureDir(path.dirname(file))
  const temporaryFile = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  const payload = JSON.stringify(data, null, 2)

  try {
    await backupExistingJson(file, payload)
    await fs.writeFile(temporaryFile, payload, { encoding: 'utf8', flag: 'wx' })
    JSON.parse(await fs.readFile(temporaryFile, 'utf8'))
    await replaceFileWithRetry(temporaryFile, file)
  } catch (error) {
    await fs.rm(temporaryFile, { force: true }).catch(() => {})
    throw error
  }

  return data
}

export async function getFolderSize(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    let total = 0

    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      total += entry.isDirectory() ? await getFolderSize(full) : (await fs.stat(full)).size
    }

    return total
  } catch {
    return 0
  }
}

export function safeName(value = 'file') {
  return (
    value
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'file'
  )
}

const assetManifestDir = path.join(DATA_DIR, 'asset-manifests')

export async function readWebsiteAssets(websiteId) {
  const safeWebsiteId = safeName(websiteId)
  let files
  try {
    files = await fs.readdir(assetManifestDir)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }

  const manifests = await Promise.all(
    files
      .filter(file => file.endsWith('.json'))
      .map(file => readJson(path.join(assetManifestDir, file), [])),
  )

  const seen = new Set()
  return manifests
    .flat()
    .filter(asset => safeName(asset?.websiteId) === safeWebsiteId)
    .filter(asset => {
      const key = asset.id || asset.url
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
}

export const paths = {
  websites: () => path.join(DATA_DIR, 'websites.json'),
  clients: () => CLIENTS_FILE,
  content: websiteId => path.join(DATA_DIR, 'content', `${safeName(websiteId)}.json`),
  publishedContent: websiteId => path.join(DATA_DIR, 'published-content', `${safeName(websiteId)}.json`),
  forms: websiteId => path.join(DATA_DIR, 'forms', `${safeName(websiteId)}.json`),
  tickets: () => path.join(DATA_DIR, 'support-tickets.json'),
  requests: () => path.join(DATA_DIR, 'publish-requests.json'),
  history: () => path.join(DATA_DIR, 'publish-history.json'),
  orders: () => path.join(DATA_DIR, 'orders.json'),
  orderEvents: () => path.join(DATA_DIR, 'order-events.json'),
  notificationLog: () => path.join(DATA_DIR, 'order-notifications.json'),
  stockReservations: () => path.join(DATA_DIR, 'stock-reservations.json'),
  checkoutBaskets: () => path.join(DATA_DIR, 'checkout-baskets.json'),
  commerceSettings: websiteId =>
    path.join(DATA_DIR, 'commerce-settings', `${safeName(websiteId)}.json`),
  manifest: ownerId => path.join(assetManifestDir, `${safeName(ownerId)}.json`),
}
