import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { createAbuseProtectionRouter } from './abuseProtectionRouter.js'
import { createApiKeyRouter } from './apiKeyRouter.js'
import { createAutomationRouter } from './automationRouter.js'
import { createBackupRouter } from './backupRouter.js'
import { createCacheRouter } from './cacheRouter.js'
import { createCollaborationRouter } from './collaborationRouter.js'
import { createConfigurationRouter } from './configurationRouter.js'
import { getCredential, setPassword, verifyPassword } from './credentialStore.js'
import { createDataPortabilityRouter } from './dataPortabilityRouter.js'
import { createEventBusRouter } from './eventBusRouter.js'
import { createFeatureFlagRouter } from './featureFlagRouter.js'
import { createFieldRegistryRouter } from './fieldRegistryRouter.js'
import { createIntegrationEventCaptureMiddleware, createIntegrationRouter } from './integrationRouter.js'
import { createJobQueueRouter } from './jobQueueRouter.js'
import { createMfaRouter } from './mfaRouter.js'
import { createMigrationRouter } from './migrationRouter.js'
import { createNotificationRouter } from './notificationRouter.js'
import { createPrivacyRightsRouter } from './privacyRightsRouter.js'
import { createReleaseRouter } from './releaseRouter.js'
import { createRetentionComplianceRouter } from './retentionComplianceRouter.js'
import { createServiceAccountRouter } from './serviceAccountRouter.js'
import {
  assetServingGuard,
  assetUploadGuard,
  mountProtectedRoutes,
  mountPublicRoutes,
  validateUploadedAsset,
} from './routeExtensions.js'
import { createAbuseProtectionMiddleware } from './services/abuseProtectionService.js'
import { appendAuditEvent, auditRequestContext } from './services/auditTrailService.js'
import { startAutomationWorker } from './services/automationService.js'
import { startBackupScheduler } from './services/backupService.js'
import { createResponseCacheMiddleware } from './services/cacheService.js'
import { startCollaborationCleanup } from './services/collaborationService.js'
import { startContentWorkflowScheduler } from './services/contentWorkflowScheduler.js'
import { startEventBusWorker } from './services/eventBusService.js'
import { startIntegrationWorker } from './services/integrationService.js'
import { startJobQueueWorker } from './services/jobQueueService.js'
import { startRetentionScheduler } from './services/retentionComplianceService.js'
import { createRequestMetricsMiddleware, startSystemHealthMonitor } from './services/systemHealthService.js'
import { createSystemHealthRouter } from './systemHealthRouter.js'

function loadLocalEnvironment() {
  const file = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(file)) return

  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

const credentialConfiguration = {
  morgan: { environment: 'KSJ_OWNER_PASSWORD', development: 'owner-access' },
  taj: { environment: 'TWOTONETAJ_CLIENT_PASSWORD', development: 'client-access' },
  'goliath-admin': { environment: 'GOLIATH_CLIENT_PASSWORD', development: 'draft-access' },
}

async function synchroniseConfiguredCredentials() {
  const production = process.env.NODE_ENV === 'production'

  for (const [accountId, configuration] of Object.entries(credentialConfiguration)) {
    const configured = String(process.env[configuration.environment] || '').trim()
    const desired = configured || (!production ? configuration.development : '')
    if (!desired) continue

    const current = await getCredential(accountId)
    if (current?.passwordHash && await verifyPassword(desired, current.passwordHash)) continue
    await setPassword(accountId, desired)
  }
}

function authenticationAudit(action) {
  return function captureAuthentication(req, res, next) {
    const startedAt = Date.now()
    const email = action === 'login' ? String(req.body?.email || '').trim().toLowerCase() : null
    res.on('finish', () => {
      appendAuditEvent({
        websiteId: 'global',
        category: 'authentication',
        action,
        outcome: res.statusCode < 400 ? 'success' : 'failure',
        actor: email ? { email } : null,
        request: auditRequestContext(req),
        resource: { type: 'session', id: email },
        metadata: { statusCode: res.statusCode, durationMs: Date.now() - startedAt },
      }).catch(error => console.error('Could not append authentication audit event', error))
    })
    next()
  }
}

loadLocalEnvironment()
await synchroniseConfiguredCredentials()
startContentWorkflowScheduler()
startIntegrationWorker()
startAutomationWorker()
startJobQueueWorker()
startEventBusWorker()
startRetentionScheduler()
startCollaborationCleanup()
startSystemHealthMonitor()
startBackupScheduler()

const originalUse = express.application.use
const originalPost = express.application.post
let publicRoutesMounted = false
let protectedRoutesMounted = false
let assetServingMounted = false
let assetUploadMounted = false

express.application.post = function guardedPost(...args) {
  if (args[0] === '/api/assets/:ownerId/:websiteId/:slotId' && args.length >= 3) {
    return originalPost.call(this, args[0], args[1], validateUploadedAsset, ...args.slice(2))
  }
  if (args[0] === '/api/login') return originalPost.call(this, args[0], authenticationAudit('login'), ...args.slice(1))
  if (args[0] === '/api/logout') return originalPost.call(this, args[0], authenticationAudit('logout'), ...args.slice(1))
  return originalPost.apply(this, args)
}

express.application.use = function routeAwareUse(...args) {
  const mountPath = typeof args[0] === 'string' ? args[0] : ''
  const middleware = mountPath ? args[1] : args[0]

  if (!publicRoutesMounted && middleware?.name === 'jsonParser') {
    publicRoutesMounted = true
    originalUse.call(this, createAbuseProtectionMiddleware())
    originalUse.call(this, createResponseCacheMiddleware())
    mountPublicRoutes(this)
  }

  if (!assetServingMounted && mountPath === '/assets') {
    assetServingMounted = true
    originalUse.call(this, '/assets', assetServingGuard)
  }

  if (!assetUploadMounted && mountPath === '/api') {
    assetUploadMounted = true
    originalUse.call(this, '/api/assets', assetUploadGuard)
  }

  const result = originalUse.apply(this, args)

  if (!protectedRoutesMounted && mountPath === '/api' && middleware?.name === 'requireSession') {
    protectedRoutesMounted = true
    originalUse.call(this, '/api', createRequestMetricsMiddleware())
    originalUse.call(this, '/api', createIntegrationEventCaptureMiddleware())
    mountProtectedRoutes(this)
    originalUse.call(this, '/api/field-registry', createFieldRegistryRouter())
    originalUse.call(this, '/api/integrations', createIntegrationRouter())
    originalUse.call(this, '/api/automations', createAutomationRouter())
    originalUse.call(this, '/api/jobs', createJobQueueRouter())
    originalUse.call(this, '/api/notifications', createNotificationRouter())
    originalUse.call(this, '/api/feature-flags', createFeatureFlagRouter())
    originalUse.call(this, '/api/service-accounts', createServiceAccountRouter())
    originalUse.call(this, '/api/api-keys', createApiKeyRouter())
    originalUse.call(this, '/api/mfa', createMfaRouter())
    originalUse.call(this, '/api/abuse-protection', createAbuseProtectionRouter())
    originalUse.call(this, '/api/cache', createCacheRouter())
    originalUse.call(this, '/api/event-bus', createEventBusRouter())
    originalUse.call(this, '/api/data-portability', createDataPortabilityRouter())
    originalUse.call(this, '/api/retention-compliance', createRetentionComplianceRouter())
    originalUse.call(this, '/api/privacy-rights', createPrivacyRightsRouter())
    originalUse.call(this, '/api/collaboration', createCollaborationRouter())
    originalUse.call(this, '/api/system-health', createSystemHealthRouter())
    originalUse.call(this, '/api/backups', createBackupRouter())
    originalUse.call(this, '/api/configuration', createConfigurationRouter())
    originalUse.call(this, '/api/releases', createReleaseRouter())
    originalUse.call(this, '/api/migrations', createMigrationRouter())
  }

  return result
}

await import('./index.js')

express.application.use = originalUse
express.application.post = originalPost
