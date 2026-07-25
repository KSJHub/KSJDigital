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

const forbiddenRouterPayloads = [
  'recipientIds:',
  'jobIds:',
  'deduplicationKey: queued.deduplicationKey',
  'policy, accountId:',
]
for (const fragment of forbiddenRouterPayloads) {
  if (router.includes(fragment)) throw new Error(`Notification events must not publish sensitive queue or recipient data: ${fragment}`)
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
  if (service.includes(fragment)) throw new Error(`Notification delivery events must exclude message, recipient, provider and error contents: ${fragment}`)
}

if (!service.includes('retryable:')) throw new Error('Failed notification events must expose a safe retryability signal')
if (!router.includes('queuedCount: queued.queued')) throw new Error('Queued notification events must publish a count instead of recipient or job identifiers')

console.log('Notification real-time event checks passed')
