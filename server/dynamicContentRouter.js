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
  processScheduledContentRecords,
  restoreContentRecord,
  transitionContentRecord,
  updateContentRecord,
} from './services/contentRecordService.js'

function requireEdit(req, res) {
  if (req.session?.role === 'owner' || req.session?.canEdit) return true
  res.status(403).json({ error: 'Edit permission required' })
  return false
}

function requireWorkflow(req, res) {
  if (req.session?.role === 'owner' || req.session?.canEdit || req.session?.canApprove) return true
  res.status(403).json({ error: 'Workflow permission required' })
  return false
}

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner permission required' })
  return false
}

function workflowActor(req) {
  return {
    id: req.session?.userId || req.session?.email || 'session-user',
    name: req.session?.displayName || req.session?.name || req.session?.email || 'Authenticated user',
    role: req.session?.role,
    canEdit: req.session?.canEdit === true,
    canApprove: req.session?.canApprove === true,
  }
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

  router.post('/:websiteId/process-scheduled', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const published = await processScheduledContentRecords(req.params.websiteId)
      res.json({ published, count: published.length })
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/:typeId', async (req, res) => {
    try {
      res.json(await listContentRecords(req.params.websiteId, req.params.typeId, workflowActor(req)))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/:typeId/:recordId', async (req, res) => {
    try {
      res.json(await getContentRecord(req.params.websiteId, req.params.typeId, req.params.recordId, workflowActor(req)))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:typeId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const record = await createContentRecord(
        req.params.websiteId,
        req.params.typeId,
        req.body || {},
        workflowActor(req),
      )
      res.status(201).json(record)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/:typeId/:recordId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.json(await updateContentRecord(
        req.params.websiteId,
        req.params.typeId,
        req.params.recordId,
        req.body || {},
        workflowActor(req),
      ))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:typeId/:recordId/transitions/:transitionId', async (req, res) => {
    if (!requireWorkflow(req, res)) return
    try {
      res.json(await transitionContentRecord(
        req.params.websiteId,
        req.params.typeId,
        req.params.recordId,
        req.params.transitionId,
        workflowActor(req),
        req.body || {},
      ))
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
        workflowActor(req),
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
