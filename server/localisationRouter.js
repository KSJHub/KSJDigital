import express from 'express'
import {
  configureTranslatableFields,
  deleteLocale,
  getLocalisationConfig,
  getTranslation,
  getTranslationCompleteness,
  listPublishedTranslations,
  publishTranslation,
  resolveLocalisedRecord,
  saveTranslation,
  updateLocalisationConfig,
  upsertLocale,
} from './services/localisationService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireEdit(req, res) {
  if (req.session?.role === 'owner' || req.session?.canEdit) return true
  res.status(403).json({ error: 'Edit permission required' })
  return false
}

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function actor(req) {
  return {
    id: req.session?.userId || req.session?.email || 'session-user',
    email: req.session?.email || null,
  }
}

function localisationConfigEventPayload(config) {
  const locales = Array.isArray(config?.locales) ? config.locales : []
  const translations = Array.isArray(config?.translations) ? config.translations : []
  const fieldGroups = Object.values(config?.translatableFields || {})
  return {
    localeCount: locales.length,
    enabledLocaleCount: locales.filter(locale => locale.enabled !== false).length,
    fallbackLocaleCount: locales.filter(locale => Boolean(locale.fallbackLocale)).length,
    translationCount: translations.length,
    publishedTranslationCount: translations.filter(translation => translation.status === 'published').length,
    configuredContentTypeCount: fieldGroups.length,
    translatableFieldCount: fieldGroups.reduce((count, fields) => count + (Array.isArray(fields) ? fields.length : 0), 0),
  }
}

function localeEventPayload(config, locale, details = {}) {
  return {
    ...localisationConfigEventPayload(config),
    enabled: locale?.enabled !== false,
    hasFallback: Boolean(locale?.fallbackLocale),
    removedTranslationCount: Number(details.removedTranslationCount) || 0,
    forced: details.forced === true,
  }
}

function translationEventPayload(translation, details = {}) {
  const values = translation?.values && typeof translation.values === 'object' ? translation.values : {}
  return {
    status: translation?.status === 'published' ? 'published' : 'draft',
    translatedFieldCount: Object.values(values).filter(value => value !== undefined && value !== '').length,
    wasExisting: details.wasExisting === true,
    published: translation?.status === 'published',
  }
}

async function publishLocalisationEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

function sendError(res, error) {
  const response = { error: error.message || 'Localisation request failed' }
  if (error.details) response.details = error.details
  res.status(Number(error.status) || 400).json(response)
}

export function createLocalisationRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    try { res.json(await getLocalisationConfig(req.params.websiteId)) } catch (error) { sendError(res, error) }
  })

  router.patch('/:websiteId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const config = await updateLocalisationConfig(req.params.websiteId, req.body || {})
      await publishLocalisationEvent('localisation.config-updated', localisationConfigEventPayload(config))
      res.json(config)
    } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/locales', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const before = await getLocalisationConfig(req.params.websiteId)
      const requestedLocale = String(req.body?.id || '').trim()
      const wasExisting = before.locales.some(locale => locale.id === requestedLocale)
      const config = await upsertLocale(req.params.websiteId, req.body || {})
      const locale = config.locales.find(item => item.id === requestedLocale)
      await publishLocalisationEvent(wasExisting ? 'localisation.locale-updated' : 'localisation.locale-created', localeEventPayload(config, locale))
      res.status(wasExisting ? 200 : 201).json(config)
    } catch (error) { sendError(res, error) }
  })

  router.delete('/:websiteId/locales/:locale', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const before = await getLocalisationConfig(req.params.websiteId)
      const locale = before.locales.find(item => item.id === req.params.locale)
      const removedTranslationCount = before.translations.filter(item => item.locale === req.params.locale).length
      const config = await deleteLocale(req.params.websiteId, req.params.locale, { force: req.query.force === 'true' })
      await publishLocalisationEvent('localisation.locale-deleted', localeEventPayload(config, locale, {
        removedTranslationCount,
        forced: req.query.force === 'true',
      }))
      res.json(config)
    } catch (error) { sendError(res, error) }
  })

  router.put('/:websiteId/content-types/:contentType/fields', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const config = await configureTranslatableFields(req.params.websiteId, req.params.contentType, req.body?.fields || [])
      await publishLocalisationEvent('localisation.fields-configured', localisationConfigEventPayload(config))
      res.json(config)
    } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/content/:contentType/:recordId/completeness', async (req, res) => {
    try { res.json(await getTranslationCompleteness(req.params.websiteId, req.params.contentType, req.params.recordId)) } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/content/:contentType/:recordId/:locale/resolved', async (req, res) => {
    try { res.json(await resolveLocalisedRecord(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale, { publishedOnly: req.query.publishedOnly === 'true' })) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/content/:contentType/:recordId/:locale/publish', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const existing = await getTranslation(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale)
      const translation = await publishTranslation(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale, actor(req))
      await publishLocalisationEvent('localisation.translation-published', translationEventPayload(translation, { wasExisting: Boolean(existing) }))
      res.json(translation)
    } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/content/:contentType/:recordId/:locale', async (req, res) => {
    try { res.json(await getTranslation(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale)) } catch (error) { sendError(res, error) }
  })

  router.put('/:websiteId/content/:contentType/:recordId/:locale', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const existing = await getTranslation(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale)
      const translation = await saveTranslation(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale, req.body || {}, actor(req))
      await publishLocalisationEvent(existing ? 'localisation.translation-updated' : 'localisation.translation-created', translationEventPayload(translation, { wasExisting: Boolean(existing) }))
      res.json(translation)
    } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/published/:locale', async (req, res) => {
    try { res.json(await listPublishedTranslations(req.params.websiteId, req.params.locale, { contentType: req.query.contentType })) } catch (error) { sendError(res, error) }
  })

  return router
}
