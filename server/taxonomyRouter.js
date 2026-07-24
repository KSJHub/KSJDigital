import express from 'express'
import {
  assignTerm,
  createTaxonomy,
  createTerm,
  deleteTaxonomy,
  deleteTerm,
  getTaxonomy,
  getTermUsage,
  listRecordTerms,
  listTaxonomies,
  listTerms,
  mergeTerms,
  unassignTerm,
  updateTaxonomy,
  updateTerm,
} from './services/taxonomyService.js'

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

function sendError(res, error) {
  const response = { error: error.message || 'Taxonomy request failed' }
  if (error.details) response.details = error.details
  res.status(Number(error.status) || 400).json(response)
}

export function createTaxonomyRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    try {
      res.json(await listTaxonomies(req.params.websiteId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/records/:contentType/:recordId', async (req, res) => {
    try {
      res.json(await listRecordTerms(req.params.websiteId, req.params.contentType, req.params.recordId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/:taxonomyId', async (req, res) => {
    try {
      res.json(await getTaxonomy(req.params.websiteId, req.params.taxonomyId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.status(201).json(await createTaxonomy(req.params.websiteId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/:taxonomyId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.json(await updateTaxonomy(req.params.websiteId, req.params.taxonomyId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:taxonomyId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      res.json(await deleteTaxonomy(req.params.websiteId, req.params.taxonomyId, { force: req.query.force === 'true' }))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/:taxonomyId/terms', async (req, res) => {
    try {
      res.json(await listTerms(req.params.websiteId, req.params.taxonomyId, { query: req.query.q || req.query.query, tree: req.query.tree }))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:taxonomyId/terms', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.status(201).json(await createTerm(req.params.websiteId, req.params.taxonomyId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/:taxonomyId/terms/:termId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.json(await updateTerm(req.params.websiteId, req.params.taxonomyId, req.params.termId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/:taxonomyId/terms/:termId/usage', async (req, res) => {
    try {
      res.json(await getTermUsage(req.params.websiteId, req.params.taxonomyId, req.params.termId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:taxonomyId/terms/:termId/assignments', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.status(201).json(await assignTerm(req.params.websiteId, req.params.taxonomyId, req.params.termId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:taxonomyId/terms/:termId/assignments', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.json(await unassignTerm(req.params.websiteId, req.params.taxonomyId, req.params.termId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:taxonomyId/terms/:termId/merge', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      res.json(await mergeTerms(req.params.websiteId, req.params.taxonomyId, req.params.termId, req.body?.targetTermId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:taxonomyId/terms/:termId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      res.json(await deleteTerm(req.params.websiteId, req.params.taxonomyId, req.params.termId, {
        force: req.query.force === 'true',
        mergeInto: req.query.mergeInto,
      }))
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
