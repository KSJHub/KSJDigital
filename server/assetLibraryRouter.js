import fs from 'node:fs/promises'
import path from 'node:path'
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
import { ASSET_DIR, paths, readJson, safeName, writeJson } from './storage.js'

function requireEdit(req, res) {
  if (req.session?.role === 'owner' || req.session?.canEdit) return true
  res.status(403).json({ error: 'Edit permission required' })
  return false
}

function requireMedia(req, res) {
  if (req.session?.role === 'owner' || req.session?.canManageMedia) return true
  res.status(403).json({ error: 'Media permission required' })
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

function normalisedIdentifier(value) {
  const raw = String(value || '').trim()
  return raw ? safeName(raw) : ''
}

function legacyAssetScopeAllowed(session = {}, { ownerId, websiteId } = {}) {
  if (session.role === 'owner') return true

  const accountId = normalisedIdentifier(session.id)
  const allowedWebsiteIds = new Set(
    (Array.isArray(session.websiteIds) ? session.websiteIds : session.websiteId ? [session.websiteId] : [])
      .map(normalisedIdentifier)
      .filter(Boolean),
  )
  const normalisedWebsiteId = normalisedIdentifier(websiteId)
  const normalisedOwnerId = normalisedIdentifier(ownerId)

  if (!normalisedWebsiteId || !allowedWebsiteIds.has(normalisedWebsiteId)) return false
  return Boolean(normalisedOwnerId && (normalisedOwnerId === accountId || allowedWebsiteIds.has(normalisedOwnerId)))
}

function legacyAssetFile(asset = {}) {
  const filename = path.basename(String(asset.filename || '').trim())
  if (!filename) return null
  const root = path.resolve(ASSET_DIR)
  const file = path.resolve(root, filename)
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null
  return file
}

async function deleteLegacyAsset(ownerId, websiteId, assetId) {
  const manifestPath = paths.manifest(ownerId)
  const assets = await readJson(manifestPath, [])
  const asset = assets.find(item => item.id === assetId && item.websiteId === websiteId)
  if (!asset) {
    const error = new Error('Media asset not found')
    error.status = 404
    throw error
  }

  const next = assets.filter(item => item !== asset)
  const file = legacyAssetFile(asset)
  if (file) {
    try {
      await fs.unlink(file)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  await writeJson(manifestPath, next)
  return { deleted: true, id: asset.id, websiteId: asset.websiteId, fileDeleted: Boolean(file) }
}

export function createAssetLibraryRouter() {
  const router = express.Router()

  router.delete('/legacy/:ownerId/:websiteId/:assetId', async (req, res) => {
    if (!requireMedia(req, res)) return
    if (!legacyAssetScopeAllowed(req.session, req.params)) return res.status(403).json({ error: 'Media asset access denied' })
    try {
      res.json(await deleteLegacyAsset(req.params.ownerId, req.params.websiteId, req.params.assetId))
    } catch (error) {
      sendError(res, error)
    }
  })

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
