import fs from 'node:fs/promises'
import path from 'node:path'

export const DATA_DIR = path.resolve(process.cwd(), 'server-data')
export const ASSET_DIR = path.join(DATA_DIR, 'assets')
export const STORAGE_LIMIT_BYTES = 2147483648

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeJson(file, data) {
  await ensureDir(path.dirname(file))
  await fs.writeFile(file, JSON.stringify(data, null, 2))
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
  manifest: ownerId => path.join(DATA_DIR, 'asset-manifests', `${safeName(ownerId)}.json`),
}
