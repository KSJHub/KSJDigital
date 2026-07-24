import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  cancelAutomationExecution,
  deleteAutomationJob,
  enqueueAutomationJob,
  getAutomationHealth,
  getAutomationRegistry,
  listAutomationHandlers,
  processAutomationQueue,
  retryAutomationExecution,
  searchAutomationExecutions,
  updateAutomationSettings,
  upsertAutomationJob,
} from '../server/services/automationService.js'

const websiteId = `automation-check-${Date.now()}`
const dataFile = path.resolve('server-data', 'automations', `${websiteId}.json`)

try {
  assert(listAutomationHandlers().includes('noop'))
  assert(listAutomationHandlers().includes('integration-event'))

  const once = await upsertAutomationJob(websiteId, {
    name: 'One-time validation job',
    handler: 'noop',
    payload: { value: 1 },
    schedule: { type: 'once', at: new Date(Date.now() - 1000).toISOString() },
    maxAttempts: 2,
  })
  assert.equal(once.schedule.type, 'once')

  const recurring = await upsertAutomationJob(websiteId, {
    name: 'Recurring validation job',
    handler: 'noop',
    payload: { recurring: true },
    schedule: { type: 'interval', intervalMs: 60_000 },
  })
  assert.equal(recurring.schedule.intervalMs, 60_000)

  const manual = await enqueueAutomationJob(websiteId, recurring.id)
  assert.equal(manual.status, 'pending')

  const processed = await processAutomationQueue(websiteId, { limit: 20 })
  assert(processed.processed >= 1)

  const executions = await searchAutomationExecutions(websiteId, { limit: 100 })
  assert(executions.results.some(item => item.status === 'completed'))

  const pending = await enqueueAutomationJob(websiteId, recurring.id)
  const cancelled = await cancelAutomationExecution(websiteId, pending.id)
  assert.equal(cancelled.status, 'cancelled')
  const retried = await retryAutomationExecution(websiteId, pending.id)
  assert.equal(retried.status, 'pending')

  const settings = await updateAutomationSettings(websiteId, { failureAlertThreshold: 5, executionRetentionDays: 30 })
  assert.equal(settings.failureAlertThreshold, 5)

  const health = await getAutomationHealth(websiteId)
  assert.equal(health.websiteId, websiteId)
  assert.equal(typeof health.healthy, 'boolean')

  const registry = await getAutomationRegistry(websiteId)
  assert(registry.jobs.some(item => item.id === once.id))
  assert(registry.jobs.some(item => item.id === recurring.id))

  await deleteAutomationJob(websiteId, once.id)
  const afterDelete = await getAutomationRegistry(websiteId)
  assert(!afterDelete.jobs.some(item => item.id === once.id))

  const routerSource = await fs.readFile(path.resolve('server', 'automationRouter.js'), 'utf8')
  const startSource = await fs.readFile(path.resolve('server', 'start.js'), 'utf8')
  assert(routerSource.includes("router.get('/:websiteId/health'"))
  assert(routerSource.includes('requireWebsiteAccess'))
  assert(startSource.includes('startAutomationWorker()'))
  assert(startSource.includes("'/api/automations'"))

  console.log('Automation engine checks passed')
} finally {
  await fs.rm(dataFile, { force: true })
}
