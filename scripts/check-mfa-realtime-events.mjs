import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/mfaRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishMfaRealtimeEvent('mfa.enrollment-started'",
  "publishMfaRealtimeEvent('mfa.enabled'",
  "publishMfaRealtimeEvent('mfa.verified'",
  "publishMfaRealtimeEvent('mfa.verification-failed'",
  "publishMfaRealtimeEvent('mfa.trusted-device-verified'",
  "publishMfaRealtimeEvent('mfa.disabled'",
  "publishMfaRealtimeEvent('mfa.login-risk-evaluated'",
  "publishMfaRealtimeEvent('mfa.step-up-created'",
  "publishMfaRealtimeEvent('mfa.step-up-completed'",
  "publishMfaRealtimeEvent('mfa.trusted-device-revoked'",
  'accountCount:',
  'enabledAccountCount:',
  'pendingChallengeCount:',
  'activeTrustedDeviceCount:',
  'recoveryCodesRemaining:',
  'assuranceLevel:',
  'usedRecoveryCode:',
  'trustedDeviceCreated:',
  'riskScore:',
  'signalCount:',
  'requiresMfa:',
  'requiredLevel:',
]) {
  if (!router.includes(token)) failures.push(`Missing MFA realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function mfaRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishMfaRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'accountId:', 'challengeId:', 'deviceId:', 'actor:', 'payload:', 'session', 'email:', 'role:',
  'secret:', 'otpauthUri:', 'recoveryCodes:', 'recoveryCode:', 'trustedDeviceToken:', 'token:',
  'code:', 'userAgent:', 'ip:', 'reasons:', 'method:', 'expiresAt:', 'assuranceExpiresAt:',
  'createdAt:', 'updatedAt:', 'disabledAt:', 'revokedAt:', 'req.body', 'req.params',
  '...result', '...account', '...challenge', '...device',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`MFA event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishMfaRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('MFA events must publish aggregate payloads through an awaited canonical publisher')
}

const disableGuard = router.indexOf("if (existing?.enabled !== true && existing) return existing")
const disableMutation = router.indexOf('const result = await disableMfa(')
const disablePublish = router.indexOf("await publishMfaRealtimeEvent('mfa.disabled'")
if (disableGuard < 0 || disableMutation < disableGuard || disablePublish < disableMutation) {
  failures.push('Already-disabled MFA accounts must return before persistence and publication')
}

const revokeGuard = router.indexOf("if (existing?.effectiveStatus === 'revoked') return existing")
const revokeMutation = router.indexOf('const result = await revokeTrustedDevice(')
const revokePublish = router.indexOf("await publishMfaRealtimeEvent('mfa.trusted-device-revoked'")
if (revokeGuard < 0 || revokeMutation < revokeGuard || revokePublish < revokeMutation) {
  failures.push('Already-revoked trusted devices must return before persistence and publication')
}

const verifyMutation = router.indexOf('const result = await verifySecondFactor(')
const verifyPublish = router.indexOf("await publishMfaRealtimeEvent('mfa.verified'")
const failedPublish = router.indexOf("await publishMfaRealtimeEvent('mfa.verification-failed'")
if (verifyMutation < 0 || verifyPublish < verifyMutation || failedPublish < verifyMutation) {
  failures.push('MFA verification outcomes must publish only after verification persistence')
}

const riskMutation = router.indexOf('const result = await evaluateLoginRisk(')
const riskPublish = router.indexOf("await publishMfaRealtimeEvent('mfa.login-risk-evaluated'")
if (riskMutation < 0 || riskPublish < riskMutation) failures.push('Login risk events must publish after risk persistence')

const stepCompleteMutation = router.indexOf('const result = await completeStepUpChallenge(')
const stepCompletePublish = router.indexOf("await publishMfaRealtimeEvent('mfa.step-up-completed'")
if (stepCompleteMutation < 0 || stepCompletePublish < stepCompleteMutation) failures.push('Step-up completion must persist before publication')

for (const topic of [
  'mfa.enrollment-started', 'mfa.enabled', 'mfa.verified', 'mfa.verification-failed',
  'mfa.trusted-device-verified', 'mfa.disabled', 'mfa.login-risk-evaluated',
  'mfa.step-up-created', 'mfa.step-up-completed', 'mfa.trusted-device-revoked',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`MFA topic must be owned by the canonical MFA publisher: ${topic}`)
}

if (failures.length) {
  console.error('MFA real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('MFA real-time event checks passed')
