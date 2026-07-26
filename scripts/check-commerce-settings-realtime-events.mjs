import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/commerceSettingsRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishDomainEvent('commerce-settings.updated'",
  'enabledProviderCount:',
  'shippingEnabled:',
  'freeShippingEnabled:',
  'taxEnabled:',
  'pricesIncludeTax:',
  'taxShipping:',
  'activeDiscountCount:',
  'hasOrderNotifications:',
  'hasSupportContact:',
  'hasDiscordNotifications:',
]) {
  if (!source.includes(token)) failures.push(`Missing commerce settings realtime marker: ${token}`)
}

const payloadStart = source.indexOf('function commerceSettingsEventPayload(')
const payloadEnd = source.indexOf('\n}\n\nasync function publishCommerceSettingsEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'websiteId',
  'req.body',
  'req.params',
  'successUrl',
  'cancelUrl',
  'paypalReturnUrl',
  'orderEmail,',
  'supportEmail,',
  'replyTo',
  'discordWebhookUrl,',
  'deliveryMessage',
  'returnsMessage',
  'standardShippingLabel',
  'standardShippingRate',
  'freeShippingThreshold',
  'estimatedDeliveryMinDays',
  'estimatedDeliveryMaxDays',
  'taxLabel',
  'taxRate',
  'taxNumber',
  'discount.code',
  'discount.value',
  'minimumSpend',
  'expiresAt',
  'process.env',
  'session',
  'cookie',
  'authorization',
  'actor(req)',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Commerce settings event payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("await publishDomainEvent('commerce-settings.updated', commerceSettingsEventPayload(settings))")) {
  failures.push('Commerce settings events must publish without actor-derived identifying headers')
}
if (!source.includes('await writeJson(paths.commerceSettings(safeName(websiteId)), settings)\n  await publishCommerceSettingsEvent(settings)')) {
  failures.push('Commerce settings update event must publish after successful persistence')
}
if (!source.includes('export async function recordDiscountUse') || source.includes("publishDomainEvent('commerce-settings.discount-used'")) {
  failures.push('Discount usage bookkeeping must not duplicate configuration lifecycle events')
}

if (failures.length) {
  console.error('Commerce settings real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Commerce settings real-time event checks passed')
