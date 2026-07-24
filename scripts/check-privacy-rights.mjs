import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-privacy-rights-'))
process.chdir(temporary)
try {
  const serviceFile = path.join(root, 'server/services/privacyRightsService.js')
  const privacy = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)
  const actor = { id: 'check-owner' }

  const policy = await privacy.upsertConsentPolicy({ id: 'marketing', version: '1.0', name: 'Marketing consent', purpose: 'Send product updates', active: true }, actor)
  assert.equal(policy.id, 'marketing')
  assert.equal(policy.version, '1.0')

  const granted = await privacy.recordConsent({ websiteId: 'site-one', subjectId: 'person@example.com', policyId: 'marketing', granted: true, evidence: { channel: 'form' } }, actor)
  assert.equal(granted.status, 'granted')
  assert.equal((await privacy.getEffectiveConsent({ websiteId: 'site-one', subjectId: 'person@example.com', policyId: 'marketing' })).status, 'granted')

  const withdrawn = await privacy.withdrawConsent({ websiteId: 'site-one', subjectId: 'person@example.com', policyId: 'marketing' }, actor)
  assert.equal(withdrawn.status, 'withdrawn')
  assert.equal((await privacy.getEffectiveConsent({ websiteId: 'site-one', subjectId: 'person@example.com', policyId: 'marketing' })).status, 'withdrawn')

  const submitted = await privacy.createPrivacyRequest({ websiteId: 'site-one', subjectId: 'person@example.com', type: 'access', details: 'Provide my data' }, actor)
  assert.equal(submitted.request.status, 'verification-required')
  assert(submitted.verificationToken)
  assert.equal('verificationTokenHash' in submitted.request, false)

  await assert.rejects(() => privacy.updatePrivacyRequest(submitted.request.id, { status: 'fulfilled' }, actor), /verified first/)
  const verified = await privacy.verifyPrivacyRequest(submitted.request.id, submitted.verificationToken, actor)
  assert.equal(verified.status, 'verified')
  const fulfilled = await privacy.updatePrivacyRequest(submitted.request.id, { status: 'fulfilled', fulfilment: { method: 'secure-download' } }, actor)
  assert.equal(fulfilled.status, 'fulfilled')
  assert(fulfilled.fulfilledAt)

  const report = await privacy.createPrivacyComplianceReport()
  assert.equal(report.activePolicyCount, 1)
  assert.equal(report.statistics.consentGranted, 1)
  assert.equal(report.statistics.consentWithdrawn, 1)
  assert.equal(report.statistics.requestsFulfilled, 1)
  assert.equal(report.controls.requestVerification, true)

  const router = await fs.readFile(path.join(root, 'server/privacyRightsRouter.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(router, /Owner permission required/)
  assert.match(router, /requests\/:requestId\/verify/)
  assert.match(start, /createPrivacyRightsRouter/)
  assert.match(start, /\/api\/privacy-rights/)

  console.log('Consent and privacy-rights checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
