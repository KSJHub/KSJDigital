import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/retentionComplianceRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'retention-compliance.report-generated',
  'retention-compliance.policy-updated',
  'retention-compliance.policy-deleted',
  'retention-compliance.policy-previewed',
  'retention-compliance.policy-executed',
  'retention-compliance.legal-hold-updated',
  'retention-compliance.legal-hold-deleted',
  'retention-compliance.cycle-run',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Retention compliance router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing retention compliance real-time event: ${topic}`)
}

if (!router.includes("id: req.session?.userId || req.session?.email || 'owner'") || !router.includes('email: req.session?.email || null')) {
  throw new Error('Retention compliance events must include the authenticated actor')
}

const forbiddenPayloads = [
  'candidates: preview.candidates',
  'held: preview.held',
  'recordIds: hold.recordIds',
  'reason: hold.reason',
  'recordFingerprint:',
  'fingerprint:',
]
for (const payload of forbiddenPayloads) {
  if (router.includes(payload)) throw new Error(`Retention compliance events expose sensitive retention data: ${payload}`)
}

if (!router.includes('candidateCount: preview.candidateCount') || !router.includes('recordCount: hold.recordIds.length')) {
  throw new Error('Retention compliance events must publish safe aggregate counts')
}

console.log('Retention compliance real-time event checks passed')
