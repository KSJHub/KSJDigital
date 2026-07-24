import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-feature-flags-'))
process.chdir(temporary)

try {
  const service = await import(path.join(root, 'server/services/featureFlagService.js'))

  const targeted = await service.upsertFeatureFlag({
    key: 'new-editor',
    name: 'New editor',
    environments: ['staging', 'production'],
    websiteIds: ['site-one'],
    percentage: 100,
  }, { id: 'check' })
  assert.equal(targeted.key, 'new-editor')

  const websiteMatch = await service.evaluateFeatureFlag('new-editor', { environment: 'production', websiteId: 'site-one' })
  assert.equal(websiteMatch.enabled, true)
  assert.equal(websiteMatch.reason, 'website-targeted')

  const environmentMiss = await service.evaluateFeatureFlag('new-editor', { environment: 'development', websiteId: 'site-one' })
  assert.equal(environmentMiss.enabled, false)
  assert.equal(environmentMiss.reason, 'environment-not-targeted')

  const targetMiss = await service.evaluateFeatureFlag('new-editor', { environment: 'production', websiteId: 'site-two' })
  assert.equal(targetMiss.enabled, false)
  assert.equal(targetMiss.reason, 'not-targeted')

  await service.upsertFeatureFlag({ key: 'percentage-test', name: 'Percentage test', percentage: 37 }, { id: 'check' })
  const first = await service.evaluateFeatureFlag('percentage-test', { environment: 'test', userId: 'member@example.com' })
  const second = await service.evaluateFeatureFlag('percentage-test', { environment: 'test', userId: 'member@example.com' })
  assert.equal(first.enabled, second.enabled)
  assert.equal(first.bucket, second.bucket)

  await service.setFeatureFlagKillSwitch('percentage-test', true, { id: 'check' })
  const killed = await service.evaluateFeatureFlag('percentage-test', { environment: 'test', userId: 'member@example.com' })
  assert.equal(killed.enabled, false)
  assert.equal(killed.reason, 'kill-switch')

  const missing = await service.evaluateFeatureFlag('missing-flag', { environment: 'test' })
  assert.equal(missing.enabled, false)
  assert.equal(missing.reason, 'flag-not-found')

  const state = await service.getFeatureFlagState({ limit: 100 })
  assert.equal(state.flags.length, 2)
  assert(state.history.some(item => item.action === 'feature-flag.kill-switch-enabled'))
  assert(state.evaluations.length >= 6)

  const routerSource = await fs.readFile(path.join(root, 'server/featureFlagRouter.js'), 'utf8')
  const startSource = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(routerSource, /Owner permission required/)
  assert.match(routerSource, /kill-switch/)
  assert.match(startSource, /createFeatureFlagRouter/)
  assert.match(startSource, /\/api\/feature-flags/)

  await new Promise(resolve => setTimeout(resolve, 100))
  console.log('Feature flag and controlled rollout checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
