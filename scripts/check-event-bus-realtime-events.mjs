import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/eventBusRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishEventBusRealtimeEvent('event-bus.subscription-updated'",
  "publishEventBusRealtimeEvent('event-bus.subscription-deleted'",
  "publishEventBusRealtimeEvent('event-bus.event-replayed'",
  "publishEventBusRealtimeEvent('event-bus.dead-letter-replayed'",
  'subscriptionCount:',
  'enabledSubscriptionCount:',
  'eventCount:',
  'pendingDeliveryCount:',
  'processingDeliveryCount:',
  'deadLetterCount:',
  'maximumAttempts:',
  'metadataFieldCount:',
  'deliveryCount:',
  'deadLetterReplay:',
]) {
  if (!router.includes(token)) failures.push(`Missing event bus realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function eventBusRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishEventBusRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'subscriptionId:', 'eventId:', 'sourceEventId:', 'replayEventId:', 'deadLetterId:',
  'topic:', 'topicPattern:', 'handler:', 'metadata:', 'payload:', 'headers:', 'correlationId:',
  'causationId:', 'source:', 'error:', 'lastError:', 'actor:', 'session', 'email:', 'role:',
  'createdAt:', 'updatedAt:', 'publishedAt:', 'deliveredAt:', 'replayedAt:', 'req.body',
  'req.params', '...result', '...event', '...subscription', '...deadLetter',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Event bus event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishEventBusRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Event bus events must use an awaited aggregate-only canonical publisher')
}

const subscriptionGuard = router.indexOf('if (!subscriptionPatchChanges(existing, input)) return existing')
const subscriptionMutation = router.indexOf('const result = await upsertSubscription(')
const subscriptionPublish = router.indexOf("await publishEventBusRealtimeEvent('event-bus.subscription-updated'")
if (subscriptionGuard < 0 || subscriptionMutation < subscriptionGuard || subscriptionPublish < subscriptionMutation) {
  failures.push('Unchanged event subscriptions must return before persistence and publication')
}

const deleteGuard = router.indexOf("if (!existing) return { deleted: false, id: req.params.subscriptionId }")
const deleteMutation = router.indexOf('const result = await deleteSubscription(')
const deletePublish = router.indexOf("await publishEventBusRealtimeEvent('event-bus.subscription-deleted'")
if (deleteGuard < 0 || deleteMutation < deleteGuard || deletePublish < deleteMutation) {
  failures.push('Missing event subscriptions must not be persisted or published')
}

const replayMutation = router.indexOf('const result = await replayEvent(')
const replayPublish = router.indexOf("await publishEventBusRealtimeEvent('event-bus.event-replayed'")
if (replayMutation < 0 || replayPublish < replayMutation) failures.push('Event replay must persist before publication')

const deadLetterGuard = router.indexOf("if (existing?.replayedAt) return { replayed: false, alreadyReplayed: true }")
const deadLetterMutation = router.indexOf('const result = await replayDeadLetter(')
const deadLetterPublish = router.indexOf("await publishEventBusRealtimeEvent('event-bus.dead-letter-replayed'")
if (deadLetterGuard < 0 || deadLetterMutation < deadLetterGuard || deadLetterPublish < deadLetterMutation) {
  failures.push('Already-replayed dead letters must return before persistence and publication')
}

const publishRouteStart = router.indexOf("router.post('/publish'")
const processRouteStart = router.indexOf("router.post('/process'")
const publishRoute = router.slice(publishRouteStart, processRouteStart)
if (publishRoute.includes('publishEventBusRealtimeEvent(')) failures.push('Administrative event publication must not emit recursive event-bus meta-events')

for (const topic of [
  'event-bus.subscription-updated',
  'event-bus.subscription-deleted',
  'event-bus.event-replayed',
  'event-bus.dead-letter-replayed',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Event bus topic must be owned by the canonical event bus publisher: ${topic}`)
}

if (failures.length) {
  console.error('Event bus real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Event bus real-time event checks passed')
