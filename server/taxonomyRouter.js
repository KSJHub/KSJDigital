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
import { publishDomainEvent } from './services/realtimeDomainEventService.js'
import { safeName } from './storage.js'

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

function stringValue(value, fallback = '') {
  return String(value ?? fallback).trim()
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => stringValue(item)).filter(Boolean))]
}

function taxonomyPatchChanges(existing = {}, input = {}) {
  if (Object.hasOwn(input, 'label') && stringValue(input.label) !== stringValue(existing.label)) return true
  if (Object.hasOwn(input, 'description') && stringValue(input.description) !== stringValue(existing.description)) return true
  if (Object.hasOwn(input, 'hierarchical') && (input.hierarchical === true) !== (existing.hierarchical === true)) return true
  if (Object.hasOwn(input, 'allowedContentTypes')) {
    if (JSON.stringify(uniqueStrings(input.allowedContentTypes)) !== JSON.stringify(existing.allowedContentTypes || [])) return true
  }
  if (Object.hasOwn(input, 'metadata')) {
    const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : existing.metadata || {}
    if (JSON.stringify(metadata) !== JSON.stringify(existing.metadata || {})) return true
  }
  return false
}

function taxonomyResponse(taxonomy = {}) {
  const { terms, usage, termCount, usageCount, ...result } = taxonomy
  return result
}

function termPatchChanges(existing = {}, input = {}) {
  if (Object.hasOwn(input, 'name') && stringValue(input.name) !== stringValue(existing.name)) return true
  if (Object.hasOwn(input, 'slug') && safeName(input.slug) !== stringValue(existing.slug)) return true
  if (Object.hasOwn(input, 'description') && stringValue(input.description) !== stringValue(existing.description)) return true
  if (Object.hasOwn(input, 'parentId')) {
    const parentId = input.parentId === null ? null : stringValue(input.parentId) || null
    if (parentId !== (existing.parentId || null)) return true
  }
  if (Object.hasOwn(input, 'metadata')) {
    const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : existing.metadata || {}
    if (JSON.stringify(metadata) !== JSON.stringify(existing.metadata || {})) return true
  }
  return false
}

function termResponse(term = {}) {
  const { usageCount, children, ...result } = term
  return result
}

function taxonomyEventPayload(taxonomy = {}, taxonomyCount = 0, deletion = {}) {
  return {
    hierarchical: taxonomy.hierarchical === true,
    hasDescription: Boolean(taxonomy.description),
    allowedContentTypeCount: Array.isArray(taxonomy.allowedContentTypes) ? taxonomy.allowedContentTypes.length : 0,
    taxonomyCount: Number(taxonomyCount) || 0,
    removedTermCount: Number(deletion.termCount) || 0,
    removedAssignmentCount: Number(deletion.usage?.count) || 0,
    forced: deletion.forced === true,
  }
}

function termEventPayload(term = {}, details = {}) {
  return {
    hasParent: Boolean(term.parentId),
    hasDescription: Boolean(term.description),
    childCount: Number(details.childCount) || 0,
    usageCount: Number(details.usage?.count) || 0,
    forced: details.forced === true,
    merged: details.merged === true,
  }
}

async function publishTaxonomyEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
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
      const taxonomy = await createTaxonomy(req.params.websiteId, req.body || {})
      const taxonomies = await listTaxonomies(req.params.websiteId)
      await publishTaxonomyEvent('taxonomy.created', taxonomyEventPayload(taxonomy, taxonomies.length))
      res.status(201).json(taxonomy)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/:taxonomyId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const input = req.body || {}
      const existing = await getTaxonomy(req.params.websiteId, req.params.taxonomyId)
      if (!taxonomyPatchChanges(existing, input)) return res.json(taxonomyResponse(existing))
      const taxonomy = await updateTaxonomy(req.params.websiteId, req.params.taxonomyId, input)
      const taxonomies = await listTaxonomies(req.params.websiteId)
      await publishTaxonomyEvent('taxonomy.updated', taxonomyEventPayload(taxonomy, taxonomies.length))
      res.json(taxonomy)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:taxonomyId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const forced = req.query.force === 'true'
      const result = await deleteTaxonomy(req.params.websiteId, req.params.taxonomyId, { force: forced })
      const taxonomies = await listTaxonomies(req.params.websiteId)
      await publishTaxonomyEvent('taxonomy.deleted', taxonomyEventPayload(result.taxonomy, taxonomies.length, { ...result, forced }))
      res.json(result)
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
      const term = await createTerm(req.params.websiteId, req.params.taxonomyId, req.body || {})
      await publishTaxonomyEvent('taxonomy.term-created', termEventPayload(term))
      res.status(201).json(term)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/:taxonomyId/terms/:termId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const input = req.body || {}
      const terms = await listTerms(req.params.websiteId, req.params.taxonomyId)
      const existing = terms.find(term => term.id === safeName(req.params.termId))
      if (!existing) return res.status(404).json({ error: 'Taxonomy term not found' })
      if (!termPatchChanges(existing, input)) return res.json(termResponse(existing))
      const term = await updateTerm(req.params.websiteId, req.params.taxonomyId, req.params.termId, input)
      const usage = await getTermUsage(req.params.websiteId, req.params.taxonomyId, req.params.termId)
      await publishTaxonomyEvent('taxonomy.term-updated', termEventPayload(term, { usage }))
      res.json(term)
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
      const before = await getTermUsage(req.params.websiteId, req.params.taxonomyId, req.params.termId)
      const assignment = await assignTerm(req.params.websiteId, req.params.taxonomyId, req.params.termId, req.body || {})
      const after = await getTermUsage(req.params.websiteId, req.params.taxonomyId, req.params.termId)
      if (after.count > before.count) {
        await publishTaxonomyEvent('taxonomy.assignment-added', { assignmentCount: after.count })
      }
      res.status(201).json(assignment)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:taxonomyId/terms/:termId/assignments', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      const result = await unassignTerm(req.params.websiteId, req.params.taxonomyId, req.params.termId, req.body || {})
      if (result.deleted) {
        const usage = await getTermUsage(req.params.websiteId, req.params.taxonomyId, req.params.termId)
        await publishTaxonomyEvent('taxonomy.assignment-removed', { assignmentCount: usage.count })
      }
      res.json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:taxonomyId/terms/:termId/merge', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const result = await mergeTerms(req.params.websiteId, req.params.taxonomyId, req.params.termId, req.body?.targetTermId)
      await publishTaxonomyEvent('taxonomy.term-merged', termEventPayload(result.target, result))
      res.json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:taxonomyId/terms/:termId', async (req, res) => {
    if (!requireOwner(req, res)) return
    try {
      const forced = req.query.force === 'true'
      const merged = Boolean(req.query.mergeInto)
      const result = await deleteTerm(req.params.websiteId, req.params.taxonomyId, req.params.termId, {
        force: forced,
        mergeInto: req.query.mergeInto,
      })
      const topic = merged ? 'taxonomy.term-merged' : 'taxonomy.term-deleted'
      const term = merged ? result.target : result.term
      await publishTaxonomyEvent(topic, termEventPayload(term, { ...result, forced, merged }))
      res.json(result)
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
