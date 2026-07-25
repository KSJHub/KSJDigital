import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/notificationRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/notificationService.js', import.meta.url), 'utf8')
const source = `${router}\n${service}`

const requiredTopics = [
  'notification.template-updated',
  'notification.recipient-updated',
  'notification.rate-limit-updated',
  'notification.queued',
  'notification.delivery-started',
  'notification.delivered',
  'notification.failed',
]

for (const topic of requiredTopics) {
  if (!source.includes(`'${topic}'`)) throw new Error(`Missing notification real-time event: ${topic}`)
}

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Notification router must publish through the canonical real-time domain event service')
}
if (!service.includes("import { publishDomainEvent } from './realtimeDomainEventService.js'")) {
  throw new Error('Notification delivery worker must publish through the canonical real-time domain event service')
}

function domainEventCalls(code) {
  const calls = []
  const marker = 'publishDomainEvent('
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

const routerEvents = domainEventCalls(router).join('\n')
const deliveryEvents = domainEventCalls(service).join('\n')

const forbiddenRouterPayloads = [
  'recipientIds:',
  'jobIds:',
  'deduplicationKey: queued.deduplicationKey',
  'policy, accountId:',
]
for (const fragment of forbiddenRouterPayloads) {
  if (routerEvents.includes(fragment)) throw new Error(`Notification events must not publish sensitive queue or recipient data: ${fragment}`)
}

const forbiddenDeliveryPayloads = [
  'message: delivery.message',
  'recipient: delivery.recipient',
  'providerResult: completed.providerResult',
  'error: error?.message',
  'deduplicationKey: delivery.deduplicationKey',
  'variables: input.variables',
  'address: delivery.recipient',
]
for (const fragment of forbiddenDeliveryPayloads) {
  if (deliveryEvents.includes(fragment)) throw new Error(`Notification delivery events must exclude message, recipient, provider and error contents: ${fragment}`)
}

if (!deliveryEvents.includes('retryable:')) throw new Error('Failed notification events must expose a safe retryability signal')
if (!routerEvents.includes('queuedCount: queued.queued')) throw new Error('Queued notification events must publish a count instead of recipient or job identifiers')

console.log('Notification real-time event checks passed')
