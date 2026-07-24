import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-release-check-'))
const previous = process.cwd()
process.chdir(root)
process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET = 'test-session-secret-1234567890'
process.env.INTEGRATION_SIGNING_SECRET = 'test-signing-secret-1234567890'

try {
  const service = await import('../server/services/releaseService.js')
  const release = await service.createRelease({ version: '1.2.3', commitSha: 'abc123', artifact: { name: 'dist.zip', sha256: 'a'.repeat(64), size: 123 } }, { id: 'owner' })
  assert.equal(release.version, '1.2.3')
  assert.equal(release.artifact.sha256, 'a'.repeat(64))

  const maintenance = await service.setMaintenanceMode('test', { enabled: true, message: 'Deploying' }, { id: 'owner' })
  assert.equal(maintenance.enabled, true)
  assert.equal((await service.getMaintenanceMode('test')).message, 'Deploying')

  const lock = await service.acquireDeploymentLock('test', { ttlMinutes: 5 }, { id: 'owner' })
  assert.equal(lock.environment, 'test')
  assert.equal(typeof lock.token, 'string')
  await assert.rejects(() => service.acquireDeploymentLock('test', {}, { id: 'second' }), /already locked/)

  const plan = await service.deploymentPlan(release.id, 'test')
  assert.equal(plan.release.id, release.id)
  assert.equal(typeof plan.confirmationToken, 'string')

  await assert.rejects(() => service.promoteRelease(release.id, 'test', { lockToken: lock.token, confirmationToken: 'wrong', createBackup: false }, { id: 'owner' }), /confirmation token/)
  await service.releaseDeploymentLock('test', lock.token, { id: 'owner' })

  const state = await service.listReleaseState()
  assert.equal(state.releases.length, 1)
  assert.equal(state.history.some(item => item.action === 'release.created'), true)

  const routerSource = await fs.readFile(path.resolve(previous, 'server/releaseRouter.js'), 'utf8')
  assert.match(routerSource, /Owner permission required/)
  assert.match(routerSource, /promote/)
  assert.match(routerSource, /rollback/)
  const startSource = await fs.readFile(path.resolve(previous, 'server/start.js'), 'utf8')
  assert.match(startSource, /createReleaseRouter/)
  assert.match(startSource, /\/api\/releases/)

  console.log('Release management checks passed')
} finally {
  process.chdir(previous)
  await fs.rm(root, { recursive: true, force: true })
}
