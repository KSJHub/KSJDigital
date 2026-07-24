import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/automationRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'automation.job-created',
  'automation.job-updated',
  'automation.job-deleted',
  'automation.execution-queued',
  'automation.execution-cancelled',
  'automation.execution-retried',
  'automation.queue-processed',
  'automation.settings-updated',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Automation router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing automation real-time event: ${topic}`)
}

if (!router.includes('websiteId: req.params.websiteId')) {
  throw new Error('Automation events must include website routing metadata')
}

console.log('Automation real-time event checks passed')
