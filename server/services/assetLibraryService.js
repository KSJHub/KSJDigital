import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR, paths, readJson, safeName, writeJson } from '../storage.js'
import { listContentTypes } from './contentTypeRegistry.js'

const librariesDir = path.join(DATA_DIR, 'asset-libraries')
const contentRecordsDir = path.join(DATA_DIR, 'content-records')
const mutations = new Map()
const VALID_KINDS = new Set(['image', 'document', 'video', 'audio', 'other'])

export class AssetLibraryError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'AssetLibraryError'
    this.status = status
    this.details = details
  }
}

function identity(value, label) {
  const id = safeName(value)
  if (!id) throw new AssetLibraryError(`${label} is required`)
  return id
}

function libraryPath(websiteId) {
  return path.join(librariesDir, `${safeName(websiteId)}.json`)
}

function stringValue(value, fallback = '') {
  return String(value ?? fallback).trim()
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => stringValue(item)).filter(Boolean))]
}

function inferKind(mimeType = '') {
  const mime = stringValue(mimeType).toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || mime.startsWith('text/')) return 'document'
  return 'other'
}

function normaliseVariant(variant = {}) {
  const id = identity(variant.id || variant.name || crypto.randomUUID(), 'Variant id')
  const width = Number(variant.width)
  const height = Number(variant.height)
  return {
    id,
    label: stringValue(variant.label, id),
    url: stringValue(variant.url),
    mimeType: stringValue(variant.mimeType),
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    bytes: Number.isFinite(Number(variant.bytes)) && Number(variant.bytes) >= 0 ? Number(variant.bytes) : null,
    transformation: variant.transformation && typeof variant.transformation === 'object' ? variant.transformation : null,
    createdAt: stringValue(variant.createdAt) || new Date().toISOString(),
  }
}

function normaliseAsset(websiteId, input = {}, existing = null) {
  const now = new Date().toISOString()
  const mimeType = stringValue(input.mimeType, existing?.mimeType)
  const requestedKind = stringValue(input.kind, existing?.kind || inferKind(mimeType)).toLowerCase()
  const kind = VALID_KINDS.has(requestedKind) ? requestedKind : inferKind(mimeType)
  const variants = Array.isArray(input.variants) ? input.variants.map(normaliseVariant) : existing?.variants || []
  return {
    id: existing?.id || identity(input.id || crypto.randomUUID(), 'Asset id'),
    websiteId,
    ownerId: stringValue(input.ownerId, existing?.ownerId),
    name: stringValue(input.name, existing?.name || input.originalName || 'Untitled asset'),
    originalName: stringValue(input.originalName, existing?.originalName || input.name),
    description: stringValue(input.description, existing?.description),
    alt: stringValue(input.alt, existing?.alt),
    kind,
    mimeType,
    extension: stringValue(input.extension, existing?.extension || path.extname(input.originalName || input.url || '')).toLowerCase(),
    url: stringValue(input.url, existing?.url),
    storagePath: stringValue(input.storagePath, existing?.storagePath),
    bytes: Number.isFinite(Number(input.bytes ?? existing?.bytes)) && Number(input.bytes ?? existing?.bytes) >= 0 ? Number(input.bytes ?? existing?.bytes) : null,
    width: Number.isFinite(Number(input.width ?? existing?.width)) && Number(input.width ?? existing?.width) > 0 ? Number(input.width ?? existing?.width) : null,
    height: Number.isFinite(Number(input.height ?? existing?.height)) && Number(input.height ?? existing?.height) > 0 ? Number(input.height ?? existing?.height) : null,
    folder: stringValue(input.folder, existing?.folder),
    collections: uniqueStrings(input.collections ?? existing?.collections),
    tags: uniqueStrings(input.tags ?? existing?.tags),
    variants,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : existing?.metadata || {},
    createdAt: existing?.createdAt || stringValue(input.createdAt) || now,
    updatedAt: now,
  }
}

async function withMutation(websiteId, operation) {
  const key = safeName(websiteId)
  const previous = mutations.get(key) || Promise.resolve()
  const next = previous.catch(() => {}).then(operation)
  mutations.set(key, next)
  try {
    return await next
  } finally {
    if (mutations.get(key) === next) mutations.delete(key)
  }
}

async function readLegacyAssets(websiteId) {
  const manifestsDir = path.dirname(paths.manifest('owner'))
  const files = await fs.readdir(manifestsDir).catch(error => {
    if (error?.code === 'ENOENT') return []
    throw error
  })
  const manifests = await Promise.all(files.filter(file => file.endsWith('.json')).map(file => readJson(path.join(manifestsDir, file), [])))
  const seen = new Set()
  return manifests.flat().filter(asset => safeName(asset?.websiteId) === websiteId).filter(asset => {
    const key = asset?.id || asset?.url
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).map(asset => normaliseAsset(websiteId, asset))
}

async function readLibrary(websiteId) {
  const file = libraryPath(websiteId)
  const stored = await readJson(file, null)
  if (Array.isArray(stored)) return stored
  const migrated = await readLegacyAssets(websiteId)
  await writeJson(file, migrated)
  return migrated
}

function matchesText(asset, query) {
  const needle = stringValue(query).toLowerCase()
  if (!needle) return true
  return [asset.name, asset.originalName, asset.description, asset.alt, asset.folder, ...(asset.tags || []), ...(asset.collections || [])]
    .some(value => String(value || '').toLowerCase().includes(needle))
}

function recordContainsAsset(value, asset) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value === asset.id || value === asset.url
  if (Array.isArray(value)) return value.some(item => recordContainsAsset(item, asset))
  if (typeof value === 'object') {
    if (value.assetId === asset.id || value.id === asset.id || value.url === asset.url) return true
    return Object.values(value).some(item => recordContainsAsset(item, asset))
  }
  return false
}

export async function findAssetUsage(websiteValue, assetValue) {
  const websiteId = identity(websiteValue, 'Website id')
  const assetId = identity(assetValue, 'Asset id')
  const assets = await readLibrary(websiteId)
  const asset = assets.find(item => item.id === assetId)
  if (!asset) throw new AssetLibraryError('Asset not found', 404)
  const usage = []
  for (const definition of listContentTypes()) {
    const records = await readJson(path.join(contentRecordsDir, websiteId, `${safeName(definition.id)}.json`), [])
    for (const record of Array.isArray(records) ? records : []) {
      for (const field of definition.fields) {
        if (recordContainsAsset(record[field.id], asset)) usage.push({ type: definition.id, recordId: record.id, field: field.id })
      }
    }
  }
  return usage
}

export async function listAssets(websiteValue, options = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50))
  const offset = Math.max(0, Number(options.offset) || 0)
  let assets = await readLibrary(websiteId)
  assets = assets.filter(asset => matchesText(asset, options.query || options.q))
  if (options.kind) assets = assets.filter(asset => asset.kind === String(options.kind).toLowerCase())
  if (options.folder !== undefined) assets = assets.filter(asset => asset.folder === stringValue(options.folder))
  if (options.collection) assets = assets.filter(asset => asset.collections?.includes(stringValue(options.collection)))
  if (options.tag) assets = assets.filter(asset => asset.tags?.includes(stringValue(options.tag)))
  assets.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0) || left.id.localeCompare(right.id))
  const total = assets.length
  return { total, offset, limit, hasMore: offset + limit < total, results: assets.slice(offset, offset + limit) }
}

export async function getAsset(websiteValue, assetValue) {
  const websiteId = identity(websiteValue, 'Website id')
  const assetId = identity(assetValue, 'Asset id')
  const asset = (await readLibrary(websiteId)).find(item => item.id === assetId)
  if (!asset) throw new AssetLibraryError('Asset not found', 404)
  return { ...asset, usage: await findAssetUsage(websiteId, assetId) }
}

export async function createAsset(websiteValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  return withMutation(websiteId, async () => {
    const assets = await readLibrary(websiteId)
    const asset = normaliseAsset(websiteId, input)
    if (assets.some(item => item.id === asset.id)) throw new AssetLibraryError('Asset id already exists', 409)
    await writeJson(libraryPath(websiteId), [asset, ...assets])
    return asset
  })
}

export async function updateAsset(websiteValue, assetValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const assetId = identity(assetValue, 'Asset id')
  return withMutation(websiteId, async () => {
    const assets = await readLibrary(websiteId)
    const index = assets.findIndex(item => item.id === assetId)
    if (index < 0) throw new AssetLibraryError('Asset not found', 404)
    const updated = normaliseAsset(websiteId, input, assets[index])
    assets[index] = updated
    await writeJson(libraryPath(websiteId), assets)
    return updated
  })
}

export async function registerAssetVariant(websiteValue, assetValue, input = {}) {
  const asset = await getAsset(websiteValue, assetValue)
  const variant = normaliseVariant(input)
  const variants = [variant, ...(asset.variants || []).filter(item => item.id !== variant.id)]
  return updateAsset(websiteValue, assetValue, { variants })
}

export async function deleteAsset(websiteValue, assetValue, options = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const assetId = identity(assetValue, 'Asset id')
  const usage = await findAssetUsage(websiteId, assetId)
  if (usage.length && options.force !== true) throw new AssetLibraryError('Asset is still in use', 409, { usage })
  return withMutation(websiteId, async () => {
    const assets = await readLibrary(websiteId)
    const asset = assets.find(item => item.id === assetId)
    if (!asset) throw new AssetLibraryError('Asset not found', 404)
    await writeJson(libraryPath(websiteId), assets.filter(item => item.id !== assetId))
    if (options.deleteFile === true && asset.storagePath) {
      const resolved = path.resolve(asset.storagePath)
      const root = path.resolve(DATA_DIR, 'assets')
      if (resolved.startsWith(`${root}${path.sep}`)) await fs.rm(resolved, { force: true })
    }
    return { deleted: true, asset, usage }
  })
}
