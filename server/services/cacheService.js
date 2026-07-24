import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR, ensureDir, readJson, safeName, writeJson } from '../storage.js'

const ROOT = path.join(DATA_DIR, 'cache')
const REGISTRY_FILE = path.join(ROOT, 'registry.json')
const FILE_CACHE_DIR = path.join(ROOT, 'entries')
const memory = new Map()
const mutations = new Map()
const MAX_HISTORY = 5000
const PROVIDERS = new Set(['memory', 'file'])

export class CacheError extends Error {
  constructor(message, status = 400, details = null) { super(message); this.name = 'CacheError'; this.status = status; this.details = details }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() { return { policies: [], entries: {}, statistics: { hits: 0, misses: 0, staleHits: 0, writes: 0, invalidations: 0, errors: 0 }, history: [], version: 1, updatedAt: nowIso() } }
async function readRegistry() {
  const registry = await readJson(REGISTRY_FILE, null) || initialRegistry()
  registry.policies ||= []
  registry.entries ||= {}
  registry.statistics = { ...initialRegistry().statistics, ...(registry.statistics || {}) }
  registry.history ||= []
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
    registry.history = registry.history.slice(0, MAX_HISTORY)
    await writeJson(REGISTRY_FILE, registry)
    return result === undefined ? registry : result
  })
  mutations.set('registry', current)
  try { return await current } finally { if (mutations.get('registry') === current) mutations.delete('registry') }
}
function text(value, label, maximum = 500) {
  const result = String(value || '').trim()
  if (!result) throw new CacheError(`${label} is required`, 422)
  if (result.length > maximum) throw new CacheError(`${label} is too long`, 422)
  return result
}
function namespace(value) {
  const id = safeName(value)
  if (!id || id === 'file') throw new CacheError('Cache namespace is required', 422)
  return id
}
function normaliseTags(value) { return [...new Set((Array.isArray(value) ? value : []).map(item => safeName(item)).filter(item => item && item !== 'file'))].sort() }
function normalisePolicy(input = {}, existing = null) {
  const id = safeName(input.id || existing?.id)
  if (!id || id === 'file') throw new CacheError('Cache policy ID is required', 422)
  const provider = String(input.provider ?? existing?.provider ?? 'memory')
  if (!PROVIDERS.has(provider)) throw new CacheError('Cache provider must be memory or file', 422)
  const route = text(input.route ?? existing?.route ?? '*', 'Cache route', 500)
  if (route !== '*' && !route.startsWith('/')) throw new CacheError('Cache route must be * or start with /', 422)
  const methods = [...new Set((Array.isArray(input.methods) ? input.methods : existing?.methods || ['GET']).map(item => String(item).toUpperCase()))]
  if (!methods.length || methods.some(method => !['GET', 'HEAD'].includes(method))) throw new CacheError('Response cache methods must be GET or HEAD', 422)
  return {
    id,
    name: String(input.name ?? existing?.name ?? id).trim().slice(0, 200),
    namespace: namespace(input.namespace ?? existing?.namespace ?? id),
    route,
    methods,
    provider,
    ttlMs: Math.min(7 * 86_400_000, Math.max(1000, Number(input.ttlMs ?? existing?.ttlMs ?? 60_000))),
    staleWhileRevalidateMs: Math.min(7 * 86_400_000, Math.max(0, Number(input.staleWhileRevalidateMs ?? existing?.staleWhileRevalidateMs ?? 0))),
    tags: normaliseTags(input.tags ?? existing?.tags),
    enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
    priority: Math.min(10_000, Math.max(-10_000, Number(input.priority ?? existing?.priority ?? 0))),
  }
}
function routeMatches(pattern, route) { return pattern === '*' || (pattern.endsWith('*') ? route.startsWith(pattern.slice(0, -1)) : route === pattern) }
function keyParts(ns, key) { return { namespace: namespace(ns), key: text(key, 'Cache key', 2000) } }
function entryId(ns, key) { const parts = keyParts(ns, key); return crypto.createHash('sha256').update(`${parts.namespace}:${parts.key}`).digest('hex') }
function fileFor(id) { return path.join(FILE_CACHE_DIR, `${id}.json`) }
async function readValue(meta) {
  if (meta.provider === 'memory') return memory.get(meta.id)?.value
  return (await readJson(fileFor(meta.id), null))?.value
}
async function writeValue(meta, value) {
  if (meta.provider === 'memory') { memory.set(meta.id, { value: structuredClone(value) }); return }
  await ensureDir(FILE_CACHE_DIR)
  await writeJson(fileFor(meta.id), { value })
}
async function deleteValue(meta) {
  memory.delete(meta.id)
  if (meta.provider === 'file') await fs.rm(fileFor(meta.id), { force: true })
}

export async function getCacheState(query = {}) {
  const registry = await readRegistry()
  const limit = Math.min(1000, Math.max(1, Number(query.limit || 200)))
  return { ...registry, entries: Object.values(registry.entries).slice(0, limit), history: registry.history.slice(0, limit), providers: [...PROVIDERS] }
}
export async function upsertCachePolicy(input = {}, actor = null) {
  return mutate(registry => {
    const existing = registry.policies.find(item => item.id === safeName(input.id))
    const policy = { ...normalisePolicy(input, existing), createdAt: existing?.createdAt || nowIso(), createdBy: existing?.createdBy || actor, updatedAt: nowIso(), updatedBy: actor }
    registry.policies = [policy, ...registry.policies.filter(item => item.id !== policy.id)].sort((a, b) => b.priority - a.priority)
    registry.history.unshift({ id: crypto.randomUUID(), action: 'cache-policy.updated', policyId: policy.id, actor, createdAt: nowIso() })
    return policy
  })
}
export async function deleteCachePolicy(idValue, actor = null) {
  const id = safeName(idValue)
  return mutate(registry => { const existed = registry.policies.some(item => item.id === id); registry.policies = registry.policies.filter(item => item.id !== id); registry.history.unshift({ id: crypto.randomUUID(), action: 'cache-policy.deleted', policyId: id, actor, createdAt: nowIso() }); return { deleted: existed, id } })
}
export async function setCacheEntry(ns, key, value, options = {}) {
  const parts = keyParts(ns, key)
  const id = entryId(parts.namespace, parts.key)
  const provider = String(options.provider || 'memory')
  if (!PROVIDERS.has(provider)) throw new CacheError('Cache provider must be memory or file', 422)
  const now = Date.now()
  const ttlMs = Math.min(7 * 86_400_000, Math.max(1000, Number(options.ttlMs || 60_000)))
  const staleMs = Math.min(7 * 86_400_000, Math.max(0, Number(options.staleWhileRevalidateMs || 0)))
  const meta = { id, namespace: parts.namespace, key: parts.key, provider, tags: normaliseTags(options.tags), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString(), staleUntil: new Date(now + ttlMs + staleMs).toISOString(), sizeBytes: Buffer.byteLength(JSON.stringify(value)), status: 'active' }
  await writeValue(meta, value)
  return mutate(registry => { registry.entries[id] = meta; registry.statistics.writes += 1; registry.history.unshift({ id: crypto.randomUUID(), action: 'cache-entry.written', entryId: id, namespace: meta.namespace, createdAt: nowIso() }); return meta })
}
export async function getCacheEntry(ns, key) {
  const id = entryId(ns, key)
  const registry = await readRegistry()
  const meta = registry.entries[id]
  if (!meta) { await mutate(current => { current.statistics.misses += 1 }); return { hit: false, stale: false, value: null, entry: null } }
  const now = Date.now()
  if (now > new Date(meta.staleUntil).getTime()) { await deleteValue(meta); await mutate(current => { delete current.entries[id]; current.statistics.misses += 1 }); return { hit: false, stale: false, value: null, entry: null } }
  const value = await readValue(meta)
  if (value === undefined || value === null) { await mutate(current => { delete current.entries[id]; current.statistics.errors += 1; current.statistics.misses += 1 }); return { hit: false, stale: false, value: null, entry: null } }
  const stale = now > new Date(meta.expiresAt).getTime()
  await mutate(current => { if (stale) current.statistics.staleHits += 1; else current.statistics.hits += 1 })
  return { hit: true, stale, value: structuredClone(value), entry: meta }
}
export async function invalidateCache(input = {}, actor = null) {
  const registry = await readRegistry()
  const tags = new Set(normaliseTags(input.tags))
  const ns = input.namespace ? namespace(input.namespace) : null
  const ids = Object.values(registry.entries).filter(entry => (!ns || entry.namespace === ns) && (!tags.size || entry.tags.some(tag => tags.has(tag)))).map(entry => entry.id)
  for (const id of ids) await deleteValue(registry.entries[id])
  return mutate(current => { for (const id of ids) delete current.entries[id]; current.statistics.invalidations += ids.length; current.history.unshift({ id: crypto.randomUUID(), action: 'cache.invalidated', namespace: ns, tags: [...tags], count: ids.length, actor, createdAt: nowIso() }); return { invalidated: ids.length } })
}
export async function clearCache(actor = null) { return invalidateCache({}, actor) }

export function createResponseCacheMiddleware() {
  return async function responseCache(req, res, next) {
    try {
      const registry = await readRegistry()
      const route = req.path || req.originalUrl || '/'
      const carriesCredentials = Boolean(req.get?.('authorization') || req.get?.('cookie'))
      const policy = registry.policies.find(item => item.enabled && !carriesCredentials && item.methods.includes(req.method) && routeMatches(item.route, route))
      if (!policy) return next()
      const cacheKey = `${req.method}:${req.originalUrl || route}`
      const cached = await getCacheEntry(policy.namespace, cacheKey)
      if (cached.hit) {
        res.set('X-Cache', cached.stale ? 'STALE' : 'HIT')
        if (cached.value.headers) for (const [name, value] of Object.entries(cached.value.headers)) res.set(name, value)
        return res.status(cached.value.status || 200).send(cached.value.body)
      }
      const originalSend = res.send.bind(res)
      res.send = body => {
        if (res.statusCode >= 200 && res.statusCode < 300 && !res.getHeader('set-cookie')) {
          const headers = {}
          for (const name of ['content-type', 'etag', 'last-modified']) { const value = res.getHeader(name); if (value !== undefined) headers[name] = value }
          setCacheEntry(policy.namespace, cacheKey, { status: res.statusCode, headers, body }, { provider: policy.provider, ttlMs: policy.ttlMs, staleWhileRevalidateMs: policy.staleWhileRevalidateMs, tags: policy.tags }).catch(() => {})
        }
        res.set('X-Cache', 'MISS')
        return originalSend(body)
      }
      next()
    } catch (error) { next(error) }
  }
}
