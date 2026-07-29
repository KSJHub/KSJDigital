import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import express from 'express'
import { createAbuseProtectionRouter } from './abuseProtectionRouter.js'
import { createApiKeyRouter } from './apiKeyRouter.js'
import { createAuthenticationAdminRouter, createPasswordResetPublicRouter } from './authenticationAdminRouter.js'
import { createAuthenticationPublicRouter } from './authenticationRouter.js'
import { createAutomationRouter } from './automationRouter.js'
import { createBackupRouter } from './backupRouter.js'
import { createCacheRouter } from './cacheRouter.js'
import { createCollaborationRouter } from './collaborationRouter.js'
import { createConfigurationRouter } from './configurationRouter.js'
import { getCredential, migratePlaintextCredentials, setPassword, verifyPassword } from './credentialStore.js'
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
import {
  getCurrentAuthenticationSession,
  loginWithPassword,
  logoutAuthenticationSession,
  requireAuthenticationSession,
} from './services/authenticationService.js'
import { startAutomationWorker } from './services/automationService.js'
import { startBackupScheduler } from './services/backupService.js'
import { createResponseCacheMiddleware } from './services/cacheService.js'
import { createClientAccount, updateClientAccount } from './services/clientAccountService.js'
import { startCollaborationCleanup } from './services/collaborationService.js'
import { startContentWorkflowScheduler } from './services/contentWorkflowScheduler.js'
import { startEventBusWorker } from './services/eventBusService.js'
import { startIntegrationWorker } from './services/integrationService.js'
import { startJobQueueWorker } from './services/jobQueueService.js'
import { requireAssurance } from './services/mfaService.js'
import { startRetentionScheduler } from './services/retentionComplianceService.js'
import { createRequestMetricsMiddleware, startSystemHealthMonitor } from './services/systemHealthService.js'
import { startWebSocketEventBridge } from './services/webSocketEventBridgeService.js'
import { startWebSocketGateway } from './services/webSocketService.js'
import { createSystemHealthRouter } from './systemHealthRouter.js'
import { createWebSocketRouter } from './webSocketRouter.js'

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}
function configuredCorsOrigins() {
  return new Set(
    [process.env.KSJ_PORTAL_ORIGIN, ...(process.env.KSJ_ALLOWED_ORIGINS || '').split(',')]
      .map(value => String(value || '').trim())
      .filter(Boolean),
  )
}
function localDevelopmentCorsOrigin(origin) {
  if (process.env.NODE_ENV === 'production') return false
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}
function corsOriginAllowed(origin) {
  if (!origin) return true
  if (localDevelopmentCorsOrigin(origin)) return true
  return configuredCorsOrigins().has(origin)
}
function trustedCorsMiddleware(req, res, next) {
  const origin = String(req.headers.origin || '').trim()
  if (!origin) return next()
  if (!corsOriginAllowed(origin)) return res.status(403).json({ error: 'Cross-origin request denied' })

  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE')
    const requestedHeaders = String(req.headers['access-control-request-headers'] || '').trim()
    if (requestedHeaders) res.setHeader('Access-Control-Allow-Headers', requestedHeaders)
    return res.status(204).end()
  }
  next()
}
const credentialConfiguration = {
  morgan: 'KSJ_OWNER_PASSWORD',
  taj: 'TWOTONETAJ_CLIENT_PASSWORD',
  'goliath-admin': 'GOLIATH_CLIENT_PASSWORD',
}
async function synchroniseConfiguredCredentials() {
  for (const [accountId, environmentName] of Object.entries(credentialConfiguration)) {
    const desired = String(process.env[environmentName] || '').trim()
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
      appendAuditEvent({ websiteId: 'global', category: 'authentication', action, outcome: res.statusCode < 400 ? 'success' : 'failure', actor: email ? { email } : null, request: auditRequestContext(req), resource: { type: 'session', id: email }, metadata: { statusCode: res.statusCode, durationMs: Date.now() - startedAt } }).catch(error => console.error('Could not append authentication audit event', error))
    })
    next()
  }
}
loadLocalEnvironment()
await migratePlaintextCredentials()
await synchroniseConfiguredCredentials()
startContentWorkflowScheduler()
startIntegrationWorker()
startAutomationWorker()
startJobQueueWorker()
await startWebSocketEventBridge()
startEventBusWorker()
startRetentionScheduler()
startCollaborationCleanup()
startSystemHealthMonitor()
startBackupScheduler()
const originalUse = express.application.use
const originalGet = express.application.get
const originalPost = express.application.post
const originalPatch = express.application.patch
const originalListen = express.application.listen
let publicRoutesMounted = false
let protectedRoutesMounted = false
let assetServingMounted = false
let assetUploadMounted = false
express.application.get = function guardedGet(...args) {
  if (args[0] === '/api/me') return originalGet.call(this, args[0], getCurrentAuthenticationSession)
  return originalGet.apply(this, args)
}
express.application.post = function guardedPost(...args) {
  if (args[0] === '/api/assets/:ownerId/:websiteId/:slotId' && args.length >= 3) return originalPost.call(this, args[0], args[1], validateUploadedAsset, ...args.slice(2))
  if (args[0] === '/api/login') return originalPost.call(this, args[0], authenticationAudit('login'), loginWithPassword)
  if (args[0] === '/api/logout') return originalPost.call(this, args[0], authenticationAudit('logout'), logoutAuthenticationSession)
  if (args[0] === '/api/clients') return originalPost.call(this, args[0], createClientAccount)
  return originalPost.apply(this, args)
}
express.application.patch = function guardedPatch(...args) {
  if (args[0] === '/api/clients/:id') return originalPatch.call(this, args[0], updateClientAccount)
  return originalPatch.apply(this, args)
}
express.application.use = function routeAwareUse(...args) {
  const mountPath = typeof args[0] === 'string' ? args[0] : ''
  const middleware = mountPath ? args[1] : args[0]
  if (!mountPath && middleware?.name === 'corsMiddleware') return originalUse.call(this, trustedCorsMiddleware)
  if (!publicRoutesMounted && middleware?.name === 'jsonParser') {
    publicRoutesMounted = true
    originalUse.call(this, createAbuseProtectionMiddleware())
    originalUse.call(this, createResponseCacheMiddleware())
    originalUse.call(this, createAuthenticationPublicRouter())
    originalUse.call(this, createPasswordResetPublicRouter())
    mountPublicRoutes(this)
  }
  if (!assetServingMounted && mountPath === '/assets') { assetServingMounted = true; originalUse.call(this, '/assets', assetServingGuard) }
  if (!assetUploadMounted && mountPath === '/api') { assetUploadMounted = true; originalUse.call(this, '/api/assets', assetUploadGuard) }
  const replacingLegacySessionGuard = mountPath === '/api' && middleware?.name === 'requireSession'
  const result = replacingLegacySessionGuard ? originalUse.call(this, '/api', requireAuthenticationSession) : originalUse.apply(this, args)
  if (!protectedRoutesMounted && replacingLegacySessionGuard) {
    protectedRoutesMounted = true
    originalUse.call(this, '/api', createRequestMetricsMiddleware())
    originalUse.call(this, '/api', createIntegrationEventCaptureMiddleware())
    mountProtectedRoutes(this)
    originalUse.call(this, '/api/auth', createAuthenticationAdminRouter())
    originalUse.call(this, '/api/field-registry', createFieldRegistryRouter())
    originalUse.call(this, '/api/integrations', createIntegrationRouter())
    originalUse.call(this, '/api/automations', createAutomationRouter())
    originalUse.call(this, '/api/jobs', createJobQueueRouter())
    originalUse.call(this, '/api/notifications', createNotificationRouter())
    originalUse.call(this, '/api/feature-flags', createFeatureFlagRouter())
    originalUse.call(this, '/api/service-accounts', createServiceAccountRouter())
    originalUse.call(this, '/api/api-keys', requireAssurance(2), createApiKeyRouter())
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
    originalUse.call(this, '/api/websockets', createWebSocketRouter())
  }
  return result
}
express.application.listen = function webSocketAwareListen(...args) {
  const server = createServer(this)
  startWebSocketGateway(server)
  server.listen(...args)
  return server
}
await import('./index.js')
express.application.use = originalUse
express.application.get = originalGet
express.application.post = originalPost
express.application.patch = originalPatch
express.application.listen = originalListen