import express from 'express'
import { getCommerceSettings, saveCommerceSettings } from './commerceSettings.js'

function canAccessWebsite(session, websiteId) {
  if (!session || !websiteId) return false
  if (session.role === 'owner') return true
  return (session.websiteIds || []).includes(websiteId)
}

export function createCommerceSettingsRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) {
      return res.status(403).json({ error: 'Website access denied' })
    }
    res.json(await getCommerceSettings(req.params.websiteId))
  })

  router.put('/:websiteId', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) {
      return res.status(403).json({ error: 'Website access denied' })
    }
    if (req.session.role !== 'owner' && !req.session.canEdit) {
      return res.status(403).json({ error: 'Edit permission required' })
    }

    try {
      res.json(await saveCommerceSettings(req.params.websiteId, req.body || {}))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
