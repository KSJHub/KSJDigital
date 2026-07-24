import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-cache-'))
process.chdir(temporary)
try {
  const serviceFile = path.join(root, 'server/services/cacheService.js')
  const cache = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)

  const policy = await cache.upsertCachePolicy({ id: 'public-content', route: '/api/public/*', namespace: 'public', provider: 'file', ttlMs: 1000, staleWhileRevalidateMs: 5000, tags: ['content'] }, { id: 'check' })
  assert.equal(policy.provider, 'file')
  assert.equal(policy.namespace, 'public')

  await cache.setCacheEntry('public', 'page:one', { value: 1 }, { provider: 'file', ttlMs: 1000, staleWhileRevalidateMs: 5000, tags: ['content', 'site-one'] })
  const hit = await cache.getCacheEntry('public', 'page:one')
  assert.equal(hit.hit, true)
  assert.deepEqual(hit.value, { value: 1 })

  await cache.setCacheEntry('memory', 'temporary', { value: 2 }, { provider: 'memory', ttlMs: 1000, tags: ['temporary'] })
  assert.equal((await cache.getCacheEntry('memory', 'temporary')).hit, true)

  const invalidated = await cache.invalidateCache({ tags: ['content'] }, { id: 'check' })
  assert.equal(invalidated.invalidated, 1)
  assert.equal((await cache.getCacheEntry('public', 'page:one')).hit, false)
  assert.equal((await cache.getCacheEntry('memory', 'temporary')).hit, true)

  const state = await cache.getCacheState({ limit: 100 })
  assert.equal(state.policies.length, 1)
  assert(state.statistics.hits >= 2)
  assert(state.statistics.misses >= 1)
  assert(state.history.some(item => item.action === 'cache.invalidated'))

  const router = await fs.readFile(path.join(root, 'server/cacheRouter.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(router, /Owner permission required/)
  assert.match(router, /invalidate/)
  assert.match(start, /createResponseCacheMiddleware/)
  assert.match(start, /createCacheRouter/)
  assert.match(start, /\/api\/cache/)

  console.log('Caching and performance management checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
