import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/dataPortabilityRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'data-portability.export-created',
  'data-portability.export-downloaded',
  'data-portability.export-deleted',
  'data-portability.package-validated',
  'data-portability.import-validated',
  'data-portability.import-completed',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Data portability router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing data portability real-time event: ${topic}`)
}

if (!router.includes('id: req.session?.userId || req.session?.email || \'owner\'') || !router.includes('email: req.session?.email || null')) {
  throw new Error('Data portability events must include the authenticated actor')
}

for (const sensitive of ['result.bytes', 'internalPath', 'req.body?.data', 'result.package?.collections', 'result.package?.assetFiles']) {
  const eventSection = router.slice(router.indexOf('function publishPortabilityEvent'))
  if (eventSection.includes(`payload: ${sensitive}`)) throw new Error(`Data portability events must not publish sensitive package data: ${sensitive}`)
}

console.log('Data portability real-time event checks passed')
