import express from 'express'
import {
  ContentRecordError,
  createContentRecord,
  deleteContentRecord,
  listContentRecords,
  restoreContentRecord,
  transitionContentRecord,
  updateContentRecord,
} from './services/contentRecordService.js'

const ARTICLE_TYPE = 'article'

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
  const status = Number(error.status) || (error instanceof ContentRecordError ? error.status : 500)
  const response = { error: error.message || 'Content operation failed' }
  if (error.details) response.details = error.details
  res.status(status).json(response)
}

export function createCmsRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    try {
      res.json(await listContentRecords(req.params.websiteId, ARTICLE_TYPE, workflowActor(req)))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const actor = workflowActor(req)
      const article = await createContentRecord(req.params.websiteId, ARTICLE_TYPE, req.body || {}, actor)
      const articles = await listContentRecords(req.params.websiteId, ARTICLE_TYPE, actor)
      res.status(201).json({ article, articles })
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/:articleId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const actor = workflowActor(req)
      const article = await updateContentRecord(
        req.params.websiteId,
        ARTICLE_TYPE,
        req.params.articleId,
        req.body || {},
        actor,
      )
      const articles = await listContentRecords(req.params.websiteId, ARTICLE_TYPE, actor)
      res.json({ article, articles })
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:articleId/transitions/:transitionId', async (req, res) => {
    if (!requireWorkflow(req, res)) return
    try {
      const actor = workflowActor(req)
      const article = await transitionContentRecord(
        req.params.websiteId,
        ARTICLE_TYPE,
        req.params.articleId,
        req.params.transitionId,
        actor,
        req.body || {},
      )
      const articles = await listContentRecords(req.params.websiteId, ARTICLE_TYPE, actor)
      res.json({ article, articles })
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:articleId/restore/:revisionId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const actor = workflowActor(req)
      const article = await restoreContentRecord(
        req.params.websiteId,
        ARTICLE_TYPE,
        req.params.articleId,
        req.params.revisionId,
        actor,
      )
      const articles = await listContentRecords(req.params.websiteId, ARTICLE_TYPE, actor)
      res.json({ article, articles })
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:articleId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      await deleteContentRecord(req.params.websiteId, ARTICLE_TYPE, req.params.articleId)
      res.json(await listContentRecords(req.params.websiteId, ARTICLE_TYPE, workflowActor(req)))
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
