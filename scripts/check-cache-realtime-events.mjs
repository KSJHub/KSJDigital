import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/cacheRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'cache.policy-updated',
  'cache.policy-deleted',
  'cache.invalidated',
  'cache.cleared',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Cache router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing cache real-time event: ${topic}`)
}

function eventCalls(code, marker) {
  const calls = []
  let start = 0
  while ((start = code.indexOf(marker, start)) !== -1) {
    let depth = 0
    let quote = null
    let escaped = false
    let end = start + marker.length
    for (; end < code.length; end += 1) {
      const character = code[end]
      if (quote) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = null
        continue
      }
      if (character === "'" || character === '"' || character === '`') { quote = character; continue }
      if (character === '(') depth += 1
      else if (character === ')') {
        if (depth === 0) { end += 1; break }
        depth -= 1
      }
    }
    calls.push(code.slice(start, end))
    start = end
  }
  return calls
}

const events = eventCalls(router, 'publishCacheEvent(').join('\n')
const forbiddenPayloads = [
  'value:',
  'body:',
  'key:',
  'cacheKey:',
  'route:',
  'namespace:',
  'tags:',
  'payload: req.body',
  '...req.body',
  'headers:',
  'authorization',
  'cookie',
  'error.message',
]
for (const fragment of forbiddenPayloads) {
  if (events.includes(fragment)) throw new Error(`Cache events expose forbidden cache data: ${fragment}`)
}

if (!events.includes('invalidatedCount: result.invalidated')) throw new Error('Cache invalidation events must publish only aggregate invalidation counts')
if (!events.includes('namespaceFiltered: Boolean(req.body?.namespace)')) throw new Error('Targeted cache invalidation must publish only a namespace-filter signal')
if (!events.includes('tagFilterCount: Array.isArray(req.body?.tags) ? req.body.tags.length : 0')) throw new Error('Targeted cache invalidation must publish only the tag-filter count')
if (!events.includes('methodCount: result.methods.length') || !events.includes('tagCount: result.tags.length')) {
  throw new Error('Cache policy events must publish bounded method and tag counts')
}

console.log('Cache real-time event checks passed')
