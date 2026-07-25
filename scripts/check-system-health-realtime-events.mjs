import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/systemHealthRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'system-health.checked',
  'system-health.incident-detected',
  'system-health.settings-updated',
  'system-health.log-written',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('System health router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing system health real-time event: ${topic}`)
}

if (!router.includes("id: req.session?.userId || req.session?.email || 'system-health-observer'") || !router.includes('email: req.session?.email || null')) {
  throw new Error('System health events must include a bounded actor identity')
}

const forbiddenPayloads = [
  'hostname:',
  'pid:',
  'heartbeats: snapshot.heartbeats',
  'details: item.details',
  'message: entry.message',
  'context: entry.context',
]

for (const value of forbiddenPayloads) {
  if (router.includes(value)) throw new Error(`System health events must not publish sensitive telemetry: ${value}`)
}

if (!router.includes('failedDependencyCount:') || !router.includes('staleWorkerCount:') || !router.includes('memoryPercent:')) {
  throw new Error('System health events must publish bounded operational summaries')
}

console.log('System health real-time event checks passed')
