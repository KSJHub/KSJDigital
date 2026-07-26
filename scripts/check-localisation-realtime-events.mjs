import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../server/localisationRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "import { publishDomainEvent } from './services/realtimeDomainEventService.js'",
  "publishLocalisationEvent('localisation.config-updated'",
  "'localisation.locale-updated' : 'localisation.locale-created'",
  "publishLocalisationEvent('localisation.locale-deleted'",
  "publishLocalisationEvent('localisation.fields-configured'",
  "publishLocalisationEvent('localisation.translation-published'",
  "'localisation.translation-updated' : 'localisation.translation-created'",
  'localeCount:',
  'enabledLocaleCount:',
  'fallbackLocaleCount:',
  'translationCount:',
  'publishedTranslationCount:',
  'configuredContentTypeCount:',
  'translatableFieldCount:',
  'enabled:',
  'hasFallback:',
  'removedTranslationCount:',
  'forced:',
  'status:',
  'translatedFieldCount:',
  'wasExisting:',
  'published:',
]) {
  if (!source.includes(token)) failures.push(`Missing localisation realtime marker: ${token}`)
}

const configPayloadStart = source.indexOf('function localisationConfigEventPayload(')
const configPayloadEnd = source.indexOf('\n}\n\nfunction localeEventPayload', configPayloadStart)
const localePayloadStart = source.indexOf('function localeEventPayload(')
const localePayloadEnd = source.indexOf('\n}\n\nfunction translationEventPayload', localePayloadStart)
const translationPayloadStart = source.indexOf('function translationEventPayload(')
const translationPayloadEnd = source.indexOf('\n}\n\nasync function publishLocalisationEvent', translationPayloadStart)
const payloadSource = [
  configPayloadStart >= 0 && configPayloadEnd > configPayloadStart ? source.slice(configPayloadStart, configPayloadEnd) : '',
  localePayloadStart >= 0 && localePayloadEnd > localePayloadStart ? source.slice(localePayloadStart, localePayloadEnd) : '',
  translationPayloadStart >= 0 && translationPayloadEnd > translationPayloadStart ? source.slice(translationPayloadStart, translationPayloadEnd) : '',
].join('\n')

for (const forbidden of [
  'websiteId:',
  'defaultLocale:',
  'id: locale.id',
  'label: locale.label',
  'fallbackLocale: locale.fallbackLocale',
  'key: translation.key',
  'id: translation.id',
  'contentType: translation.contentType',
  'recordId: translation.recordId',
  'locale: translation.locale',
  'values: translation.values',
  'updatedBy: translation.updatedBy',
  'createdAt: translation.createdAt',
  'updatedAt: translation.updatedAt',
  'translatableFields:',
  'translations:',
  'locales:',
  '...config',
  '...locale',
  '...translation',
  '...details',
  'req.body',
  'req.params',
  'session',
  'actor',
  'authorization',
  'cookie',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Localisation event payload exposes forbidden data: ${forbidden}`)
}

if (!source.includes("async function publishLocalisationEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Localisation events must publish aggregate payloads without actor-derived metadata')
}
if (!source.includes('const wasExisting = before.locales.some(locale => locale.id === requestedLocale)')) {
  failures.push('Locale upsert must distinguish creation from update')
}
if (!source.includes("const existing = await getTranslation(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale)")) {
  failures.push('Translation writes must distinguish creation from update')
}
if (source.includes("localisation.translation-deleted")) {
  failures.push('Localisation must not advertise an unsupported translation deletion lifecycle')
}

if (failures.length) {
  console.error('Localisation real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Localisation real-time event checks passed')
