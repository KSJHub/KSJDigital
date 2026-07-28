import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/cacheRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/cacheService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishCacheRealtimeEvent('cache.policy-updated'",
  "publishCacheRealtimeEvent('cache.policy-deleted'",
  "publishCacheRealtimeEvent('cache.invalidated'",
  "publishCacheRealtimeEvent('cache.cleared'",
  'policyCount:',
  'enabledPolicyCount:',
  'entryCount:',
  'memoryPolicyCount:',
  'filePolicyCount:',
  'methodCount:',
  'tagCount:',
  'invalidatedCount:',
  'namespaceFiltered:',
  'tagFilterCount:',
  'cleared:',
]) {
  if (!router.includes(token)) failures.push(`Missing cache realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function cacheRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishCacheRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'policyId:', 'entryId:', 'provider:', 'namespace:', 'route:', 'methods:', 'tags:', 'key:',
  'cacheKey:', 'value:', 'body:', 'headers:', 'actor:', 'payload:', 'session', 'email:', 'role:',
  'createdAt:', 'updatedAt:', 'expiresAt:', 'staleUntil:', 'req.body', 'req.params', 'authorization',
  'cookie', '...result', '...policy', '...entry',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Cache event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishCacheRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Cache events must use an awaited aggregate-only canonical publisher')
}

const policyGuard = router.indexOf('if (!cachePolicyPatchChanges(existing, input)) return existing')
const policyMutation = router.indexOf('const result = await upsertCachePolicy(')
const policyPublish = router.indexOf("await publishCacheRealtimeEvent('cache.policy-updated'")
if (policyGuard < 0 || policyMutation < policyGuard || policyPublish < policyMutation) failures.push('Unchanged cache policies must return before persistence and publication')

const deleteGuard = router.indexOf("if (!existing) return { deleted: false, id: req.params.policyId }")
const deleteMutation = router.indexOf('const result = await deleteCachePolicy(')
const deletePublish = router.indexOf("await publishCacheRealtimeEvent('cache.policy-deleted'")
if (deleteGuard < 0 || deleteMutation < deleteGuard || deletePublish < deleteMutation) failures.push('Missing cache policies must not be persisted or published')

const invalidateMutation = router.indexOf('const result = await invalidateCache(')
const invalidateGuard = router.indexOf('if (result.invalidated === 0) return result', invalidateMutation)
const invalidatePublish = router.indexOf("await publishCacheRealtimeEvent('cache.invalidated'")
if (invalidateMutation < 0 || invalidateGuard < invalidateMutation || invalidatePublish < invalidateGuard) failures.push('Zero-match cache invalidations must not publish')

const clearMutation = router.indexOf('const result = await clearCache(')
const clearGuard = router.indexOf('if (result.invalidated === 0) return result', clearMutation)
const clearPublish = router.indexOf("await publishCacheRealtimeEvent('cache.cleared'")
if (clearMutation < 0 || clearGuard < clearMutation || clearPublish < clearGuard) failures.push('Empty cache clears must not publish')

if (!service.includes('if (result?.__skipWrite === true) return result.value')) failures.push('Cache storage must support semantic no-write results')
if (!service.includes("if (!existed) return { __skipWrite: true, value: { deleted: false, id } }")) failures.push('Missing cache policy deletion must not rewrite storage')
if (!service.includes('if (!ids.length) return { invalidated: 0 }')) failures.push('Zero-match cache invalidation must return before storage mutation')

for (const topic of ['cache.policy-updated', 'cache.policy-deleted', 'cache.invalidated', 'cache.cleared']) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Cache topic must be owned by the canonical cache publisher: ${topic}`)
}

if (failures.length) {
  console.error('Cache real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Cache real-time event checks passed')
