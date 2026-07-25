import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/migrationRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'migration.registered',
  'migration.planned',
  'migration.applied',
  'migration.rolled-back',
  'migration.locked',
  'migration.unlocked',
  'retention.policy-updated',
  'retention.planned',
  'retention.executed',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Migration router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing migration real-time event: ${topic}`)
}

if (!router.includes('id: req.session?.userId || null') || !router.includes('email: req.session?.email || null')) {
  throw new Error('Migration events must include the authenticated actor')
}

const publishPayloads = router.match(/publishDomainEvent\([\s\S]*?\}, requestedBy\)/g) || []
for (const payload of publishPayloads) {
  if (/confirmationToken\s*:|lockToken\s*:|token\s*:/.test(payload)) {
    throw new Error('Migration real-time events must not publish confirmation or lock tokens')
  }
}

console.log('Migration real-time event checks passed')
