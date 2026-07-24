import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-retention-'))
process.chdir(temporary)
try {
  const serviceFile = path.join(root, 'server/services/retentionComplianceService.js')
  const retention = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)
  const dataDir = path.join(temporary, 'server-data')
  await fs.mkdir(path.join(dataDir, 'content'), { recursive: true })
  const now = Date.now()
  await fs.writeFile(path.join(dataDir, 'content', 'site-one.json'), JSON.stringify([
    { id: 'expired', updatedAt: new Date(now - 400 * 86400000).toISOString(), title: 'Expired' },
    { id: 'held', updatedAt: new Date(now - 400 * 86400000).toISOString(), title: 'Held' },
    { id: 'current', updatedAt: new Date(now).toISOString(), title: 'Current' },
  ]))

  const policy = await retention.upsertRetentionPolicy({ id: 'content-year', websiteId: 'site-one', resourceType: 'content', retentionDays: 365 }, { id: 'check' })
  assert.equal(policy.websiteId, 'site-one')
  await retention.upsertLegalHold({ id: 'case-one', websiteId: 'site-one', resourceType: 'content', recordIds: ['held'], reason: 'Active legal matter' }, { id: 'check' })

  const preview = await retention.previewRetentionPolicy('content-year')
  assert.equal(preview.candidateCount, 1)
  assert.equal(preview.heldCount, 1)
  assert.equal(preview.candidates[0].id, 'expired')

  const run = await retention.executeRetentionPolicy('content-year', { id: 'check' })
  assert.equal(run.purgedCount, 1)
  assert.equal(run.heldCount, 1)
  const remaining = JSON.parse(await fs.readFile(path.join(dataDir, 'content', 'site-one.json'), 'utf8'))
  assert.deepEqual(remaining.map(item => item.id).sort(), ['current', 'held'])

  const state = await retention.getRetentionState({ limit: 100 })
  assert.equal(state.purgeHistory.length, 1)
  assert.equal(state.purgeHistory[0].recordId, 'expired')
  assert.match(state.purgeHistory[0].recordFingerprint, /^[a-f0-9]{64}$/)
  assert.equal(state.statistics.purgedRecords, 1)

  const report = await retention.createComplianceReport()
  assert.equal(report.controls.legalHolds, true)
  assert.equal(report.activeLegalHoldCount, 1)

  const router = await fs.readFile(path.join(root, 'server/retentionComplianceRouter.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(router, /Owner permission required/)
  assert.match(router, /legal-holds/)
  assert.match(router, /preview/)
  assert.match(start, /startRetentionScheduler/)
  assert.match(start, /createRetentionComplianceRouter/)
  assert.match(start, /\/api\/retention-compliance/)

  console.log('Retention and compliance checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
