import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/eventBusRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'event-bus.subscription-updated',
  'event-bus.subscription-deleted',
  'event-bus.event-replayed',
  'event-bus.dead-letter-replayed',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Event bus router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing event bus real-time event: ${topic}`)
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

const events = eventCalls(router, 'publishEventBusEvent(').join('\n')
const forbiddenPayloads = [
  'payload: req.body',
  'topic: req.body',
  'options: req.body',
  'metadata:',
  'handler:',
  'topicPattern:',
  'error:',
  'lastError:',
  'headers:',
  'correlationId:',
  'causationId:',
]
for (const fragment of forbiddenPayloads) {
  if (events.includes(fragment)) throw new Error(`Event bus events expose forbidden delivery data: ${fragment}`)
}

if (!events.includes('maximumAttempts: result.retry.maximumAttempts')) throw new Error('Subscription events must publish only bounded retry configuration')
if (!events.includes('deliveryCount: result.deliveryCount')) throw new Error('Replay events must publish aggregate delivery counts')

const publishRouteStart = router.indexOf("router.post('/publish'")
const processRouteStart = router.indexOf("router.post('/process'")
const publishRoute = router.slice(publishRouteStart, processRouteStart)
if (publishRoute.includes('publishEventBusEvent(')) throw new Error('Administrative event publication must not emit recursive event-bus meta-events')

console.log('Event bus real-time event checks passed')
