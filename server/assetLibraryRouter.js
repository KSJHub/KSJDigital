import express from 'express'
import {
  createAsset,
  deleteAsset,
  findAssetUsage,
  getAsset,
  listAssets,
  registerAssetVariant,
  updateAsset,
} from './services/assetLibraryService.js'

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
  const response = { error: error.message || 'Asset library request failed' }
  if (error.details) response.details = error.details
  res.status(Number(error.status) || 400).json(response)
}

function listOptions(query = {}) {
  return {
    query: query.q || query.query || '',
    kind: query.kind,
    folder: query.folder,
    collection: query.collection,
    tag: query.tag,
    limit: query.limit,
    offset: query.offset,
  }
}

export function createAssetLibraryRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    try {
      res.json(await listAssets(req.params.websiteId, listOptions(req.query)))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/:assetId', async (req, res) => {
    try {
      res.json(await getAsset(req.params.websiteId, req.params.assetId))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.get('/:websiteId/:assetId/usage', async (req, res) => {
    try {
      const usage = await findAssetUsage(req.params.websiteId, req.params.assetId)
      res.json({ count: usage.length, usage })
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.status(201).json(await createAsset(req.params.websiteId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:websiteId/:assetId', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.json(await updateAsset(req.params.websiteId, req.params.assetId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/:websiteId/:assetId/variants', async (req, res) => {
    if (!requireEdit(req, res)) return
    try {
      res.status(201).json(await registerAssetVariant(req.params.websiteId, req.params.assetId, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:websiteId/:assetId', async (req, res) => {
    if (!requireEdit(req, res)) return
    const force = req.query.force === 'true'
    const deleteFile = req.query.deleteFile === 'true'
    if ((force || deleteFile) && !requireOwner(req, res)) return
    try {
      res.json(await deleteAsset(req.params.websiteId, req.params.assetId, { force, deleteFile }))
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
