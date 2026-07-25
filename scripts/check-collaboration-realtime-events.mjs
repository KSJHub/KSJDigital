import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/collaborationRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'collaboration.session-created',
  'collaboration.session-heartbeat',
  'collaboration.session-closed',
  'collaboration.session-recovered',
  'collaboration.lock-acquired',
  'collaboration.lock-released',
  'collaboration.change-applied',
  'collaboration.conflict-detected',
  'collaboration.conflict-resolved',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Collaboration router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing collaboration real-time event: ${topic}`)
}

if (!router.includes("id: req.session?.userId || req.session?.email || 'owner'") || !router.includes('email: req.session?.email || null')) {
  throw new Error('Collaboration events must include the authenticated actor')
}

const forbiddenPayloads = [
  'session }, currentActor',
  'lock }, currentActor',
  'change }, currentActor',
  'conflict }, currentActor',
  'cursor: session.cursor',
  'selection: session.selection',
  'metadata: session.metadata',
  'value: change.value',
  'notes: conflict.notes',
]

for (const payload of forbiddenPayloads) {
  if (router.includes(payload)) throw new Error(`Collaboration events expose sensitive or oversized payload data: ${payload}`)
}

if (!router.includes('hasCursor: Boolean(session.cursor)') || !router.includes('hasSelection: Boolean(session.selection)')) {
  throw new Error('Collaboration heartbeat events must expose cursor and selection presence only')
}

console.log('Collaboration real-time event checks passed')
