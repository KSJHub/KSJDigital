import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/dataPortabilityRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishDataPortabilityRealtimeEvent('data-portability.export-created'",
  "publishDataPortabilityRealtimeEvent('data-portability.export-downloaded'",
  "publishDataPortabilityRealtimeEvent('data-portability.export-deleted'",
  "publishDataPortabilityRealtimeEvent('data-portability.package-validated'",
  "'data-portability.import-validated' : 'data-portability.import-completed'",
  'exportCount:',
  'completedExportCount:',
  'failedExportCount:',
  'importCount:',
  'completedImportCount:',
  'validatedImportCount:',
  'collectionCount:',
  'assetCount:',
  'embeddedAssetCount:',
  'errorCount:',
  'downloaded:',
  'deleted:',
]) {
  if (!router.includes(token)) failures.push(`Missing data portability realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function portabilityRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishDataPortabilityRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'jobId:', 'importId:', 'websiteId:', 'sourceWebsiteId:', 'targetWebsiteId:', 'format:', 'status:',
  'sizeBytes:', 'checksum:', 'internalPath:', 'completedAt:', 'startedAt:', 'createdAt:', 'updatedAt:',
  'summary:', 'package:', 'collections:', 'assetFiles:', 'assetManifest:', 'integrity:', 'bytes:',
  'filename:', 'contentType:', 'actor:', 'session', 'email:', 'role:', 'payload:', 'req.body',
  'req.params', '...result', '...subject', 'error.message', 'error.details',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Data portability event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishDataPortabilityRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Data portability events must use an awaited aggregate-only canonical publisher')
}

const exportMutation = router.indexOf('const result = await createExportJob(')
const exportPublish = router.indexOf("await publishDataPortabilityRealtimeEvent('data-portability.export-created'")
if (exportMutation < 0 || exportPublish < exportMutation) failures.push('Export creation must persist before publication')

const downloadRead = router.indexOf('const result = await readExportPackage(')
const downloadPublish = router.indexOf("await publishDataPortabilityRealtimeEvent('data-portability.export-downloaded'")
if (downloadRead < 0 || downloadPublish < downloadRead) failures.push('Export download must be validated before publication')

const deleteGuard = router.indexOf("if (!existing) return { deleted: false, id: req.params.jobId }")
const deleteMutation = router.indexOf('const result = await deleteExportJob(')
const deletePublish = router.indexOf("await publishDataPortabilityRealtimeEvent('data-portability.export-deleted'")
if (deleteGuard < 0 || deleteMutation < deleteGuard || deletePublish < deleteMutation) {
  failures.push('Missing export jobs must return before persistence and publication')
}

const validateMutation = router.indexOf('const result = await validatePortablePackage(')
const validatePublish = router.indexOf("await publishDataPortabilityRealtimeEvent('data-portability.package-validated'")
if (validateMutation < 0 || validatePublish < validateMutation) failures.push('Package validation must persist before publication')

const importMutation = router.indexOf('const result = await importPortablePackage(')
const importPublish = router.indexOf('await publishDataPortabilityRealtimeEvent(', importMutation)
if (importMutation < 0 || importPublish < importMutation) failures.push('Package import must persist before publication')

for (const topic of [
  'data-portability.export-created',
  'data-portability.export-downloaded',
  'data-portability.export-deleted',
  'data-portability.package-validated',
  'data-portability.import-validated',
  'data-portability.import-completed',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Data portability topic must be owned by the canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('Data portability real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Data portability real-time event checks passed')
