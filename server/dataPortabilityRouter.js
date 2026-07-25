import express from 'express'
import { createExportJob, deleteExportJob, getPortabilityState, importPortablePackage, readExportPackage, validatePortablePackage } from './services/dataPortabilityService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}
function actor(req) { return { id: req.session?.userId || req.session?.email || 'owner', email: req.session?.email || null } }
function handle(res, next, operation, success = 200) { Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next) }
function publishPortabilityEvent(req, topic, payload = {}) {
  return publishDomainEvent({
    topic,
    websiteId: payload.websiteId || payload.targetWebsiteId || payload.sourceWebsiteId || null,
    actor: actor(req),
    payload,
  }).catch(error => console.error('Could not publish data portability event', error))
}

export function createDataPortabilityRouter() {
  const router = express.Router()
  router.use(requireOwner)
  router.get('/', (req, res, next) => handle(res, next, () => getPortabilityState(req.query)))
  router.post('/exports', (req, res, next) => handle(res, next, async () => {
    const result = await createExportJob(req.body || {}, actor(req))
    await publishPortabilityEvent(req, 'data-portability.export-created', {
      jobId: result.id,
      websiteId: result.websiteId,
      format: result.format,
      status: result.status,
      sizeBytes: result.sizeBytes,
      completedAt: result.completedAt,
    })
    return result
  }, 201))
  router.get('/exports/:jobId/download', async (req, res, next) => {
    try {
      const result = await readExportPackage(req.params.jobId)
      await publishPortabilityEvent(req, 'data-portability.export-downloaded', {
        jobId: result.job.id,
        websiteId: result.job.websiteId,
        format: result.job.format,
        sizeBytes: result.job.sizeBytes,
      })
      res.set('Content-Type', result.contentType)
      res.set('Content-Disposition', `attachment; filename="${result.filename}"`)
      res.set('Content-Length', String(result.bytes.length))
      res.send(result.bytes)
    } catch (error) { next(error) }
  })
  router.delete('/exports/:jobId', (req, res, next) => handle(res, next, async () => {
    const result = await deleteExportJob(req.params.jobId, actor(req))
    await publishPortabilityEvent(req, 'data-portability.export-deleted', { jobId: result.id, deleted: result.deleted })
    return result
  }))
  router.post('/validate', (req, res, next) => handle(res, next, async () => {
    const result = await validatePortablePackage(req.body || {})
    await publishPortabilityEvent(req, 'data-portability.package-validated', {
      websiteId: result.package?.websiteId || null,
      valid: result.valid,
      errorCount: result.errors.length,
      summary: result.summary,
    })
    return result
  }))
  router.post('/imports', (req, res, next) => handle(res, next, async () => {
    const result = await importPortablePackage(req.body || {}, actor(req))
    await publishPortabilityEvent(req, result.mode === 'dry-run' ? 'data-portability.import-validated' : 'data-portability.import-completed', {
      importId: result.id,
      sourceWebsiteId: result.sourceWebsiteId,
      targetWebsiteId: result.targetWebsiteId,
      mode: result.mode,
      status: result.status,
      collectionCount: result.collectionCount,
      assetCount: result.assetCount,
    })
    return result
  }, 201))
  return router
}
