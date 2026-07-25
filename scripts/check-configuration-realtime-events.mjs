import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/configurationRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'configuration.validated',
  'configuration.deployment-readiness-checked',
  'configuration.updated',
  'configuration.environment-activated',
  'configuration.secret-updated',
  'configuration.secret-deleted',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Configuration router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing configuration real-time event: ${topic}`)
}

if (!router.includes('id: req.session?.userId || null') || !router.includes('email: req.session?.email || null')) {
  throw new Error('Configuration events must include the authenticated actor')
}

if (router.includes('value: req.body?.value') || router.includes('value: secret.value') || router.includes('encrypted:')) {
  throw new Error('Configuration real-time events must never publish raw or encrypted secret values')
}

if (!router.includes('changedKeys: Object.keys')) {
  throw new Error('Configuration update events must publish changed keys instead of configuration values')
}

console.log('Configuration real-time event checks passed')
