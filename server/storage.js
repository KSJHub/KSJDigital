import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const DATA_DIR = path.resolve(process.cwd(), 'server-data')
export const ASSET_DIR = path.join(DATA_DIR, 'assets')
export const STORAGE_LIMIT_BYTES = 2147483648

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

  try {
    return JSON.parse(source)
  } catch (error) {
    throw new Error(`Stored JSON is invalid: ${path.relative(DATA_DIR, file)}`, { cause: error })
  }
}

export async function writeJson(file, data) {
  await ensureDir(path.dirname(file))
  const temporaryFile = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  const payload = JSON.stringify(data, null, 2)

  try {
    await fs.writeFile(temporaryFile, payload, { encoding: 'utf8', flag: 'wx' })
    await fs.rename(temporaryFile, file)
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
  clients: () => path.join(DATA_DIR, 'clients.json'),
  content: websiteId => path.join(DATA_DIR, 'content', `${safeName(websiteId)}.json`),
  forms: websiteId => path.join(DATA_DIR, 'forms', `${safeName(websiteId)}.json`),
  tickets: () => path.join(DATA_DIR, 'support-tickets.json'),
  requests: () => path.join(DATA_DIR, 'publish-requests.json'),
  history: () => path.join(DATA_DIR, 'publish-history.json'),
  orders: () => path.join(DATA_DIR, 'orders.json'),
  orderEvents: () => path.join(DATA_DIR, 'order-events.json'),
  notificationLog: () => path.join(DATA_DIR, 'order-notifications.json'),
  stockReservations: () => path.join(DATA_DIR, 'stock-reservations.json'),
  commerceSettings: websiteId =>
    path.join(DATA_DIR, 'commerce-settings', `${safeName(websiteId)}.json`),
  manifest: ownerId => path.join(assetManifestDir, `${safeName(ownerId)}.json`),
}
