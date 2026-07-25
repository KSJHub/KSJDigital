import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/privacyRightsRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'privacy.compliance-report-generated',
  'privacy.consent-evaluated',
  'privacy.consent-policy-updated',
  'privacy.consent-granted',
  'privacy.consent-withdrawn',
  'privacy.request-created',
  'privacy.request-verified',
  'privacy.request-updated',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Privacy rights router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing privacy rights real-time event: ${topic}`)
}

if (!router.includes('id: req.session?.userId || req.session?.email || \'owner\'') || !router.includes('email: req.session?.email || null')) {
  throw new Error('Privacy rights events must include the authenticated actor')
}

if (!router.includes('subjectHash:') || router.includes('subjectId:') || router.includes('verificationToken: result.verificationToken')) {
  throw new Error('Privacy rights events must use hashed subject identifiers and exclude verification tokens')
}

if (router.includes('evidence: consent.evidence') || router.includes('details: result.request.details') || router.includes('fulfilment: request.fulfilment')) {
  throw new Error('Privacy rights events must not publish sensitive evidence, request details or fulfilment content')
}

console.log('Privacy rights real-time event checks passed')
