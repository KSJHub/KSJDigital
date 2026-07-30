import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
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
import { createClientAccount, deleteClientAccount, updateClientAccount } from './services/clientAccountService.js'
import { startCollaborationCleanup } from './services/collaborationService.js'
import { startContentWorkflowScheduler } from './services/contentWorkflowScheduler.js'
import { startEventBusWorker } from './services/eventBusService.js'
import { startIntegrationWorker } from './services/integrationService.js'
import { startJobQueueWorker } from './services/jobQueueService.js'
import { requireAssurance } from './services/mfaService.js'
import { queueEmailNotification } from './services/notificationService.js'
import { startRetentionScheduler } from './services/retentionComplianceService.js'
import { createRequestMetricsMiddleware, startSystemHealthMonitor } from './services/systemHealthService.js'
import { startWebSocketEventBridge } from './services/webSocketEventBridgeService.js'
import { startWebSocketGateway } from './services/webSocketService.js'
import { DATA_DIR, paths, readJson, safeName, writeJson } from './storage.js'
import { createSystemHealthRouter } from './systemHealthRouter.js'
import { createWebSocketRouter } from './webSocketRouter.js'

const PUBLIC_FORM_FILE_MAX_BYTES = 5 * 1024 * 1024
const PUBLIC_FORM_MAX_FILES = 5
const PUBLIC_FORM_TEXT_MAX_BYTES = 64 * 1024
const PUBLIC_FORM_ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf'])
const PUBLIC_FORM_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PUBLIC_FORM_PHONE_PATTERN = /^[0-9+() .'\-]{5,40}$/
const PUBLIC_FORM_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const publicFormUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PUBLIC_FORM_FILE_MAX_BYTES,
    files: PUBLIC_FORM_MAX_FILES,
    fields: 50,
    fieldSize: PUBLIC_FORM_TEXT_MAX_BYTES,
  },
})

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
function basketCheckoutErrorSanitizer(req, res, next) {
  const originalJson = res.json.bind(res)
  res.json = body => {
    if (res.statusCode < 400 || !body || typeof body !== 'object' || typeof body.error !== 'string') return originalJson(body)
    console.error('Public basket checkout failed', { method: req.method, path: req.originalUrl || req.url, error: body.error })
    const route = String(req.path || req.url || '')
    const paypal = route.startsWith('/paypal')
    const completing = route.includes('/capture') || route.includes('/complete')
    const provider = paypal ? 'PayPal' : 'Stripe'
    return originalJson({ error: completing ? `Unable to complete ${provider} checkout` : `Unable to start ${provider} checkout` })
  }
  next()
}
function publicFormSubmissionRoute(req) {
  if (req.method !== 'POST') return null
  const route = String(req.path || req.originalUrl || req.url || '').split('?')[0]
  const match = route.match(/^\/api\/public\/forms\/([^/]+)\/([^/]+)\/submissions\/?$/)
  if (!match) return null
  return { websiteId: safeName(decodeURIComponent(match[1])), formId: safeName(decodeURIComponent(match[2])) }
}
function publicFormAttachmentDirectory(websiteId) {
  return path.join(DATA_DIR, 'form-attachments', safeName(websiteId))
}
function publicFormAttachmentPath(websiteId, attachmentId) {
  return path.join(publicFormAttachmentDirectory(websiteId), safeName(attachmentId))
}
function startsWithBytes(buffer, bytes) {
  return Buffer.isBuffer(buffer) && buffer.length >= bytes.length && bytes.every((value, index) => buffer[index] === value)
}
function detectPublicFormFile(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { extensions: new Set(['.png']), mimeType: 'image/png' }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return { extensions: new Set(['.jpg', '.jpeg']), mimeType: 'image/jpeg' }
  const header = buffer.subarray(0, 12).toString('ascii')
  if (header.slice(0, 4) === 'RIFF' && header.slice(8, 12) === 'WEBP') return { extensions: new Set(['.webp']), mimeType: 'image/webp' }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { extensions: new Set(['.pdf']), mimeType: 'application/pdf' }
  return null
}
function safeAttachmentName(value) {
  return path.basename(String(value || 'attachment')).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || 'attachment'
}
function validPublicFormDate(value) {
  if (!PUBLIC_FORM_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
function publicFormTextValue(field, rawValue) {
  if (field.type === 'Checkbox') {
    if (rawValue === undefined || rawValue === null) return field.required ? { error: `${field.label || 'Required field'} must be accepted` } : { value: false }
    if (typeof rawValue !== 'boolean') return { error: `${field.label || 'Checkbox'} must be true or false` }
    if (field.required && rawValue !== true) return { error: `${field.label || 'Required field'} must be accepted` }
    return { value: rawValue }
  }
  const maximum = field.type === 'Textarea' ? 5000 : field.type === 'Email' ? 320 : field.type === 'Phone' ? 40 : 500
  const value = String(rawValue ?? '').trim().slice(0, maximum)
  if (field.required && !value) return { error: `${field.label || 'Required field'} is required` }
  if (!value) return { value: '' }
  if (field.type === 'Email' && !PUBLIC_FORM_EMAIL_PATTERN.test(value)) return { error: `${field.label || 'Email'} must be a valid email address` }
  if (field.type === 'Phone' && !PUBLIC_FORM_PHONE_PATTERN.test(value)) return { error: `${field.label || 'Phone'} must be a valid phone number` }
  if (field.type === 'Date' && !validPublicFormDate(value)) return { error: `${field.label || 'Date'} must be a valid date` }
  return { value }
}
function parseMultipartValues(req) {
  let values = req.body?.values
  if (typeof values === 'string') {
    try { values = JSON.parse(values) } catch { return { error: 'Form values must be valid JSON' } }
  }
  if (!values || typeof values !== 'object' || Array.isArray(values)) return { error: 'Form values must be an object' }
  if (Buffer.byteLength(JSON.stringify(values), 'utf8') > PUBLIC_FORM_TEXT_MAX_BYTES) return { error: 'Form submission is too large', status: 413 }
  return { values }
}
function validateMultipartFormSubmission(form, req) {
  if (form.spamProtection !== false) {
    const honeypot = String(req.body?.website || req.body?.company || '').trim().slice(0, 120)
    if (honeypot) return { spam: true }
    const startedAt = Number(req.body?.startedAt)
    if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 750) return { spam: true }
  }

  const parsed = parseMultipartValues(req)
  if (parsed.error) return parsed
  const fields = Array.isArray(form.fields) ? form.fields : []
  const fieldIds = new Set(fields.map(field => String(field.id || '')))
  const unknownValue = Object.keys(parsed.values).find(key => !fieldIds.has(key))
  if (unknownValue) return { error: 'Submission contains an unknown form field', status: 422 }

  const fileFields = new Map(fields.filter(field => field.type === 'File').map(field => [String(field.id || ''), field]))
  const uploaded = new Map()
  for (const file of Array.isArray(req.files) ? req.files : []) {
    const field = fileFields.get(String(file.fieldname || ''))
    if (!field) return { error: 'Submission contains a file for an unknown or non-file field', status: 422 }
    if (uploaded.has(field.id)) return { error: `${field.label || 'File'} accepts one file only`, status: 422 }
    const extension = path.extname(file.originalname || '').toLowerCase()
    if (!PUBLIC_FORM_ALLOWED_EXTENSIONS.has(extension)) return { error: `${field.label || 'File'} must be a PDF, PNG, JPG or WebP file`, status: 415 }
    if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0 || Number(file.size) > PUBLIC_FORM_FILE_MAX_BYTES) return { error: `${field.label || 'File'} must be between 1 byte and 5 MB`, status: 413 }
    const detected = detectPublicFormFile(file.buffer)
    if (!detected || !detected.extensions.has(extension)) return { error: `${field.label || 'File'} content does not match its file extension`, status: 415 }
    const suppliedMime = String(file.mimetype || '').toLowerCase()
    if (suppliedMime && suppliedMime !== detected.mimeType) return { error: `${field.label || 'File'} content does not match its MIME type`, status: 415 }
    uploaded.set(field.id, { file, detected })
  }

  const values = {}
  for (const field of fields) {
    if (field.type === 'File') {
      if (field.required && !uploaded.has(field.id)) return { error: `${field.label || 'Required file'} is required`, status: 422 }
      values[field.id] = uploaded.has(field.id) ? safeAttachmentName(uploaded.get(field.id).file.originalname) : ''
      continue
    }
    const result = publicFormTextValue(field, parsed.values[field.id])
    if (result.error) return { error: result.error, status: 422 }
    values[field.id] = result.value
  }
  return { values, uploaded }
}
async function persistMultipartFormSubmission(route, form, validated) {
  const submission = {
    id: `sub-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    status: 'New',
    source: 'Public website',
    values: validated.values,
    attachments: [],
  }
  const writtenFiles = []
  try {
    if (validated.uploaded?.size) await fs.promises.mkdir(publicFormAttachmentDirectory(route.websiteId), { recursive: true })
    for (const [fieldId, entry] of validated.uploaded || []) {
      const attachment = {
        id: `att-${crypto.randomUUID()}`,
        fieldId,
        name: safeAttachmentName(entry.file.originalname),
        mimeType: entry.detected.mimeType,
        size: Number(entry.file.size),
      }
      const file = publicFormAttachmentPath(route.websiteId, attachment.id)
      await fs.promises.writeFile(file, entry.file.buffer, { flag: 'wx' })
      writtenFiles.push(file)
      submission.attachments.push(attachment)
    }

    const forms = await readJson(paths.forms(route.websiteId), [])
    if (!Array.isArray(forms)) throw new Error('Stored forms are invalid')
    const currentForm = forms.find(item => safeName(item.id) === route.formId && item.status === 'Active')
    if (!currentForm) throw new Error('Active form not found')
    const nextForms = forms.map(item => item.id === currentForm.id
      ? { ...item, submissions: [submission, ...(Array.isArray(item.submissions) ? item.submissions : [])] }
      : item)
    await writeJson(paths.forms(route.websiteId), nextForms)
    return submission
  } catch (error) {
    await Promise.all(writtenFiles.map(file => fs.promises.rm(file, { force: true }).catch(() => {})))
    throw error
  }
}
function publicFormMultipartSubmissionMiddleware(req, res, next) {
  const route = publicFormSubmissionRoute(req)
  if (!route || !String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data;')) return next()

  publicFormUpload.any()(req, res, async error => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Each form attachment is limited to 5 MB' })
      if (error.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: `Form submissions are limited to ${PUBLIC_FORM_MAX_FILES} attachments` })
      return res.status(400).json({ error: 'Form attachment upload could not be processed' })
    }
    try {
      const forms = await readJson(paths.forms(route.websiteId), [])
      if (!Array.isArray(forms)) return res.status(500).json({ error: 'Stored forms are invalid' })
      const form = forms.find(item => safeName(item.id) === route.formId && item.status === 'Active')
      if (!form) return res.status(404).json({ error: 'Active form not found' })
      if (!(form.fields || []).some(field => field.type === 'File')) return next()

      const validated = validateMultipartFormSubmission(form, req)
      if (validated.spam) return res.status(202).json({ submitted: true })
      if (validated.error) return res.status(validated.status || 422).json({ error: validated.error })
      const submission = await persistMultipartFormSubmission(route, form, validated)
      return res.status(201).json({ submitted: true, id: submission.id, createdAt: submission.createdAt })
    } catch (uploadError) {
      console.error('Public form attachment submission failed', { websiteId: route.websiteId, formId: route.formId, error: uploadError?.message || 'Upload failed' })
      return res.status(500).json({ error: 'Form submission could not be stored' })
    }
  })
}
function publicFormFileCapabilityResponse(req, res, next) {
  const route = String(req.originalUrl || req.url || '').split('?')[0]
  if (req.method !== 'GET' || !/^\/api\/public\/forms\/[^/]+\/?$/.test(route)) return next()
  const originalJson = res.json.bind(res)
  res.json = body => originalJson(Array.isArray(body) ? body.map(form => ({
    ...form,
    submissionEnabled: true,
    ...((form.fields || []).some(field => field.type === 'File') ? {
      fileUpload: {
        maxBytes: PUBLIC_FORM_FILE_MAX_BYTES,
        maxFiles: PUBLIC_FORM_MAX_FILES,
        extensions: [...PUBLIC_FORM_ALLOWED_EXTENSIONS],
      },
    } : {}),
  })) : body)
  next()
}
function formSubmissionEmailBody(websiteId, form, result, values = {}, attachments = []) {
  const lines = [
    'A new public form submission has been received.',
    '',
    `Website: ${websiteId}`,
    `Form: ${form.name || form.id}`,
    `Submission ID: ${result.id || ''}`,
    `Received: ${result.createdAt || new Date().toISOString()}`,
    '',
  ]
  for (const field of Array.isArray(form.fields) ? form.fields : []) {
    const raw = values[field.id]
    if (raw === undefined || raw === null || raw === '') continue
    const value = typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : String(raw)
    lines.push(`${field.label || field.id}: ${value}`)
  }
  if (attachments.length) {
    lines.push('', 'Attachments:')
    for (const attachment of attachments) lines.push(`- ${attachment.name} (${Math.ceil(Number(attachment.size || 0) / 1024)} KB)`)
    lines.push('Attachments are available securely from the KSJ Digital Forms portal.')
  }
  return lines.join('\n')
}
async function queuePublicFormSubmissionEmail(route, req, result) {
  const forms = await readJson(paths.forms(route.websiteId), [])
  if (!Array.isArray(forms)) return
  const form = forms.find(item => safeName(item.id) === route.formId)
  const destination = String(form?.destination || '').trim().toLowerCase()
  if (!form || !destination) return
  const submission = (form.submissions || []).find(item => item.id === result.id)

  await queueEmailNotification({
    to: destination,
    subject: `New ${form.name || 'form'} submission — ${route.websiteId}`,
    body: formSubmissionEmailBody(route.websiteId, form, result, submission?.values || req.body?.values || {}, submission?.attachments || []),
    category: 'form-submission',
    metadata: { websiteId: route.websiteId, formId: form.id, submissionId: result.id || null },
    deduplicationKey: result.id ? `form-submission:${route.websiteId}:${form.id}:${result.id}` : undefined,
  })
}
function formSubmissionNotificationCapture(req, res, next) {
  const route = publicFormSubmissionRoute(req)
  if (!route) return next()

  const originalJson = res.json.bind(res)
  let result = null
  res.json = body => {
    if (res.statusCode === 201 && body?.submitted === true && body?.id) result = body
    return originalJson(body)
  }
  res.on('finish', () => {
    if (!result) return
    queuePublicFormSubmissionEmail(route, req, result).catch(error => {
      console.error('Could not queue public form submission email', {
        websiteId: route.websiteId,
        formId: route.formId,
        submissionId: result.id,
        error: error?.message || 'Notification queue failed',
      })
    })
  })
  next()
}
async function downloadFormAttachment(req, res) {
  const websiteId = safeName(req.params.websiteId)
  const formId = safeName(req.params.formId)
  const submissionId = String(req.params.submissionId || '')
  const attachmentId = safeName(req.params.attachmentId)
  if (req.session?.role !== 'owner') {
    const assigned = new Set((Array.isArray(req.session?.websiteIds) ? req.session.websiteIds : req.session?.websiteId ? [req.session.websiteId] : []).map(safeName))
    if (!assigned.has(websiteId)) return res.status(403).json({ error: 'Website access denied' })
  }
  const forms = await readJson(paths.forms(websiteId), [])
  const form = Array.isArray(forms) ? forms.find(item => safeName(item.id) === formId) : null
  const submission = form?.submissions?.find(item => item.id === submissionId)
  const attachment = submission?.attachments?.find(item => safeName(item.id) === attachmentId)
  if (!form || !submission || !attachment) return res.status(404).json({ error: 'Attachment not found' })
  try {
    const buffer = await fs.promises.readFile(publicFormAttachmentPath(websiteId, attachment.id))
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream')
    res.setHeader('Content-Length', buffer.length)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeAttachmentName(attachment.name))}`)
    return res.send(buffer)
  } catch (error) {
    if (error?.code === 'ENOENT') return res.status(404).json({ error: 'Attachment file not found' })
    console.error('Could not read form attachment', { websiteId, formId, submissionId, attachmentId, error: error?.message || 'Read failed' })
    return res.status(500).json({ error: 'Attachment could not be downloaded' })
  }
}
function attachmentIds(forms = []) {
  const ids = new Set()
  for (const form of Array.isArray(forms) ? forms : []) {
    for (const submission of Array.isArray(form?.submissions) ? form.submissions : []) {
      for (const attachment of Array.isArray(submission?.attachments) ? submission.attachments : []) {
        if (attachment?.id) ids.add(safeName(attachment.id))
      }
    }
  }
  return ids
}
function formAttachmentCleanupCapture(req, res, next) {
  if (!['PUT', 'DELETE'].includes(req.method)) return next()
  const route = String(req.originalUrl || req.url || '').split('?')[0]
  const match = route.match(/^\/api\/forms\/([^/]+)(?:\/([^/]+))?\/?$/)
  if (!match) return next()
  const websiteId = safeName(decodeURIComponent(match[1]))
  const formId = match[2] ? safeName(decodeURIComponent(match[2])) : null
  readJson(paths.forms(websiteId), []).then(forms => {
    const beforeForms = formId ? (Array.isArray(forms) ? forms.filter(form => safeName(form.id) === formId) : []) : forms
    const before = attachmentIds(beforeForms)
    if (!before.size) return
    res.on('finish', () => {
      if (res.statusCode >= 400) return
      readJson(paths.forms(websiteId), []).then(currentForms => {
        const retained = attachmentIds(currentForms)
        const removed = [...before].filter(id => !retained.has(id))
        return Promise.all(removed.map(id => fs.promises.rm(publicFormAttachmentPath(websiteId, id), { force: true })))
      }).catch(error => console.error('Could not clean removed form attachments', { websiteId, formId, error: error?.message || 'Cleanup failed' }))
    })
  }).catch(error => console.error('Could not prepare form attachment cleanup', { websiteId, formId, error: error?.message || 'Cleanup preparation failed' }))
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
const originalDelete = express.application.delete
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
  if (args[0] === '/api/publish/requests/:id/approve' || args[0] === '/api/publish/requests/:id/reject') {
    return originalPost.call(this, args[0], requireAssurance(2), ...args.slice(1))
  }
  return originalPost.apply(this, args)
}
express.application.patch = function guardedPatch(...args) {
  if (args[0] === '/api/clients/:id') return originalPatch.call(this, args[0], updateClientAccount)
  return originalPatch.apply(this, args)
}
express.application.delete = function guardedDelete(...args) {
  if (args[0] === '/api/clients/:id') return originalDelete.call(this, args[0], deleteClientAccount)
  return originalDelete.apply(this, args)
}
express.application.use = function routeAwareUse(...args) {
  const mountPath = typeof args[0] === 'string' ? args[0] : ''
  const middleware = mountPath ? args[1] : args[0]
  if (!mountPath && middleware?.name === 'corsMiddleware') return originalUse.call(this, trustedCorsMiddleware)
  if (!publicRoutesMounted && middleware?.name === 'jsonParser') {
    publicRoutesMounted = true
    const jsonParserResult = originalUse.apply(this, args)
    originalUse.call(this, createAbuseProtectionMiddleware())
    originalUse.call(this, createResponseCacheMiddleware())
    originalUse.call(this, publicFormFileCapabilityResponse)
    originalUse.call(this, formSubmissionNotificationCapture)
    originalUse.call(this, publicFormMultipartSubmissionMiddleware)
    originalUse.call(this, createAuthenticationPublicRouter())
    originalUse.call(this, createPasswordResetPublicRouter())
    mountPublicRoutes(this)
    return jsonParserResult
  }
  if (mountPath === '/api/checkout/basket') return originalUse.call(this, mountPath, basketCheckoutErrorSanitizer, ...args.slice(1))
  if (!assetServingMounted && mountPath === '/assets') { assetServingMounted = true; originalUse.call(this, '/assets', assetServingGuard) }
  if (!assetUploadMounted && mountPath === '/api') { assetUploadMounted = true; originalUse.call(this, '/api/assets', assetUploadGuard) }
  const replacingLegacySessionGuard = mountPath === '/api' && middleware?.name === 'requireSession'
  const result = replacingLegacySessionGuard ? originalUse.call(this, '/api', requireAuthenticationSession) : originalUse.apply(this, args)
  if (!protectedRoutesMounted && replacingLegacySessionGuard) {
    protectedRoutesMounted = true
    originalUse.call(this, '/api', formAttachmentCleanupCapture)
    originalUse.call(this, '/api', createRequestMetricsMiddleware())
    originalUse.call(this, '/api', createIntegrationEventCaptureMiddleware())
    mountProtectedRoutes(this)
    originalGet.call(this, '/api/forms/:websiteId/:formId/submissions/:submissionId/attachments/:attachmentId', downloadFormAttachment)
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
express.application.delete = originalDelete
express.application.listen = originalListen