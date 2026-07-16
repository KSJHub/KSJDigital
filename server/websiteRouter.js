import express from 'express'
import {
  WebsiteServiceError,
  createWebsite,
  deleteWebsite,
  listWebsites,
  updateWebsite,
  websitesForSession,
} from './services/websiteService.js'

function ownerOnly(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Website registry changes require platform owner access' })
}

function sendError(res, error) {
  if (error instanceof WebsiteServiceError) {
    return res.status(error.status).json({ error: error.message })
  }
  console.error('Website service failure:', error)
  return res.status(500).json({ error: 'Website management is temporarily unavailable' })
}

export function createWebsiteRouter() {
  const router = express.Router()

  router.get('/', async (req, res) => {
    try {
      const websites = await listWebsites()
      res.json(websitesForSession(websites, req.session))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.post('/', ownerOnly, async (req, res) => {
    try {
      res.status(201).json(await createWebsite(req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.patch('/:id', ownerOnly, async (req, res) => {
    try {
      res.json(await updateWebsite(req.params.id, req.body || {}))
    } catch (error) {
      sendError(res, error)
    }
  })

  router.delete('/:id', ownerOnly, async (req, res) => {
    try {
      const websites = await deleteWebsite(req.params.id)
      res.json({ ok: true, websites })
    } catch (error) {
      sendError(res, error)
    }
  })

  return router
}
