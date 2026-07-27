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

const saveStart = source.indexOf('async function saveSettings(')
const saveEnd = source.indexOf('\nfunction canAccessWebsite', saveStart)
const saveSource = saveStart >= 0 && saveEnd > saveStart ? source.slice(saveStart, saveEnd) : ''
const validationAt = saveSource.indexOf('const errors = validate(settings)')
const validationGuardAt = saveSource.indexOf("if (errors.length) throw new Error(errors.join('; '))")
const writeAt = saveSource.indexOf('await writeJson(paths.commerceSettings(safeName(websiteId)), settings)')
const publishAt = saveSource.indexOf('await publishCommerceSettingsEvent(settings)')
if (validationAt < 0 || validationGuardAt < validationAt || writeAt < validationGuardAt || publishAt < writeAt) {
  failures.push('Commerce settings must validate before persistence and publish only after successful persistence')
}

const routerStart = source.indexOf('export function createCommerceSettingsRouter()')
const routerSource = routerStart >= 0 ? source.slice(routerStart) : ''
const putStart = routerSource.indexOf("router.put('/:websiteId'")
const putSource = putStart >= 0 ? routerSource.slice(putStart, routerSource.indexOf('\n  })', putStart) + 5) : ''
for (const guard of [
  "if (!canAccessWebsite(req.session, req.params.websiteId)) return res.status(403)",
  "if (req.session.role !== 'owner' && !req.session.canEdit) return res.status(403)",
]) {
  const guardAt = putSource.indexOf(guard)
  const saveAt = putSource.indexOf('saveSettings(req.params.websiteId, req.body || {})')
  if (guardAt < 0 || saveAt < guardAt) failures.push(`Commerce settings update must enforce access before persistence: ${guard}`)
}

if (!source.includes('export async function recordDiscountUse') || source.includes("publishDomainEvent('commerce-settings.discount-used'")) {
  failures.push('Discount usage bookkeeping must not duplicate configuration lifecycle events')
}

const discountStart = source.indexOf('export async function recordDiscountUse(')
const discountEnd = source.indexOf('\nfunction validReturnUrl', discountStart)
const discountSource = discountStart >= 0 && discountEnd > discountStart ? source.slice(discountStart, discountEnd) : ''
if (!discountSource.includes('if (!code) return')) {
  failures.push('Empty discount usage bookkeeping must return before persistence')
}
if (discountSource.includes('publishCommerceSettingsEvent') || discountSource.includes('publishDomainEvent')) {
  failures.push('Discount usage bookkeeping must not publish commerce settings lifecycle events')
}

if (failures.length) {
  console.error('Commerce settings real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Commerce settings real-time event checks passed')
