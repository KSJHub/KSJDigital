import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  appendAuditEvent,
  exportAuditEvents,
  getAuditConfig,
  pruneAuditEvents,
  searchAuditEvents,
  updateAuditConfig,
} from '../server/services/auditTrailService.js'

const websiteId = `audit-check-${Date.now()}`
const auditDir = path.resolve(process.cwd(), 'server-data', 'audit-events')

try {
  const events = await Promise.all([
    appendAuditEvent({ websiteId, category: 'content', action: 'create', actor: { id: 'editor-1' }, resource: { type: 'article', id: 'a1' }, changes: { title: 'One', password: 'hidden' } }),
    appendAuditEvent({ websiteId, category: 'workflow', action: 'publish', actor: { id: 'owner-1' }, resource: { type: 'article', id: 'a1' } }),
  ])
  assert.equal(events.length, 2)

  const all = await searchAuditEvents(websiteId)
  assert.equal(all.total, 2)
  assert.equal(all.results[1].changes.password, '[redacted]')

  const filtered = await searchAuditEvents(websiteId, { category: 'workflow', actorId: 'owner-1' })
  assert.equal(filtered.total, 1)
  assert.equal(filtered.results[0].action, 'publish')

  const config = await updateAuditConfig(websiteId, { retentionDays: 30 })
  assert.equal(config.retentionDays, 30)
  assert.equal((await getAuditConfig(websiteId)).retentionDays, 30)

  const json = await exportAuditEvents(websiteId, { format: 'json' })
  assert.equal(json.contentType, 'application/json')
  assert.match(json.data, /workflow/)

  const csv = await exportAuditEvents(websiteId, { format: 'csv' })
  assert.match(csv.contentType, /text\/csv/)
  assert.match(csv.data, /timestamp/)

  await appendAuditEvent({ websiteId, category: 'legacy', action: 'old', timestamp: '2000-01-01T00:00:00.000Z' })
  const pruned = await pruneAuditEvents(websiteId, { retentionDays: 1 })
  assert.equal(pruned.removed, 1)

  const routerSource = await fs.readFile(path.resolve(process.cwd(), 'server', 'auditTrailRouter.js'), 'utf8')
  const extensionsSource = await fs.readFile(path.resolve(process.cwd(), 'server', 'routeExtensions.js'), 'utf8')
  assert.match(routerSource, /createAuditCaptureMiddleware/)
  assert.match(routerSource, /startsWith\('\/api\/audit'\)/)
  assert.match(extensionsSource, /createAuditCaptureMiddleware\(\)/)
  assert.match(extensionsSource, /app\.use\('\/api\/audit', createAuditTrailRouter\(\)\)/)

  console.log('Audit trail validation passed')
} finally {
  await fs.rm(path.join(auditDir, `${websiteId}.json`), { force: true })
  await fs.rm(path.join(auditDir, `${websiteId}.config.json`), { force: true })
}
