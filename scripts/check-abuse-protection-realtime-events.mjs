import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/abuseProtectionRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/abuseProtectionService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishAbuseProtectionRealtimeEvent('abuse-protection.policy-updated'",
  "publishAbuseProtectionRealtimeEvent('abuse-protection.policy-deleted'",
  "publishAbuseProtectionRealtimeEvent('abuse-protection.trusted-proxies-updated'",
  "publishAbuseProtectionRealtimeEvent('abuse-protection.override-created'",
  "publishAbuseProtectionRealtimeEvent('abuse-protection.override-removed'",
  "publishAbuseEnforcementRealtimeEvent('abuse-protection.request-blocked'",
  'policyCount:',
  'enabledPolicyCount:',
  'overrideCount:',
  'activeBlockCount:',
  'trustedProxyCount:',
  'methodCount:',
  'subjectTypeCount:',
  'rateLimited:',
  'overrideApplied:',
  'statusCode:',
]) {
  if (!`${router}\n${service}`.includes(token)) failures.push(`Missing abuse protection realtime marker: ${token}`)
}

const routerPayloadStart = router.indexOf('function abuseRegistryPayload(')
const routerPayloadEnd = router.indexOf('\n}\n\nasync function publishAbuseProtectionRealtimeEvent', routerPayloadStart)
const routerPayloadSource = routerPayloadStart >= 0 && routerPayloadEnd > routerPayloadStart ? router.slice(routerPayloadStart, routerPayloadEnd) : ''
const servicePayloadStart = service.indexOf('function blockedRequestRealtimePayload(')
const servicePayloadEnd = service.indexOf('\n}\nasync function publishAbuseEnforcementRealtimeEvent', servicePayloadStart)
const servicePayloadSource = servicePayloadStart >= 0 && servicePayloadEnd > servicePayloadStart ? service.slice(servicePayloadStart, servicePayloadEnd) : ''
const payloadSource = `${routerPayloadSource}\n${servicePayloadSource}`

for (const forbidden of [
  'policyId:', 'overrideId:', 'subjectId:', 'subjectType:', 'route:', 'method:', 'reason:',
  'trustedProxies:', 'ip:', 'sessionId:', 'accountId:', 'apiKeyId:', 'actor:', 'session',
  'email:', 'role:', 'createdAt:', 'updatedAt:', 'expiresAt:', 'req.body', 'req.params',
  'req.headers', 'x-forwarded-for', '...result', '...decision', '...subject',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Abuse protection event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishAbuseProtectionRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Abuse protection router events must use an awaited aggregate-only publisher')
}
if (!service.includes("async function publishAbuseEnforcementRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Abuse enforcement events must use an awaited aggregate-only publisher')
}

const policyGuard = router.indexOf('if (!policyPatchChanges(existing, input)) return res.json(existing)')
const policyMutation = router.indexOf('const result = await upsertAbusePolicy(')
const policyPublish = router.indexOf("await publishAbuseProtectionRealtimeEvent('abuse-protection.policy-updated'")
if (policyGuard < 0 || policyMutation < policyGuard || policyPublish < policyMutation) failures.push('Unchanged abuse policies must return before persistence and publication')

const deleteGuard = router.indexOf("if (!existing) return res.json({ deleted: false, id: req.params.policyId })")
const deleteMutation = router.indexOf('const result = await deleteAbusePolicy(')
const deletePublish = router.indexOf("await publishAbuseProtectionRealtimeEvent('abuse-protection.policy-deleted'")
if (deleteGuard < 0 || deleteMutation < deleteGuard || deletePublish < deleteMutation) failures.push('Missing abuse policies must not be persisted or published')

const proxyGuard = router.indexOf("if (JSON.stringify(requested) === JSON.stringify(state.trustedProxies || [])) return res.json({ trustedProxies: state.trustedProxies || [] })")
const proxyMutation = router.indexOf('const trustedProxies = await updateTrustedProxies(')
const proxyPublish = router.indexOf("await publishAbuseProtectionRealtimeEvent('abuse-protection.trusted-proxies-updated'")
if (proxyGuard < 0 || proxyMutation < proxyGuard || proxyPublish < proxyMutation) failures.push('Unchanged trusted proxies must return before persistence and publication')

const duplicateOverrideGuard = router.indexOf('if (existing) return res.json(existing)')
const overrideMutation = router.indexOf('const result = await setAbuseOverride(')
const overridePublish = router.indexOf("await publishAbuseProtectionRealtimeEvent('abuse-protection.override-created'")
if (duplicateOverrideGuard < 0 || overrideMutation < duplicateOverrideGuard || overridePublish < overrideMutation) failures.push('Duplicate abuse overrides must return before persistence and publication')

const removeGuard = router.indexOf("if (!existing) return res.json({ removed: false, id: req.params.overrideId })")
const removeMutation = router.indexOf('const result = await removeAbuseOverride(')
const removePublish = router.indexOf("await publishAbuseProtectionRealtimeEvent('abuse-protection.override-removed'")
if (removeGuard < 0 || removeMutation < removeGuard || removePublish < removeMutation) failures.push('Missing abuse overrides must not be persisted or published')

if (!service.includes('if (result?.__skipWrite === true) return result.value')) failures.push('Abuse protection storage must support semantic no-write results')
if (!service.includes("if (!policies.length || !requestSubjects.length) return { __skipWrite: true")) failures.push('Empty abuse evaluations must not rewrite the registry')

const enforcementMutation = service.indexOf('const decision = await evaluateAbuseRequest(')
const enforcementPublish = service.indexOf("await publishAbuseEnforcementRealtimeEvent('abuse-protection.request-blocked'")
if (enforcementMutation < 0 || enforcementPublish < enforcementMutation) failures.push('Blocked-request events must publish only after enforcement persistence')

for (const topic of [
  'abuse-protection.policy-updated', 'abuse-protection.policy-deleted',
  'abuse-protection.trusted-proxies-updated', 'abuse-protection.override-created',
  'abuse-protection.override-removed', 'abuse-protection.request-blocked',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`) || service.includes(`publishDomainEvent('${topic}'`)) failures.push(`Abuse protection topic must be owned by a canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('Abuse protection real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Abuse protection real-time event checks passed')
