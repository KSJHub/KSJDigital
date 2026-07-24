import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/jobQueueRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'job.enqueued',
  'job.cancelled',
  'job.requeued',
  'job.schedule-updated',
  'job.claimed',
  'job.lease-renewed',
  'job.completed',
  'job.retry-scheduled',
  'job.dead-lettered',
  'job.queue-processed',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Job queue router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing job queue real-time event: ${topic}`)
}

if (!router.includes('jobIds: jobs.map(job => job.id)')) {
  throw new Error('Batch job events must identify the affected jobs')
}

if (!router.includes('websiteId: websiteId(value)')) {
  throw new Error('Job events must preserve website routing metadata when available')
}

console.log('Job queue real-time event checks passed')
