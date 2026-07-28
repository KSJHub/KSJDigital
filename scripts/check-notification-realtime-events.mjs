import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/notificationRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/notificationService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishNotificationRealtimeEvent('notification.template-updated'",
  "publishNotificationRealtimeEvent('notification.recipient-updated'",
  "publishNotificationRealtimeEvent('notification.rate-limit-updated'",
  "publishNotificationRealtimeEvent('notification.queued'",
  "publishNotificationDeliveryRealtimeEvent('notification.delivery-started'",
  "publishNotificationDeliveryRealtimeEvent('notification.delivered'",
  "publishNotificationDeliveryRealtimeEvent('notification.failed'",
  'templateCount:',
  'enabledTemplateCount:',
  'recipientCount:',
  'enabledRecipientCount:',
  'deliveryCount:',
  'queuedCount:',
  'attemptCount:',
  'hasMessageData:',
  'hasProviderResult:',
  'hasError:',
  'retryable:',
]) {
  if (!`${router}\n${service}`.includes(token)) failures.push(`Missing notification realtime marker: ${token}`)
}

const routerPayloadStart = router.indexOf('function notificationRegistryPayload(')
const routerPayloadEnd = router.indexOf('\n}\n\nasync function publishNotificationRealtimeEvent', routerPayloadStart)
const routerPayloadSource = routerPayloadStart >= 0 && routerPayloadEnd > routerPayloadStart ? router.slice(routerPayloadStart, routerPayloadEnd) : ''
const deliveryPayloadStart = service.indexOf('function deliveryRealtimePayload(')
const deliveryPayloadEnd = service.indexOf('\n}\n\nasync function publishNotificationDeliveryRealtimeEvent', deliveryPayloadStart)
const deliveryPayloadSource = deliveryPayloadStart >= 0 && deliveryPayloadEnd > deliveryPayloadStart ? service.slice(deliveryPayloadStart, deliveryPayloadEnd) : ''
const payloadSource = `${routerPayloadSource}\n${deliveryPayloadSource}`

for (const forbidden of [
  'accountId:', 'templateId:', 'recipientId:', 'deliveryId:', 'jobId:', 'jobIds:', 'websiteId:',
  'provider:', 'address:', 'message:', 'variables:', 'deduplicationKey:', 'providerResult:',
  'actor:', 'session', 'email:', 'userId:', 'createdAt:', 'updatedAt:', 'deliveredAt:', 'failedAt:',
  'req.body', 'req.params', '...template', '...recipient', '...delivery', '...queued',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Notification event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishNotificationRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Notification request events must publish aggregate payloads without actor metadata')
}
if (!service.includes("async function publishNotificationDeliveryRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Notification delivery events must publish aggregate payloads without actor metadata')
}

const templateGuard = router.indexOf('if (!templatePatchChanges(existing, input)) return res.json(existing)')
const templateMutation = router.indexOf('const template = await upsertNotificationTemplate(')
const templatePublish = router.indexOf("await publishNotificationRealtimeEvent('notification.template-updated'")
if (templateGuard < 0 || templateMutation < templateGuard || templatePublish < templateMutation) {
  failures.push('Unchanged notification templates must return before persistence and publication')
}

const recipientGuard = router.indexOf('if (!recipientPatchChanges(existing, input)) return res.json(existing)')
const recipientMutation = router.indexOf('const recipient = await upsertNotificationRecipient(')
const recipientPublish = router.indexOf("await publishNotificationRealtimeEvent('notification.recipient-updated'")
if (recipientGuard < 0 || recipientMutation < recipientGuard || recipientPublish < recipientMutation) {
  failures.push('Unchanged notification recipients must return before persistence and publication')
}

const rateGuard = router.indexOf('if (!rateLimitPatchChanges(existing, input)) return res.json(existing)')
const rateMutation = router.indexOf('const policy = await updateNotificationRateLimit(')
const ratePublish = router.indexOf("await publishNotificationRealtimeEvent('notification.rate-limit-updated'")
if (rateGuard < 0 || rateMutation < rateGuard || ratePublish < rateMutation) {
  failures.push('Unchanged notification rate limits must return before persistence and publication')
}

if (!router.includes("if (newlyQueued > 0) await publishNotificationRealtimeEvent('notification.queued'")) {
  failures.push('Idempotent notification queue requests must not publish duplicate queued events')
}

const duplicateGuard = service.indexOf("if (duplicate) return { __skipWrite: true, value: { ...duplicate, duplicate: true } }")
const deliveryStartedPublish = service.indexOf("await publishNotificationDeliveryRealtimeEvent('notification.delivery-started'")
if (duplicateGuard < 0 || deliveryStartedPublish < duplicateGuard) {
  failures.push('Duplicate delivered notifications must return before persistence and publication')
}
if (!service.includes('if (result?.__skipWrite === true) return result.value')) {
  failures.push('Notification storage must support semantic no-write results')
}

for (const topic of [
  'notification.template-updated', 'notification.recipient-updated', 'notification.rate-limit-updated',
  'notification.queued', 'notification.delivery-started', 'notification.delivered', 'notification.failed',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`) || service.includes(`publishDomainEvent('${topic}'`)) {
    failures.push(`Notification topic must be owned by a canonical notification publisher: ${topic}`)
  }
}

if (failures.length) {
  console.error('Notification real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Notification real-time event checks passed')
