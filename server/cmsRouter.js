import express from 'express'
import {
  ContentRecordError,
  createContentRecord,
  deleteContentRecord,
  listContentRecords,
  restoreContentRecord,
  updateContentRecord,
} from './services/contentRecordService.js'

const ARTICLE_TYPE = 'article'

function requireEdit(req, res) {
  if (req.session?.role === 'owner' || req.session?.canEdit) return true
  res.status(403).json({ error: 'Edit permission required' })
  return false
}

function sendError(res, error) {
  const status = error instanceof ContentRecordError ? error.status : 500
  res.status(status).json({ error: error.message || 'Content operation failed' })
}

export function createCmsRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    try {
      res.json(await listContentRecords(req.params.websiteId, ARTICLE_TYPE))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const article = await createContentRecord(req.params.websiteId, ARTICLE_TYPE, req.body || {})
      const articles = await listContentRecords(req.params.websiteId, ARTICLE_TYPE)
      res.status(201).json({ article, articles })
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/:articleId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const article = await updateContentRecord(
        req.params.websiteId,
        ARTICLE_TYPE,
        req.params.articleId,
        req.body || {},
      )
      const articles = await listContentRecords(req.params.websiteId, ARTICLE_TYPE)
      res.json({ article, articles })
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:articleId/restore/:revisionId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const article = await restoreContentRecord(
        req.params.websiteId,
        ARTICLE_TYPE,
        req.params.articleId,
        req.params.revisionId,
      )
      const articles = await listContentRecords(req.params.websiteId, ARTICLE_TYPE)
      res.json({ article, articles })
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:articleId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      await deleteContentRecord(req.params.websiteId, ARTICLE_TYPE, req.params.articleId)
      res.json(await listContentRecords(req.params.websiteId, ARTICLE_TYPE))
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
