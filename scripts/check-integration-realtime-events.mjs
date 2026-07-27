import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/integrationRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishIntegrationRealtimeEvent('integration.subscription-created'",
  "publishIntegrationRealtimeEvent('integration.subscription-updated'",
  "publishIntegrationRealtimeEvent('integration.subscription-deleted'",
  "publishIntegrationRealtimeEvent('integration.delivery-retried'",
  "publishIntegrationRealtimeEvent('integration.queue-processed'",
  "publishIntegrationRealtimeEvent('integration.settings-updated'",
  "publishIntegrationRealtimeEvent('integration.event-published'",
  'subscriptionCount:',
  'enabledSubscriptionCount:',
  'deliveryCount:',
  'eventSubscriptionCount:',
  'hasCustomHeaders:',
  'processedCount:',
  'deliveredCount:',
  'retryingCount:',
  'failedCount:',
  'cancelledCount:',
  'queuedCount:',
]) {
  if (!router.includes(token)) failures.push(`Missing integration realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function integrationRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nfunction subscriptionPatchChanges', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'websiteId:',
  'integrationId:',
  'deliveryId:',
  'deliveryIds:',
  'eventName:',
  'provider:',
  'events:',
  'url:',
  'secret:',
  'headers:',
  'actor:',
  'requestedBy',
  'session',
  'email:',
  'userId:',
  'req.body',
  'req.params',
  '...integration',
  '...delivery',
  '...result',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Integration event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishIntegrationRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Integration events must publish aggregate payloads without actor-derived metadata')
}

const subscriptionGuard = router.indexOf('if (!subscriptionPatchChanges(existing, input)) return res.json(existing)')
const subscriptionMutation = router.indexOf('const integration = await upsertIntegration(req.params.websiteId, { ...input, id: req.params.integrationId })')
const subscriptionPublish = router.indexOf("await publishIntegrationRealtimeEvent('integration.subscription-updated'")
if (subscriptionGuard < 0 || subscriptionMutation < subscriptionGuard || subscriptionPublish < subscriptionMutation) {
  failures.push('Unchanged integration subscriptions must return before persistence and publication')
}

const queueGuard = router.indexOf("if (result.processed > 0) await publishIntegrationRealtimeEvent('integration.queue-processed'")
if (queueGuard < 0) failures.push('Empty integration queue runs must not publish realtime events')

const settingsGuard = router.indexOf('if (!settingsPatchChanges(registry.settings, input)) return res.json(registry.settings)')
const settingsMutation = router.indexOf('const settings = await updateIntegrationSettings(req.params.websiteId, input)')
const settingsPublish = router.indexOf("await publishIntegrationRealtimeEvent('integration.settings-updated'")
if (settingsGuard < 0 || settingsMutation < settingsGuard || settingsPublish < settingsMutation) {
  failures.push('Unchanged integration settings must return before persistence and publication')
}

const eventGuard = router.indexOf("if (result.queued > 0) await publishIntegrationRealtimeEvent('integration.event-published'")
if (eventGuard < 0) failures.push('Integration events with no queued deliveries must not publish realtime events')

for (const topic of [
  'integration.subscription-created',
  'integration.subscription-updated',
  'integration.subscription-deleted',
  'integration.delivery-retried',
  'integration.queue-processed',
  'integration.settings-updated',
  'integration.event-published',
]) {
  const direct = `publishDomainEvent('${topic}'`
  if (router.includes(direct)) failures.push(`Integration topic must be owned by the canonical integration publisher: ${topic}`)
}

if (failures.length) {
  console.error('Integration real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Integration real-time event checks passed')
