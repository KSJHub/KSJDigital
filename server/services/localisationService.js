import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { getContentType } from './contentTypeRegistry.js'

const localisationDir = path.join(DATA_DIR, 'localisation')
const contentRecordsDir = path.join(DATA_DIR, 'content-records')
const mutations = new Map()
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2}|-[A-Za-z]{4})?$/

export class LocalisationError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'LocalisationError'
    this.status = status
    this.details = details
  }
}

function websiteId(value) {
  const id = safeName(value)
  if (!id || id === 'file') throw new LocalisationError('Website id is required', 422)
  return id
}

function localeId(value, label = 'Locale') {
  const locale = String(value || '').trim()
  if (!LOCALE_PATTERN.test(locale)) throw new LocalisationError(`${label} is invalid`, 422, { locale })
  return locale
}

function storePath(id) {
  return path.join(localisationDir, `${id}.json`)
}

function defaultStore(id) {
  return {
    websiteId: id,
    defaultLocale: 'en-GB',
    locales: [{ id: 'en-GB', label: 'English (United Kingdom)', enabled: true, fallbackLocale: null }],
    translatableFields: {},
    translations: [],
    updatedAt: new Date().toISOString(),
  }
}

async function readStore(id) {
  const stored = await readJson(storePath(id), null)
  if (!stored) {
    const initial = defaultStore(id)
    await writeJson(storePath(id), initial)
    return initial
  }
  if (!Array.isArray(stored.locales) || !Array.isArray(stored.translations)) throw new LocalisationError('Stored localisation registry is invalid', 500)
  return stored
}

async function mutate(id, operation) {
  const previous = mutations.get(id) || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const store = await readStore(id)
    const next = await operation(structuredClone(store))
    next.websiteId = id
    next.updatedAt = new Date().toISOString()
    const persisted = { ...next }
    delete persisted.result
    await writeJson(storePath(id), persisted)
    return next
  })
  mutations.set(id, current)
  try { return await current } finally { if (mutations.get(id) === current) mutations.delete(id) }
}

function localeMap(store) {
  return new Map(store.locales.map(locale => [locale.id, locale]))
}

function validateFallbacks(store) {
  const locales = localeMap(store)
  if (!locales.has(store.defaultLocale)) throw new LocalisationError('Default locale must be registered', 422)
  for (const locale of store.locales) {
    if (locale.fallbackLocale && !locales.has(locale.fallbackLocale)) throw new LocalisationError('Fallback locale must be registered', 422, { locale: locale.id })
    const seen = new Set([locale.id])
    let current = locale.fallbackLocale
    while (current) {
      if (seen.has(current)) throw new LocalisationError('Locale fallback cycle detected', 422, { locale: locale.id })
      seen.add(current)
      current = locales.get(current)?.fallbackLocale || null
    }
  }
}

function normaliseLocale(input, existing = null) {
  const id = localeId(input.id || existing?.id)
  return {
    id,
    label: String(input.label ?? existing?.label ?? id).trim() || id,
    enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
    fallbackLocale: input.fallbackLocale ? localeId(input.fallbackLocale, 'Fallback locale') : null,
  }
}

function translatableFields(store, contentType) {
  return Array.isArray(store.translatableFields?.[contentType]) ? store.translatableFields[contentType] : []
}

function validateFieldConfiguration(contentType, fields) {
  const definition = getContentType(contentType)
  if (!definition) throw new LocalisationError('Unknown content type', 422, { contentType })
  const known = new Set(definition.fields.map(field => field.id))
  const unique = [...new Set((Array.isArray(fields) ? fields : []).map(field => String(field).trim()).filter(Boolean))]
  const invalid = unique.filter(field => !known.has(field))
  if (invalid.length) throw new LocalisationError('Unknown translatable field', 422, { fields: invalid })
  return unique
}

async function assertRecord(id, contentType, recordId) {
  if (!getContentType(contentType)) throw new LocalisationError('Unknown content type', 422, { contentType })
  const records = await readJson(path.join(contentRecordsDir, id, `${safeName(contentType)}.json`), [])
  const record = Array.isArray(records) ? records.find(item => String(item.id) === String(recordId)) : null
  if (!record) throw new LocalisationError('Content record not found', 404)
  return record
}

function translationKey(contentType, recordId, locale) {
  return `${contentType}:${recordId}:${locale}`
}

function fallbackChain(store, requestedLocale) {
  const locales = localeMap(store)
  const chain = []
  const seen = new Set()
  let current = requestedLocale
  while (current && !seen.has(current)) {
    chain.push(current)
    seen.add(current)
    current = locales.get(current)?.fallbackLocale || (current !== store.defaultLocale ? store.defaultLocale : null)
  }
  return chain
}

export async function getLocalisationConfig(websiteValue) {
  return readStore(websiteId(websiteValue))
}

export async function updateLocalisationConfig(websiteValue, input = {}) {
  const id = websiteId(websiteValue)
  return mutate(id, store => {
    if (input.defaultLocale) store.defaultLocale = localeId(input.defaultLocale, 'Default locale')
    if (input.locales) store.locales = input.locales.map(locale => normaliseLocale(locale))
    validateFallbacks(store)
    return store
  })
}

export async function upsertLocale(websiteValue, input = {}) {
  const id = websiteId(websiteValue)
  return mutate(id, store => {
    const requestedId = localeId(input.id)
    const index = store.locales.findIndex(locale => locale.id === requestedId)
    const locale = normaliseLocale(input, index >= 0 ? store.locales[index] : null)
    if (index >= 0) store.locales[index] = locale
    else store.locales.push(locale)
    validateFallbacks(store)
    return store
  })
}

export async function deleteLocale(websiteValue, localeValue, options = {}) {
  const id = websiteId(websiteValue)
  const locale = localeId(localeValue)
  return mutate(id, store => {
    if (locale === store.defaultLocale) throw new LocalisationError('Default locale cannot be deleted', 409)
    const usage = store.translations.filter(item => item.locale === locale).length
    if (usage && options.force !== true) throw new LocalisationError('Locale has translations', 409, { count: usage })
    store.locales = store.locales.filter(item => item.id !== locale).map(item => item.fallbackLocale === locale ? { ...item, fallbackLocale: store.defaultLocale } : item)
    store.translations = store.translations.filter(item => item.locale !== locale)
    validateFallbacks(store)
    return store
  })
}

export async function configureTranslatableFields(websiteValue, contentType, fields) {
  const id = websiteId(websiteValue)
  const validated = validateFieldConfiguration(contentType, fields)
  return mutate(id, store => {
    store.translatableFields = { ...(store.translatableFields || {}), [contentType]: validated }
    return store
  })
}

export async function saveTranslation(websiteValue, contentType, recordId, localeValue, input = {}, actor = null) {
  const id = websiteId(websiteValue)
  const locale = localeId(localeValue)
  await assertRecord(id, contentType, recordId)
  return mutate(id, store => {
    const configuredLocale = store.locales.find(item => item.id === locale && item.enabled)
    if (!configuredLocale) throw new LocalisationError('Locale is not enabled', 422, { locale })
    const allowed = translatableFields(store, contentType)
    const values = input.values && typeof input.values === 'object' ? input.values : input
    const invalid = Object.keys(values).filter(field => !allowed.includes(field))
    if (invalid.length) throw new LocalisationError('Field is not translatable', 422, { fields: invalid })
    const now = new Date().toISOString()
    const key = translationKey(contentType, recordId, locale)
    const existing = store.translations.find(item => item.key === key)
    const translation = {
      key,
      id: existing?.id || crypto.randomUUID(),
      contentType,
      recordId: String(recordId),
      locale,
      values: { ...(existing?.values || {}), ...values },
      status: ['draft', 'published'].includes(input.status) ? input.status : existing?.status || 'draft',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      updatedBy: actor?.id || actor?.email || null,
    }
    store.translations = [translation, ...store.translations.filter(item => item.key !== key)]
    return { ...store, result: translation }
  }).then(store => store.result)
}

export async function publishTranslation(websiteValue, contentType, recordId, localeValue, actor = null) {
  return saveTranslation(websiteValue, contentType, recordId, localeValue, { status: 'published', values: {} }, actor)
}

export async function getTranslation(websiteValue, contentType, recordId, localeValue) {
  const id = websiteId(websiteValue)
  const locale = localeId(localeValue)
  const store = await readStore(id)
  return store.translations.find(item => item.key === translationKey(contentType, recordId, locale)) || null
}

export async function resolveLocalisedRecord(websiteValue, contentType, recordId, localeValue, options = {}) {
  const id = websiteId(websiteValue)
  const requestedLocale = localeId(localeValue)
  const record = await assertRecord(id, contentType, recordId)
  const store = await readStore(id)
  const allowed = translatableFields(store, contentType)
  const chain = fallbackChain(store, requestedLocale)
  const translations = chain.map(locale => store.translations.find(item => item.key === translationKey(contentType, recordId, locale))).filter(Boolean)
  const publishedOnly = options.publishedOnly === true
  const eligible = publishedOnly ? translations.filter(item => item.status === 'published') : translations
  const values = { ...record }
  const sources = {}
  for (const field of allowed) {
    const translation = eligible.find(item => item.values?.[field] !== undefined && item.values[field] !== '')
    if (translation) {
      values[field] = translation.values[field]
      sources[field] = translation.locale
    } else sources[field] = store.defaultLocale
  }
  return { ...values, locale: requestedLocale, localeFallbackChain: chain, translationSources: sources }
}

export async function getTranslationCompleteness(websiteValue, contentType, recordId) {
  const id = websiteId(websiteValue)
  await assertRecord(id, contentType, recordId)
  const store = await readStore(id)
  const fields = translatableFields(store, contentType)
  return store.locales.map(locale => {
    const translation = store.translations.find(item => item.key === translationKey(contentType, recordId, locale.id))
    const completed = fields.filter(field => translation?.values?.[field] !== undefined && translation.values[field] !== '').length
    return { locale: locale.id, status: translation?.status || 'missing', completed, total: fields.length, percentage: fields.length ? Math.round((completed / fields.length) * 100) : 100 }
  })
}

export async function listPublishedTranslations(websiteValue, localeValue, options = {}) {
  const id = websiteId(websiteValue)
  const locale = localeId(localeValue)
  const store = await readStore(id)
  let translations = store.translations.filter(item => item.locale === locale && item.status === 'published')
  if (options.contentType) translations = translations.filter(item => item.contentType === options.contentType)
  return translations
}
