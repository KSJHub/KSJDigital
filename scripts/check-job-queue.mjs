import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const originalCwd = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-job-queue-'))
process.chdir(temporary)

async function removeTemporaryDirectory() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
      return
    } catch (error) {
      if (attempt === 5) throw error
      await new Promise(resolve => setTimeout(resolve, attempt * 50))
    }
  }
}

try {
  const service = await import(path.join(originalCwd, 'server/services/jobQueueService.js'))

  const first = await service.enqueueJob({ handler: 'noop', queue: 'high', priority: 50, idempotencyKey: 'same', payload: { value: 1 } })
  const duplicate = await service.enqueueJob({ handler: 'noop', queue: 'high', priority: 50, idempotencyKey: 'same', payload: { value: 2 } })
  assert.equal(duplicate.id, first.id)

  const second = await service.enqueueJob({ handler: 'noop', queue: 'high', priority: 1 })
  const claimed = await service.claimJobs('validator', { queue: 'high', limit: 2, leaseMs: 60_000 })
  assert.equal(claimed.length, 2)
  assert.equal(claimed[0].id, first.id)
  await service.completeJob(first.id, { workerId: 'validator', leaseToken: claimed[0].lease.token, result: { ok: true } })

  const secondClaim = claimed.find(job => job.id === second.id)
  await service.failJob(second.id, { workerId: 'validator', leaseToken: secondClaim.lease.token, error: 'expected failure' })
  const state = await service.getJobQueue({ limit: 20 })
  assert.equal(state.jobs.find(job => job.id === first.id).status, 'completed')
  assert.equal(state.jobs.find(job => job.id === second.id).status, 'retrying')

  const scheduled = await service.upsertJobSchedule({ id: 'heartbeat', name: 'Heartbeat', handler: 'noop', intervalMs: 60_000, nextRunAt: new Date(Date.now() - 1000).toISOString() })
  assert.equal(scheduled.id, 'heartbeat')
  await service.processJobQueue({ workerId: 'scheduler-validator', limit: 10 })
  const afterSchedule = await service.getJobQueue({ limit: 50 })
  assert(afterSchedule.jobs.some(job => job.idempotencyKey?.startsWith('schedule:heartbeat:')))

  const routerSource = await fs.readFile(path.join(originalCwd, 'server/jobQueueRouter.js'), 'utf8')
  const startSource = await fs.readFile(path.join(originalCwd, 'server/start.js'), 'utf8')
  assert.match(routerSource, /Owner permission required/)
  assert.match(routerSource, /dead-letter/)
  assert.match(startSource, /createJobQueueRouter/)
  assert.match(startSource, /startJobQueueWorker/)
  assert.match(startSource, /\/api\/jobs/)

  await new Promise(resolve => setTimeout(resolve, 100))
  console.log('Job queue checks passed')
} finally {
  process.chdir(originalCwd)
  await removeTemporaryDirectory()
}
