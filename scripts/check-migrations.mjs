import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const serviceFile = path.join(root, 'server', 'services', 'migrationService.js')
const routerSource = await fs.readFile(path.join(root, 'server', 'migrationRouter.js'), 'utf8')
const startSource = await fs.readFile(path.join(root, 'server', 'start.js'), 'utf8')

assert.match(routerSource, /req\.session\?\.role === 'owner'/)
assert.match(routerSource, /migrationPlan/)
assert.match(routerSource, /executeMigration/)
assert.match(routerSource, /executeRetention/)
assert.match(startSource, /createMigrationRouter/)
assert.match(startSource, /\/api\/migrations/)

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-migrations-'))
process.chdir(temporary)
try {
  const migration = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)
  const dataDir = path.join(temporary, 'server-data')
  await fs.mkdir(path.join(dataDir, 'content'), { recursive: true })
  await fs.writeFile(path.join(dataDir, 'content', 'sample.json'), JSON.stringify({ profile: { oldName: 'KSJ' }, events: [{ createdAt: '2020-01-01T00:00:00.000Z' }, { createdAt: new Date().toISOString() }] }, null, 2))

  const definition = await migration.registerMigration({
    version: '1.0.0',
    name: 'rename-profile-field',
    up: [{ file: 'content/sample.json', type: 'rename', key: 'profile.oldName', to: 'profile.name' }],
    down: [{ file: 'content/sample.json', type: 'rename', key: 'profile.name', to: 'profile.oldName' }],
  }, { id: 'check' })
  assert.equal(definition.version, '1.0.0')
  assert.equal(definition.checksum.length, 64)

  const lock = await migration.acquireMigrationLock('global', { ttlMinutes: 5 }, { id: 'check' })
  await assert.rejects(() => migration.acquireMigrationLock('global', {}, { id: 'other' }), /already locked/)
  const plan = await migration.migrationPlan(definition.id, 'up')
  assert.equal(plan.ready, true)
  assert.equal(plan.changedFiles[0], 'content/sample.json')
  await assert.rejects(() => migration.executeMigration(definition.id, { lockToken: lock.token, confirmationToken: 'wrong', createBackup: false }, { id: 'check' }), /confirmation token/)
  const applied = await migration.executeMigration(definition.id, { lockToken: lock.token, confirmationToken: plan.confirmationToken, createBackup: false }, { id: 'check' })
  assert.equal(applied.status, 'applied')
  const document = JSON.parse(await fs.readFile(path.join(dataDir, 'content', 'sample.json'), 'utf8'))
  assert.equal(document.profile.name, 'KSJ')
  assert.equal(Object.hasOwn(document.profile, 'oldName'), false)
  await migration.releaseMigrationLock('global', lock.token, { id: 'check' })

  const policy = await migration.upsertRetentionPolicy({ id: 'event-history', file: 'content/sample.json', arrayKey: 'events', dateKey: 'createdAt', retentionDays: 30 }, { id: 'check' })
  assert.equal(policy.enabled, true)
  const retentionLock = await migration.acquireMigrationLock('retention', {}, { id: 'check' })
  const retentionPlan = await migration.retentionPlan(policy.id)
  assert.equal(retentionPlan.removable, 1)
  const retained = await migration.executeRetention(policy.id, { lockToken: retentionLock.token, confirmationToken: retentionPlan.confirmationToken, createBackup: false }, { id: 'check' })
  assert.equal(retained.removed, 1)
  const finalDocument = JSON.parse(await fs.readFile(path.join(dataDir, 'content', 'sample.json'), 'utf8'))
  assert.equal(finalDocument.events.length, 1)

  const state = await migration.listMigrationState()
  assert.equal(state.applied.length, 1)
  assert.equal(state.retentionRuns.length, 1)
  assert.ok(state.history.some(item => item.action === 'migration.applied'))
  assert.ok(state.history.some(item => item.action === 'retention.executed'))
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
}

console.log('Migration and data lifecycle checks passed')