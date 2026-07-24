import assert from 'node:assert/strict'
import {
  collectSystemHealth,
  getSystemHealthHistory,
  recordWorkerHeartbeat,
  updateSystemHealthSettings,
  writeStructuredLog,
} from '../server/services/systemHealthService.js'

await recordWorkerHeartbeat('validation-worker', { status: 'running' })
const snapshot = await collectSystemHealth()
assert.ok(['healthy', 'degraded', 'critical'].includes(snapshot.status))
assert.ok(snapshot.metrics)
assert.ok(snapshot.metrics.automationQueue)
assert.ok(snapshot.metrics.integrationQueue)
assert.ok(Array.isArray(snapshot.dependencies))

const settings = await updateSystemHealthSettings({ queueWarningDepth: 10, queueCriticalDepth: 20, heartbeatStaleMs: 120000 })
assert.equal(settings.queueWarningDepth, 10)
assert.equal(settings.queueCriticalDepth, 20)

const log = await writeStructuredLog('info', 'System health validation', { token: 'secret-value', safe: true })
assert.equal(log.context.token, '[redacted]')
assert.equal(log.context.safe, true)

const history = await getSystemHealthHistory({ limit: 10 })
assert.ok(Array.isArray(history.metrics))
assert.ok(history.heartbeats['validation-worker'])

console.log('System health checks passed')
