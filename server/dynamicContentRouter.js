import express from 'express'
import { listFieldTypes } from './services/fieldTypeRegistry.js'
import {
  describeContentType,
  listContentTypeDescriptions,
} from './services/contentTypeRegistry.js'
import {
  createContentRecord,
  deleteContentRecord,
  getContentRecord,
  listContentRecords,
  restoreContentRecord,
  updateContentRecord,
} from './services/contentRecordService.js'

function requireEdit(req, res) {
  if (req.session?.role === 'owner' || req.session?.canEdit) return true
  res.status(403).json({ error: 'Edit permission required' })
  return false
}

function sendError(res, error) {
  const response = { error: error.message || 'Dynamic content request failed' }
  if (Array.isArray(error.errors)) response.validation = error.errors
  if (error.details) response.details = error.details
  res.status(Number(error.status) || 400).json(response)
}

export function createDynamicContentRouter() {
  const router = express.Router()

  router.get('/field-types', (_req, res) => {
    res.json(listFieldTypes().map(type => ({ id: type.id, label: type.label })))
  })

  router.get('/types', (_req, res) => {
    res.json(listContentTypeDescriptions())
  })

  router.get('/types/:typeId', (req, res) => {
    const definition = describeContentType(req.params.typeId)
    if (!definition) return res.status(404).json({ error: 'Content type not found' })
    res.json(definition)
  })

  router.get('/:websiteId/:typeId', async (req, res) => {
    try {
      res.json(await listContentRecords(req.params.websiteId, req.params.typeId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/:typeId/:recordId', async (req, res) => {
    try {
      res.json(await getContentRecord(req.params.websiteId, req.params.typeId, req.params.recordId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:typeId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const record = await createContentRecord(req.params.websiteId, req.params.typeId, req.body || {})
      res.status(201).json(record)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/:typeId/:recordId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.json(await updateContentRecord(req.params.websiteId, req.params.typeId, req.params.recordId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:typeId/:recordId/restore/:revisionId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.json(await restoreContentRecord(
        req.params.websiteId,
        req.params.typeId,
        req.params.recordId,
        req.params.revisionId,
      ))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:typeId/:recordId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.json(await deleteContentRecord(req.params.websiteId, req.params.typeId, req.params.recordId))
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}