import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/backupRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'backup.created',
  'backup.pruned',
  'backup.settings-updated',
  'backup.verified',
  'backup.restore-previewed',
  'backup.restored',
  'backup.deleted',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Backup router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing backup real-time event: ${topic}`)
}

if (!router.includes('id: req.session?.userId || null') || !router.includes('email: req.session?.email || null')) {
  throw new Error('Backup events must include the authenticated actor')
}

if (router.includes('confirmationToken: preview.confirmationToken')) {
  throw new Error('Backup restore confirmation tokens must not be published in real-time events')
}

console.log('Backup real-time event checks passed')
