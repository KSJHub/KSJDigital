import express from 'express'
import { createExportJob, deleteExportJob, getPortabilityState, importPortablePackage, readExportPackage, validatePortablePackage } from './services/dataPortabilityService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) { Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next) }

export function createDataPortabilityRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getPortabilityState(req.query)))
  router.post('/exports', (req, res, next) => handle(res, next, () => createExportJob(req.body || {}, actor(req)), 201))
  router.get('/exports/:jobId/download', async (req, res, next) => {
    try {
      const result = await readExportPackage(req.params.jobId)
      res.set('Content-Type', result.contentType)
      res.set('Content-Disposition', `attachment; filename="${result.filename}"`)
      res.set('Content-Length', String(result.bytes.length))
      res.send(result.bytes)
    } catch (error) { next(error) }
  })
  router.delete('/exports/:jobId', (req, res, next) => handle(res, next, () => deleteExportJob(req.params.jobId, actor(req))))
  router.post('/validate', (req, res, next) => handle(res, next, () => validatePortablePackage(req.body || {})))
  router.post('/imports', (req, res, next) => handle(res, next, () => importPortablePackage(req.body || {}, actor(req)), 201))
  return router
}
