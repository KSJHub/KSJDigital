import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/integrationRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'integration.subscription-created',
  'integration.subscription-updated',
  'integration.subscription-deleted',
  'integration.delivery-retried',
  'integration.queue-processed',
  'integration.settings-updated',
  'integration.event-published',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Integration router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing integration real-time event: ${topic}`)
}

if (!router.includes('websiteId: req.params.websiteId')) {
  throw new Error('Integration events must include website routing metadata')
}

if (!router.includes('id: req.session?.userId || null') || !router.includes('email: req.session?.email || null')) {
  throw new Error('Integration events must include the authenticated actor')
}

console.log('Integration real-time event checks passed')
