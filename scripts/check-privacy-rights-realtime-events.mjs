import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/privacyRightsRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishPrivacyRightsRealtimeEvent('privacy.compliance-report-generated'",
  "publishPrivacyRightsRealtimeEvent('privacy.consent-evaluated'",
  "publishPrivacyRightsRealtimeEvent('privacy.consent-policy-updated'",
  "'privacy.consent-granted' : 'privacy.consent-withdrawn'",
  "publishPrivacyRightsRealtimeEvent('privacy.consent-withdrawn'",
  "publishPrivacyRightsRealtimeEvent('privacy.request-created'",
  "publishPrivacyRightsRealtimeEvent('privacy.request-verified'",
  "publishPrivacyRightsRealtimeEvent('privacy.request-updated'",
  'policyCount:',
  'activePolicyCount:',
  'consentRecordCount:',
  'grantedConsentCount:',
  'withdrawnConsentCount:',
  'requestCount:',
  'openRequestCount:',
  'verifiedRequestCount:',
  'fulfilledRequestCount:',
  'rejectedRequestCount:',
  'assigned:',
  'verified:',
]) {
  if (!router.includes(token)) failures.push(`Missing privacy rights realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function privacyRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishPrivacyRightsRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'accountId:', 'websiteId:', 'subjectId:', 'subjectHash:', 'policyId:', 'consentId:', 'requestId:',
  'verificationToken:', 'verificationTokenHash:', 'policyVersion:', 'version:', 'type:', 'status:',
  'purpose:', 'lawfulBasis:', 'evidence:', 'details:', 'fulfilment:', 'assignedTo:', 'statistics:',
  'generatedAt:', 'effectiveAt:', 'recordedAt:', 'submittedAt:', 'verifiedAt:', 'dueAt:',
  'fulfilledAt:', 'rejectedAt:', 'createdAt:', 'updatedAt:', 'actor:', 'session', 'email:', 'role:',
  'payload:', 'metadata:', 'req.body', 'req.params', 'req.query', '...result', '...subject',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Privacy rights event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishPrivacyRightsRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Privacy rights events must use an awaited aggregate-only canonical publisher')
}

const policyGuard = router.indexOf('if (!consentPolicyPatchChanges(existing, input)) return existing')
const policyMutation = router.indexOf('const policy = await upsertConsentPolicy(')
const policyPublish = router.indexOf("await publishPrivacyRightsRealtimeEvent('privacy.consent-policy-updated'")
if (policyGuard < 0 || policyMutation < policyGuard || policyPublish < policyMutation) {
  failures.push('Unchanged consent policies must return before persistence and publication')
}

const evaluationRead = router.indexOf('const result = await getEffectiveConsent(')
const evaluationPublish = router.indexOf("await publishPrivacyRightsRealtimeEvent('privacy.consent-evaluated'")
if (evaluationRead < 0 || evaluationPublish < evaluationRead) failures.push('Consent evaluation must complete before publication')

const consentMutation = router.indexOf('const consent = await recordConsent(')
const consentPublish = router.indexOf('await publishPrivacyRightsRealtimeEvent(', consentMutation)
if (consentMutation < 0 || consentPublish < consentMutation) failures.push('Consent persistence must complete before publication')

const withdrawMutation = router.indexOf('const consent = await withdrawConsent(')
const withdrawPublish = router.indexOf("await publishPrivacyRightsRealtimeEvent('privacy.consent-withdrawn'", withdrawMutation)
if (withdrawMutation < 0 || withdrawPublish < withdrawMutation) failures.push('Consent withdrawal must persist before publication')

const requestCreateMutation = router.indexOf('const result = await createPrivacyRequest(')
const requestCreatePublish = router.indexOf("await publishPrivacyRightsRealtimeEvent('privacy.request-created'")
if (requestCreateMutation < 0 || requestCreatePublish < requestCreateMutation) failures.push('Privacy request creation must persist before publication')

const verifyMutation = router.indexOf('const request = await verifyPrivacyRequest(')
const verifyPublish = router.indexOf("await publishPrivacyRightsRealtimeEvent('privacy.request-verified'")
if (verifyMutation < 0 || verifyPublish < verifyMutation) failures.push('Privacy request verification must persist before publication')

const requestGuard = router.indexOf('if (existing && !requestPatchChanges(existing, input)) return existing')
const requestMutation = router.indexOf('const request = await updatePrivacyRequest(')
const requestPublish = router.indexOf("await publishPrivacyRightsRealtimeEvent('privacy.request-updated'")
if (requestGuard < 0 || requestMutation < requestGuard || requestPublish < requestMutation) {
  failures.push('Unchanged privacy requests must return before persistence and publication')
}

for (const topic of [
  'privacy.compliance-report-generated',
  'privacy.consent-evaluated',
  'privacy.consent-policy-updated',
  'privacy.consent-granted',
  'privacy.consent-withdrawn',
  'privacy.request-created',
  'privacy.request-verified',
  'privacy.request-updated',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Privacy rights topic must be owned by the canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('Privacy rights real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Privacy rights real-time event checks passed')
