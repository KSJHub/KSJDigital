import express from 'express'
import { createExportJob, deleteExportJob, getPortabilityState, importPortablePackage, readExportPackage, validatePortablePackage } from './services/dataPortabilityService.js'
import { publishDomainEvent } from './services/realtimeDomainEventService.js'

function requireOwner(req, res, next) {
  if (req.session?.role === 'owner') return next()
  return res.status(403).json({ error: 'Owner permission required' })
}

function handle(res, next, operation, success = 200) {
  Promise.resolve().then(operation).then(result => res.status(success).json(result)).catch(next)
}

function portabilityRegistryPayload(state = {}, subject = {}, details = {}) {
  const jobs = Array.isArray(state.jobs) ? state.jobs : []
  const imports = Array.isArray(state.imports) ? state.imports : []
  return {
    exportCount: jobs.length,
    completedExportCount: jobs.filter(item => item.status === 'completed').length,
    failedExportCount: jobs.filter(item => item.status === 'failed').length,
    importCount: imports.length,
    completedImportCount: imports.filter(item => item.status === 'completed').length,
    validatedImportCount: imports.filter(item => item.status === 'validated').length,
    collectionCount: Number(subject.collectionCount ?? subject.summary?.collectionCount) || 0,
    assetCount: Number(subject.assetCount ?? subject.summary?.assetCount) || 0,
    embeddedAssetCount: Number(subject.summary?.embeddedAssetCount) || 0,
    errorCount: Number(details.errorCount) || 0,
    valid: details.valid === true,
    archive: subject.format === 'archive',
    completed: subject.status === 'completed',
    dryRun: subject.mode === 'dry-run',
    downloaded: details.downloaded === true,
    deleted: details.deleted === true,
  }
}

async function publishDataPortabilityRealtimeEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export function createDataPortabilityRouter() {
  const router = express.Router()
  router.use(requireOwner)

  router.get('/', (req, res, next) => handle(res, next, () => getPortabilityState(req.query)))

  router.post('/exports', (req, res, next) => handle(res, next, async () => {
    const result = await createExportJob(req.body || {}, null)
    const state = await getPortabilityState({ limit: 1000 })
    await publishDataPortabilityRealtimeEvent('data-portability.export-created', portabilityRegistryPayload(state, result))
    return result
  }, 201))

  router.get('/exports/:jobId/download', async (req, res, next) => {
    try {
      const result = await readExportPackage(req.params.jobId)
      const state = await getPortabilityState({ limit: 1000 })
      await publishDataPortabilityRealtimeEvent('data-portability.export-downloaded', portabilityRegistryPayload(state, result.job, { downloaded: true }))
      res.set('Content-Type', result.contentType)
      res.set('Content-Disposition', `attachment; filename="${result.filename}"`)
      res.set('Content-Length', String(result.bytes.length))
      res.send(result.bytes)
    } catch (error) { next(error) }
  })

  router.delete('/exports/:jobId', (req, res, next) => handle(res, next, async () => {
    const state = await getPortabilityState({ limit: 1000 })
    const existing = state.jobs.find(item => item.id === req.params.jobId)
    if (!existing) return { deleted: false, id: req.params.jobId }
    const result = await deleteExportJob(req.params.jobId, null)
    const updatedState = await getPortabilityState({ limit: 1000 })
    await publishDataPortabilityRealtimeEvent('data-portability.export-deleted', portabilityRegistryPayload(updatedState, {}, result))
    return result
  }))

  router.post('/validate', (req, res, next) => handle(res, next, async () => {
    const result = await validatePortablePackage(req.body || {})
    const state = await getPortabilityState({ limit: 1000 })
    await publishDataPortabilityRealtimeEvent('data-portability.package-validated', portabilityRegistryPayload(state, result, { valid: result.valid, errorCount: result.errors.length }))
    return result
  }))

  router.post('/imports', (req, res, next) => handle(res, next, async () => {
    const result = await importPortablePackage(req.body || {}, null)
    const state = await getPortabilityState({ limit: 1000 })
    await publishDataPortabilityRealtimeEvent(
      result.mode === 'dry-run' ? 'data-portability.import-validated' : 'data-portability.import-completed',
      portabilityRegistryPayload(state, result),
    )
    return result
  }, 201))

  return router
}
