import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/releaseRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'release.created',
  'release.maintenance-enabled',
  'release.maintenance-disabled',
  'release.deployment-locked',
  'release.deployment-unlocked',
  'release.deployment-planned',
  'release.promoted',
  'release.rolled-back',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Release router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing release real-time event: ${topic}`)
}

if (!router.includes('id: req.session?.userId || null') || !router.includes('email: req.session?.email || null')) {
  throw new Error('Release events must include the authenticated actor')
}

const sensitiveEventFields = [
  'lockToken:',
  'confirmationToken:',
  'token: lock.token',
]
for (const field of sensitiveEventFields) {
  if (router.includes(field)) throw new Error(`Release events must not publish sensitive field: ${field}`)
}

console.log('Release real-time event checks passed')
