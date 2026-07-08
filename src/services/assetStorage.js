const DB_NAME = 'ksjDigitalAssetStorage'
const DB_VERSION = 1
const STORE = 'assets'
export const USER_STORAGE_LIMIT = 2 * 1024 * 1024 * 1024

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('ownerId', 'ownerId')
        store.createIndex('websiteId', 'websiteId')
        store.createIndex('slotId', 'slotId')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function tx(mode = 'readonly') {
  const db = await openDb()
  return db.transaction(STORE, mode).objectStore(STORE)
}

function asPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getAllAssets() {
  return asPromise((await tx()).getAll())
}

export async function getAssetsForWebsite(websiteId) {
  const all = await getAllAssets()
  return all.filter(asset => asset.websiteId === websiteId)
}

export async function getStorageUsed(ownerId = 'default') {
  const all = await getAllAssets()
  return all
    .filter(asset => asset.ownerId === ownerId)
    .reduce((total, asset) => total + (asset.size || 0), 0)
}

export async function saveAsset({ ownerId = 'default', websiteId = 'system', slotId, file }) {
  const used = await getStorageUsed(ownerId)
  if (used + file.size > USER_STORAGE_LIMIT) {
    throw new Error('Storage limit reached. Each user is limited to 2GB.')
  }
  const existing = (await getAssetsForWebsite(websiteId)).find(asset => asset.slotId === slotId)
  const asset = {
    id: `${ownerId}:${websiteId}:${slotId}`,
    ownerId,
    websiteId,
    slotId,
    name: file.name,
    type: file.type || 'Unknown',
    size: file.size,
    blob: file,
    updatedAt: new Date().toLocaleString(),
    version: (existing?.version || 0) + 1,
    history: existing
      ? [
          ...(existing.history || []),
          {
            name: existing.name,
            size: existing.size,
            type: existing.type,
            updatedAt: existing.updatedAt,
            version: existing.version,
          },
        ]
      : [],
  }
  await asPromise((await tx('readwrite')).put(asset))
  window.dispatchEvent(new CustomEvent('ksj-brand-updated', { detail: asset }))
  return asset
}

export async function removeAsset(ownerId = 'default', websiteId = 'system', slotId) {
  const result = await asPromise(
    (await tx('readwrite')).delete(`${ownerId}:${websiteId}:${slotId}`),
  )
  window.dispatchEvent(new CustomEvent('ksj-brand-updated'))
  return result
}

export async function getAsset(ownerId = 'default', websiteId = 'system', slotId) {
  return asPromise((await tx()).get(`${ownerId}:${websiteId}:${slotId}`))
}

export async function getLatestSystemLogoAsset() {
  const all = await getAllAssets()
  return all
    .filter(
      asset =>
        asset.websiteId === 'system' &&
        asset.slotId === 'primaryLogo' &&
        asset.type?.startsWith('image/'),
    )
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]
}

export function createAssetUrl(asset) {
  return asset?.blob ? URL.createObjectURL(asset.blob) : ''
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function storagePercent(bytes = 0) {
  return Math.min(100, Math.round((bytes / USER_STORAGE_LIMIT) * 100))
}
