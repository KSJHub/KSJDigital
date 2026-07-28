import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/systemHealthRouter.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishSystemHealthRealtimeEvent('system-health.checked'",
  "publishSystemHealthRealtimeEvent('system-health.incident-detected'",
  "publishSystemHealthRealtimeEvent('system-health.settings-updated'",
  "publishSystemHealthRealtimeEvent('system-health.log-written'",
  'dependencyCount:',
  'failedDependencyCount:',
  'workerCount:',
  'staleWorkerCount:',
  'metricSampleCount:',
  'incidentCount:',
  'automationQueueActiveCount:',
  'automationQueueFailedCount:',
  'integrationQueueActiveCount:',
  'integrationQueueFailedCount:',
  'settingsChanged:',
  'logWritten:',
  'incidentCreated:',
]) {
  if (!router.includes(token)) failures.push(`Missing system health realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function healthRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishSystemHealthRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'status:', 'reasons:', 'checkedAt:', 'memoryPercent:', 'automationQueue:', 'integrationQueue:',
  'dependencies:', 'heartbeats:', 'settings:', 'logId:', 'level:', 'timestamp:', 'hostname:', 'pid:',
  'node:', 'platform:', 'loadAverage:', 'freeMemoryBytes:', 'totalMemoryBytes:', 'rssBytes:',
  'heapUsedBytes:', 'heapTotalBytes:', 'summary:', 'metrics:', 'message:', 'context:', 'actor:',
  'session', 'email:', 'role:', 'payload:', 'req.body', 'req.params', 'req.query', '...snapshot',
  '...history', 'error.message', 'error.details',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`System health event payload exposes forbidden telemetry: ${forbidden}`)
}

if (!router.includes("async function publishSystemHealthRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('System health events must use an awaited aggregate-only canonical publisher')
}

const healthCollect = router.indexOf('const snapshot = await collectSystemHealth()')
const healthPublish = router.indexOf("await publishSystemHealthRealtimeEvent('system-health.checked'")
if (healthCollect < 0 || healthPublish < healthCollect) failures.push('System health collection must persist before checked-event publication')

const incidentGuard = router.indexOf('if (history.incidents.length > before.incidents.length)')
const incidentPublish = router.indexOf("await publishSystemHealthRealtimeEvent('system-health.incident-detected'")
if (incidentGuard < 0 || incidentPublish < incidentGuard) failures.push('Incident events must publish only when a new incident was persisted')

const settingsGuard = router.indexOf("if (JSON.stringify(requested) === JSON.stringify(history.settings || {})) return res.json(history.settings)")
const settingsMutation = router.indexOf('const settings = await updateSystemHealthSettings(')
const settingsPublish = router.indexOf("await publishSystemHealthRealtimeEvent('system-health.settings-updated'")
if (settingsGuard < 0 || settingsMutation < settingsGuard || settingsPublish < settingsMutation) {
  failures.push('Unchanged system health settings must return before persistence and publication')
}

const logMutation = router.indexOf('const entry = await writeStructuredLog(')
const logPublish = router.indexOf("await publishSystemHealthRealtimeEvent('system-health.log-written'")
if (logMutation < 0 || logPublish < logMutation) failures.push('Structured logs must persist before realtime publication')

for (const topic of [
  'system-health.checked',
  'system-health.incident-detected',
  'system-health.settings-updated',
  'system-health.log-written',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`System health topic must be owned by the canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('System health real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('System health real-time event checks passed')
