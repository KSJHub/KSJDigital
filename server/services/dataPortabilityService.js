import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { gzip, gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { ASSET_DIR, DATA_DIR, ensureDir, paths, readJson, readWebsiteAssets, safeName, writeJson } from '../storage.js'
import { writeStructuredLog } from './systemHealthService.js'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)
const ROOT = path.join(DATA_DIR, 'portability')
const REGISTRY_FILE = path.join(ROOT, 'registry.json')
const PACKAGE_DIR = path.join(ROOT, 'packages')
const mutations = new Map()
const MAX_HISTORY = 5000
const FORMAT_VERSION = 1
const WEBSITE_COLLECTIONS = {
  content: paths.content,
  publishedContent: paths.publishedContent,
  articles: paths.articles,
  forms: paths.forms,
  commerceSettings: paths.commerceSettings,
}

export class DataPortabilityError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'DataPortabilityError'
    this.status = status
    this.details = details
  }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() { return { jobs: [], imports: [], history: [], statistics: { exports: 0, imports: 0, validations: 0, failures: 0 }, version: 1, updatedAt: nowIso() } }
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.jobs ||= []
  registry.imports ||= []
  registry.history ||= []
  registry.statistics = { ...initialRegistry().statistics, ...(registry.statistics || {}) }
  registry.version ||= 1
  return registry
}
async function mutate(operation) {
  const previous = mutations.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = structuredClone(await readRegistry())
    const result = await operation(registry)
    registry.version += 1
    registry.updatedAt = nowIso()
    registry.jobs = registry.jobs.slice(0, 1000)
    registry.imports = registry.imports.slice(0, 1000)
    registry.history = registry.history.slice(0, MAX_HISTORY)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function required(value, label, maximum = 500) {
  const result = String(value || '').trim()
  if (!result) throw new DataPortabilityError(`${label} is required`, 422)
  if (result.length > maximum) throw new DataPortabilityError(`${label} is too long`, 422)
  return result
}
function websiteId(value) {
  const id = safeName(required(value, 'Website ID', 200))
  if (!id || id === 'file') throw new DataPortabilityError('Website ID is invalid', 422)
  return id
}
function checksum(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
function canonicalJson(value) { return JSON.stringify(canonical(value)) }
function packagePath(id, format) { return path.join(PACKAGE_DIR, `${safeName(id)}.${format === 'archive' ? 'ksj.gz' : 'json'}`) }
function publicJob(job) { const { internalPath, ...safe } = job; return structuredClone(safe) }

async function readCollection(name, id) {
  const file = WEBSITE_COLLECTIONS[name](id)
  const value = await readJson(file, null)
  return value === null ? null : { name, value }
}
async function readLocalAsset(asset) {
  const raw = String(asset?.path || asset?.url || '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/assets\//, '')
  if (!raw || raw.includes('..')) return null
  const file = path.resolve(ASSET_DIR, raw)
  const relative = path.relative(ASSET_DIR, file)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  try {
    const bytes = await fs.readFile(file)
    return { path: relative.split(path.sep).join('/'), sizeBytes: bytes.length, sha256: checksum(bytes), data: bytes.toString('base64') }
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}
async function buildPackage(id, options = {}) {
  const collections = (await Promise.all(Object.keys(WEBSITE_COLLECTIONS).map(name => readCollection(name, id)))).filter(Boolean)
  const assets = await readWebsiteAssets(id)
  const embeddedAssets = options.includeAssetFiles === false ? [] : (await Promise.all(assets.map(readLocalAsset))).filter(Boolean)
  const payload = {
    format: 'ksj-portable-website',
    formatVersion: FORMAT_VERSION,
    websiteId: id,
    exportedAt: nowIso(),
    collections: Object.fromEntries(collections.map(item => [item.name, item.value])),
    assetManifest: assets,
    assetFiles: embeddedAssets,
    metadata: { collectionCount: collections.length, assetCount: assets.length, embeddedAssetCount: embeddedAssets.length },
  }
  const integrity = {
    algorithm: 'sha256',
    collections: Object.fromEntries(collections.map(item => [item.name, checksum(canonicalJson(item.value))])),
    assets: Object.fromEntries(embeddedAssets.map(item => [item.path, item.sha256])),
  }
  payload.integrity = integrity
  payload.packageChecksum = checksum(canonicalJson({ ...payload, packageChecksum: undefined }))
  return payload
}

export async function getPortabilityState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return { ...registry, jobs: registry.jobs.slice(0, limit).map(publicJob), imports: registry.imports.slice(0, limit), history: registry.history.slice(0, limit), supportedFormats: ['json', 'archive'], formatVersion: FORMAT_VERSION }
}

export async function createExportJob(input = {}, actor = null) {
  const id = websiteId(input.websiteId)
  const format = String(input.format || 'json').toLowerCase()
  if (!['json', 'archive'].includes(format)) throw new DataPortabilityError('Export format must be json or archive', 422)
  const jobId = crypto.randomUUID()
  const startedAt = nowIso()
  await mutate(registry => {
    registry.jobs.unshift({ id: jobId, websiteId: id, format, status: 'processing', startedAt, completedAt: null, sizeBytes: 0, checksum: null, internalPath: null, createdBy: actor, error: null })
    registry.history.unshift({ id: crypto.randomUUID(), action: 'portability-export.started', jobId, websiteId: id, format, actor, createdAt: startedAt })
  })
  try {
    const portable = await buildPackage(id, input)
    const json = JSON.stringify(portable, null, 2)
    const bytes = format === 'archive' ? await gzipAsync(Buffer.from(json, 'utf8'), { level: 9 }) : Buffer.from(json, 'utf8')
    await ensureDir(PACKAGE_DIR)
    const file = packagePath(jobId, format)
    await fs.writeFile(file, bytes, { flag: 'wx' })
    const completedAt = nowIso()
    const job = await mutate(registry => {
      const current = registry.jobs.find(item => item.id === jobId)
      Object.assign(current, { status: 'completed', completedAt, sizeBytes: bytes.length, checksum: checksum(bytes), internalPath: file })
      registry.statistics.exports += 1
      registry.history.unshift({ id: crypto.randomUUID(), action: 'portability-export.completed', jobId, websiteId: id, sizeBytes: bytes.length, actor, createdAt: completedAt })
      return current
    })
    return publicJob(job)
  } catch (error) {
    await mutate(registry => {
      const current = registry.jobs.find(item => item.id === jobId)
      if (current) Object.assign(current, { status: 'failed', completedAt: nowIso(), error: String(error?.message || error).slice(0, 2000) })
      registry.statistics.failures += 1
    })
    throw error
  }
}

export async function readExportPackage(jobIdValue) {
  const jobId = required(jobIdValue, 'Export job ID', 100)
  const registry = await readRegistry()
  const job = registry.jobs.find(item => item.id === jobId)
  if (!job || job.status !== 'completed' || !job.internalPath) throw new DataPortabilityError('Completed export job not found', 404)
  const bytes = await fs.readFile(job.internalPath)
  if (checksum(bytes) !== job.checksum) throw new DataPortabilityError('Export package checksum mismatch', 409)
  return { job: publicJob(job), bytes, filename: path.basename(job.internalPath), contentType: job.format === 'archive' ? 'application/gzip' : 'application/json' }
}

async function decodePackage(input = {}) {
  if (input.package && typeof input.package === 'object') return structuredClone(input.package)
  const encoded = required(input.data, 'Package data', 100_000_000)
  const bytes = Buffer.from(encoded, 'base64')
  const format = String(input.format || 'json').toLowerCase()
  const decoded = format === 'archive' ? await gunzipAsync(bytes) : bytes
  try { return JSON.parse(decoded.toString('utf8')) } catch { throw new DataPortabilityError('Portable package JSON is invalid', 422) }
}

export async function validatePortablePackage(input = {}) {
  const portable = await decodePackage(input)
  const errors = []
  if (portable?.format !== 'ksj-portable-website') errors.push('Unsupported package format')
  if (portable?.formatVersion !== FORMAT_VERSION) errors.push(`Unsupported format version: ${portable?.formatVersion}`)
  try { websiteId(portable?.websiteId) } catch (error) { errors.push(error.message) }
  if (!portable?.collections || typeof portable.collections !== 'object' || Array.isArray(portable.collections)) errors.push('Collections are missing or invalid')
  if (!Array.isArray(portable?.assetManifest)) errors.push('Asset manifest is invalid')
  if (!Array.isArray(portable?.assetFiles)) errors.push('Asset files are invalid')
  for (const [name, value] of Object.entries(portable?.collections || {})) {
    if (!(name in WEBSITE_COLLECTIONS)) errors.push(`Unsupported collection: ${name}`)
    const expected = portable?.integrity?.collections?.[name]
    if (!expected || checksum(canonicalJson(value)) !== expected) errors.push(`Collection checksum mismatch: ${name}`)
  }
  for (const asset of portable?.assetFiles || []) {
    if (!asset?.path || String(asset.path).includes('..')) errors.push('Asset path is invalid')
    else {
      const bytes = Buffer.from(String(asset.data || ''), 'base64')
      if (checksum(bytes) !== asset.sha256) errors.push(`Asset checksum mismatch: ${asset.path}`)
    }
  }
  const expectedPackageChecksum = checksum(canonicalJson({ ...portable, packageChecksum: undefined }))
  if (portable?.packageChecksum !== expectedPackageChecksum) errors.push('Package checksum mismatch')
  await mutate(registry => { registry.statistics.validations += 1; registry.history.unshift({ id: crypto.randomUUID(), action: 'portability-package.validated', websiteId: portable?.websiteId || null, valid: errors.length === 0, errorCount: errors.length, createdAt: nowIso() }) })
  return { valid: errors.length === 0, errors, package: portable, summary: portable?.metadata || null }
}

export async function importPortablePackage(input = {}, actor = null) {
  const validation = await validatePortablePackage(input)
  if (!validation.valid) throw new DataPortabilityError('Portable package validation failed', 422, { errors: validation.errors })
  const portable = validation.package
  const targetWebsiteId = websiteId(input.targetWebsiteId || portable.websiteId)
  const mode = String(input.mode || 'replace')
  if (!['replace', 'dry-run'].includes(mode)) throw new DataPortabilityError('Import mode must be replace or dry-run', 422)
  const importId = crypto.randomUUID()
  if (mode === 'replace') {
    for (const [name, value] of Object.entries(portable.collections)) await writeJson(WEBSITE_COLLECTIONS[name](targetWebsiteId), value)
    for (const asset of portable.assetFiles) {
      const relative = String(asset.path).replace(/\\/g, '/')
      if (!relative || relative.includes('..') || path.isAbsolute(relative)) throw new DataPortabilityError('Asset path is unsafe', 422)
      const destination = path.resolve(ASSET_DIR, relative)
      if (path.relative(ASSET_DIR, destination).startsWith('..')) throw new DataPortabilityError('Asset path escapes storage root', 422)
      await ensureDir(path.dirname(destination))
      await fs.writeFile(destination, Buffer.from(asset.data, 'base64'))
    }
  }
  const record = { id: importId, sourceWebsiteId: portable.websiteId, targetWebsiteId, mode, status: mode === 'dry-run' ? 'validated' : 'completed', collectionCount: Object.keys(portable.collections).length, assetCount: portable.assetFiles.length, createdAt: nowIso(), createdBy: actor }
  await mutate(registry => { registry.imports.unshift(record); if (mode !== 'dry-run') registry.statistics.imports += 1; registry.history.unshift({ id: crypto.randomUUID(), action: `portability-import.${record.status}`, importId, sourceWebsiteId: portable.websiteId, targetWebsiteId, actor, createdAt: record.createdAt }) })
  await writeStructuredLog('info', 'Portable website package processed', { importId, sourceWebsiteId: portable.websiteId, targetWebsiteId, mode })
  return record
}

export async function deleteExportJob(jobIdValue, actor = null) {
  const jobId = required(jobIdValue, 'Export job ID', 100)
  const registry = await readRegistry()
  const job = registry.jobs.find(item => item.id === jobId)
  if (job?.internalPath) await fs.rm(job.internalPath, { force: true })
  return mutate(current => {
    const existed = current.jobs.some(item => item.id === jobId)
    current.jobs = current.jobs.filter(item => item.id !== jobId)
    current.history.unshift({ id: crypto.randomUUID(), action: 'portability-export.deleted', jobId, actor, createdAt: nowIso() })
    return { deleted: existed, id: jobId }
  })
}
