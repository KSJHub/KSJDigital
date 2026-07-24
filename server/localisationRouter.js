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
    try { res.json(await updateLocalisationConfig(req.params.websiteId, req.body || {})) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/locales', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.status(201).json(await upsertLocale(req.params.websiteId, req.body || {})) } catch (error) { sendError(res, error) }
  })

  router.delete('/:websiteId/locales/:locale', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await deleteLocale(req.params.websiteId, req.params.locale, { force: req.query.force === 'true' })) } catch (error) { sendError(res, error) }
  })

  router.put('/:websiteId/content-types/:contentType/fields', async (req, res) => {
    if (!requireOwner(req, res)) return
    try { res.json(await configureTranslatableFields(req.params.websiteId, req.params.contentType, req.body?.fields || [])) } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/content/:contentType/:recordId/:locale', async (req, res) => {
    try { res.json(await getTranslation(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale)) } catch (error) { sendError(res, error) }
  })

  router.put('/:websiteId/content/:contentType/:recordId/:locale', async (req, res) => {
    if (!requireEdit(req, res)) return
    try { res.json(await saveTranslation(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale, req.body || {}, actor(req))) } catch (error) { sendError(res, error) }
  })

  router.post('/:websiteId/content/:contentType/:recordId/:locale/publish', async (req, res) => {
    if (!requireEdit(req, res)) return
    try { res.json(await publishTranslation(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale, actor(req))) } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/content/:contentType/:recordId/:locale/resolved', async (req, res) => {
    try { res.json(await resolveLocalisedRecord(req.params.websiteId, req.params.contentType, req.params.recordId, req.params.locale, { publishedOnly: req.query.publishedOnly === 'true' })) } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/content/:contentType/:recordId/completeness', async (req, res) => {
    try { res.json(await getTranslationCompleteness(req.params.websiteId, req.params.contentType, req.params.recordId)) } catch (error) { sendError(res, error) }
  })

  router.get('/:websiteId/published/:locale', async (req, res) => {
    try { res.json(await listPublishedTranslations(req.params.websiteId, req.params.locale, { contentType: req.query.contentType })) } catch (error) { sendError(res, error) }
  })

  return router
}
