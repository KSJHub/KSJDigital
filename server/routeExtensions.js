import crypto from 'node:crypto'
import path from 'node:path'
import express from 'express'
import { createAssetLibraryRouter } from './assetLibraryRouter.js'
import { createAuditCaptureMiddleware, createAuditTrailRouter } from './auditTrailRouter.js'
import { assertProductCheckoutAccess } from './checkoutAccess.js'
import { captureBasketPayPalOrder, completeBasketStripeSession } from './basketCheckout.js'
import { createCapabilityAccessGuard } from './capabilityAccessGuard.js'
import { createCmsRouter } from './cmsRouter.js'
import { createCommerceSettingsRouter, createWebsiteOrderPrefixGuard } from './commerceSettingsRouter.js'
import { createContentRouter } from './contentRouter.js'
import { starterWebsites } from './defaults.js'
import { createDispatchRouter } from './dispatchRouter.js'
import { createDynamicContentRouter } from './dynamicContentRouter.js'
import { createInventoryRouter } from './inventoryRouter.js'
import { createLocalisationRouter } from './localisationRouter.js'
import { createOrdersRouter, createPublicOrdersRouter } from './ordersRouter.js'
import { createPayPalOrder, createPayPalRouter, verifyPayPalWebhook } from './paypalCheckout.js'
import { getPublishedContent } from './publishedContent.js'
import { createRefundRouter } from './refundRouter.js'
import { createLiveSessionAccessMiddleware } from './sessionAccess.js'
import { createStripeCheckoutSession, createStripeRouter, processStripeCheckoutCompleted, verifyStripeWebhook } from './stripeCheckout.js'
import { releasePublicStockReservation } from './stockReservations.js'
import { createTaxonomyRouter } from './taxonomyRouter.js'
import { createTeamRouter } from './teamRouter.js'
import { trustedOriginGuard } from './trustedOriginGuard.js'
import { createWebsiteRouter } from './websiteRouter.js'
import { paths, readJson, readWebsiteAssets, safeName, writeJson } from './storage.js'

const MAX_ASSET_UPLOAD_BYTES = 15 * 1024 * 1024
const ALLOWED_ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'])
const FORM_STATUSES = new Set(['Active', 'Draft', 'Archived'])
const FORM_FIELD_TYPES = new Set(['Text', 'Email', 'Textarea', 'Phone', 'Select', 'Checkbox', 'Date', 'File'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9+() .'\-]{5,40}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_PUBLIC_FORM_PAYLOAD_BYTES = 64 * 1024
const STARTER_PUBLIC_FORMS = [
  {
    id: 'contact',
    name: 'Contact Form',
    status: 'Active',
    destination: 'support@ksjdigital.co.uk',
    spamProtection: true,
    fields: [
      { id: 'name', label: 'Name', type: 'Text', required: true, placeholder: 'Your name' },
      { id: 'email', label: 'Email', type: 'Email', required: true, placeholder: 'you@example.com' },
      { id: 'message', label: 'Message', type: 'Textarea', required: true, placeholder: 'How can we help?' },
    ],
    submissions: [],
  },
]

export function assetServingGuard(req, res, next) {
  const extension = path.extname(req.path || '').toLowerCase()
  if (!ALLOWED_ASSET_EXTENSIONS.has(extension)) return res.status(404).send('Asset not found')

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'none'; sandbox")
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (extension === '.pdf') res.setHeader('Content-Disposition', 'attachment')
  next()
}

export function assetUploadGuard(req, res, next) {
  if (req.method !== 'POST') return next()
  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  if (!contentType.startsWith('multipart/form-data;')) {
    return res.status(415).json({ error: 'Asset uploads must use multipart form data' })
  }

  const contentLength = Number(req.headers['content-length'] || 0)
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return res.status(411).json({ error: 'Upload size is required' })
  }
  if (contentLength > MAX_ASSET_UPLOAD_BYTES) {
    return res.status(413).json({ error: 'Asset uploads are limited to 15MB' })
  }
  next()
}

function startsWithBytes(buffer, bytes) {
  return buffer.length >= bytes.length && bytes.every((value, index) => buffer[index] === value)
}

function detectAssetType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { extensions: new Set(['.png']), mime: 'image/png' }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return { extensions: new Set(['.jpg', '.jpeg']), mime: 'image/jpeg' }
  const header = buffer.subarray(0, 12).toString('ascii')
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return { extensions: new Set(['.gif']), mime: 'image/gif' }
  if (header.slice(0, 4) === 'RIFF' && header.slice(8, 12) === 'WEBP') return { extensions: new Set(['.webp']), mime: 'image/webp' }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { extensions: new Set(['.pdf']), mime: 'application/pdf' }
  return null
}

function normalisedIdentifier(value) {
  const raw = String(value || '').trim()
  return raw ? safeName(raw) : ''
}

function assetUploadScopeAllowed(session = {}, params = {}) {
  if (session.role === 'owner') return true

  const accountId = normalisedIdentifier(session.id)
  const websiteIds = new Set(
    (Array.isArray(session.websiteIds) ? session.websiteIds : session.websiteId ? [session.websiteId] : [])
      .map(normalisedIdentifier)
      .filter(Boolean),
  )
  const websiteId = normalisedIdentifier(params.websiteId)
  const ownerId = normalisedIdentifier(params.ownerId)

  if (!websiteId || !websiteIds.has(websiteId)) return false
  return Boolean(ownerId && (ownerId === accountId || websiteIds.has(ownerId)))
}

export function validateUploadedAsset(req, res, next) {
  if (!assetUploadScopeAllowed(req.session, req.params)) {
    return res.status(403).json({ error: 'Asset upload access denied' })
  }
  if (!req.file) return next()

  const fileSize = Number(req.file.size)
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return res.status(400).json({ error: 'Asset file is empty or invalid' })
  }
  if (fileSize > MAX_ASSET_UPLOAD_BYTES) {
    return res.status(413).json({ error: 'Asset uploads are limited to 15MB' })
  }

  const extension = path.extname(req.file.originalname || '').toLowerCase()
  const detected = detectAssetType(req.file.buffer)
  if (!detected || !detected.extensions.has(extension)) {
    return res.status(415).json({ error: 'File content does not match an approved image or PDF type' })
  }

  const suppliedMime = String(req.file.mimetype || '').toLowerCase()
  if (suppliedMime && suppliedMime !== detected.mime) {
    return res.status(415).json({ error: 'File type does not match its uploaded content' })
  }

  req.file.mimetype = detected.mime
  next()
}

function formScopeAllowed(session = {}, websiteId) {
  if (session.role === 'owner') return true
  const allowed = new Set(
    (Array.isArray(session.websiteIds) ? session.websiteIds : session.websiteId ? [session.websiteId] : [])
      .map(normalisedIdentifier)
      .filter(Boolean),
  )
  return allowed.has(normalisedIdentifier(websiteId))
}

function formRecordId(value) {
  return safeName(value || '').replace(/[._]+/g, '-')
}

function normalisedText(value, fallback = '', maxLength = 250) {
  return String(value ?? fallback).trim().slice(0, maxLength)
}

function validDestination(value) {
  const destination = normalisedText(value, '', 320)
  return !destination || EMAIL_PATTERN.test(destination)
}

function sanitiseFormPatch(input = {}) {
  const output = {}
  if ('name' in input) output.name = normalisedText(input.name, '', 120)
  if ('destination' in input) output.destination = normalisedText(input.destination, '', 320).toLowerCase()
  if ('status' in input) output.status = String(input.status || '').trim()
  if ('spamProtection' in input) output.spamProtection = input.spamProtection === true
  return output
}

function sanitiseFieldPatch(input = {}) {
  const output = {}
  if ('label' in input) output.label = normalisedText(input.label, '', 120)
  if ('type' in input) output.type = String(input.type || '').trim()
  if ('required' in input) output.required = input.required === true
  if ('placeholder' in input) output.placeholder = normalisedText(input.placeholder, '', 250)
  return output
}

function validateFormPatch(patch, res) {
  if ('name' in patch && !patch.name) {
    res.status(422).json({ error: 'Form name is required' })
    return false
  }
  if ('destination' in patch && !validDestination(patch.destination)) {
    res.status(422).json({ error: 'Email destination must be a valid email address' })
    return false
  }
  if ('status' in patch && !FORM_STATUSES.has(patch.status)) {
    res.status(422).json({ error: 'Form status is invalid' })
    return false
  }
  return true
}

function validateFieldPatch(patch, res) {
  if ('label' in patch && !patch.label) {
    res.status(422).json({ error: 'Field label is required' })
    return false
  }
  if ('type' in patch && !FORM_FIELD_TYPES.has(patch.type)) {
    res.status(422).json({ error: 'Field type is invalid' })
    return false
  }
  return true
}

function validateBulkForms(forms, res) {
  if (!Array.isArray(forms)) {
    res.status(400).json({ error: 'Forms payload must contain an array' })
    return false
  }

  const formIds = new Set()
  for (const form of forms) {
    if (!form || typeof form !== 'object' || Array.isArray(form)) {
      res.status(422).json({ error: 'Each form must be an object' })
      return false
    }
    const id = formRecordId(form.id)
    if (!id || formIds.has(id)) {
      res.status(422).json({ error: 'Form ids must be present and unique' })
      return false
    }
    formIds.add(id)
    if (!validateFormPatch(sanitiseFormPatch(form), res)) return false
    if (!Array.isArray(form.fields)) {
      res.status(422).json({ error: 'Form fields must be an array' })
      return false
    }
    const fieldIds = new Set()
    for (const field of form.fields) {
      if (!field || typeof field !== 'object' || Array.isArray(field)) {
        res.status(422).json({ error: 'Each form field must be an object' })
        return false
      }
      const fieldId = formRecordId(field.id)
      if (!fieldId || fieldIds.has(fieldId)) {
        res.status(422).json({ error: 'Field ids must be present and unique within each form' })
        return false
      }
      fieldIds.add(fieldId)
      if (!validateFieldPatch(sanitiseFieldPatch(field), res)) return false
    }
  }
  return true
}

function createFormMutationGuard() {
  return async function validateFormMutation(req, res, next) {
    if (req.method === 'GET') return next()
    if (!(req.session?.role === 'owner' || req.session?.canEdit)) return next()

    const parts = String(req.path || '').split('/').filter(Boolean)
    const [websiteId, formId, collection, fieldId, action] = parts
    if (!websiteId || !formScopeAllowed(req.session, websiteId)) return next()

    const forms = await readJson(paths.forms(websiteId), [])
    if (!Array.isArray(forms)) return res.status(500).json({ error: 'Stored forms are invalid' })
    const form = formId ? forms.find(item => item.id === formId) : null

    if (req.method === 'PUT' && parts.length === 1) {
      if (!validateBulkForms(req.body?.forms, res)) return
      return next()
    }

    if (req.method === 'POST' && parts.length === 1) {
      const patch = sanitiseFormPatch(req.body || {})
      if (!('name' in patch)) patch.name = 'New Form'
      if (!('status' in patch)) patch.status = 'Draft'
      if (!validateFormPatch(patch, res)) return
      const requestedId = formRecordId(req.body?.id || patch.name)
      if (requestedId && forms.some(item => formRecordId(item.id) === requestedId)) {
        return res.status(409).json({ error: 'A form with this id already exists' })
      }
      req.body = { ...patch, ...(req.body?.id ? { id: requestedId } : {}) }
      return next()
    }

    if (formId && !form) return res.status(404).json({ error: 'Form not found' })

    if (req.method === 'PATCH' && parts.length === 2) {
      const patch = sanitiseFormPatch(req.body || {})
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No supported form changes were supplied' })
      if (!validateFormPatch(patch, res)) return
      req.body = patch
      return next()
    }

    if (collection === 'test-submission' && req.method === 'POST' && parts.length === 3) {
      const next = forms.map(item => item.id === formId
        ? {
            ...item,
            submissions: [
              { id: `sub-${Date.now()}`, createdAt: new Date().toISOString(), status: 'New', source: 'Portal preview' },
              ...(Array.isArray(item.submissions) ? item.submissions : []),
            ],
          }
        : item)
      await writeJson(paths.forms(websiteId), next)
      return res.json(next)
    }

    if (collection === 'fields' && req.method === 'POST' && parts.length === 3) {
      const patch = sanitiseFieldPatch(req.body || {})
      if (!('type' in patch)) patch.type = 'Text'
      if (!validateFieldPatch(patch, res)) return
      const explicitIdSource = req.body?.id || req.body?.label
      const requestedId = explicitIdSource ? formRecordId(explicitIdSource) : ''
      if (requestedId && (form.fields || []).some(item => formRecordId(item.id) === requestedId)) {
        return res.status(409).json({ error: 'A field with this id already exists in the form' })
      }
      req.body = { ...patch, ...(req.body?.id ? { id: requestedId } : {}) }
      return next()
    }

    if (collection === 'fields' && fieldId) {
      const field = (form.fields || []).find(item => item.id === fieldId)
      if (!field) return res.status(404).json({ error: 'Form field not found' })
      if (req.method === 'PATCH' && parts.length === 4) {
        const patch = sanitiseFieldPatch(req.body || {})
        if (!Object.keys(patch).length) return res.status(400).json({ error: 'No supported field changes were supplied' })
        if (!validateFieldPatch(patch, res)) return
        req.body = patch
      }
      if (req.method === 'POST' && action === 'move' && !['up', 'down'].includes(req.body?.direction)) {
        return res.status(422).json({ error: 'Field move direction must be up or down' })
      }
    }

    next()
  }
}

function publicFormField(field = {}) {
  return {
    id: String(field.id || ''),
    label: String(field.label || ''),
    type: FORM_FIELD_TYPES.has(field.type) ? field.type : 'Text',
    required: field.required === true,
    placeholder: String(field.placeholder || ''),
  }
}

function publicFormMetadata(form = {}) {
  const fields = Array.isArray(form.fields) ? form.fields.map(publicFormField) : []
  return {
    id: String(form.id || ''),
    name: String(form.name || ''),
    fields,
    submissionEnabled: !fields.some(field => field.type === 'File'),
  }
}

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validDateValue(value) {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function publicFieldValue(field, rawValue) {
  if (field.type === 'File') return { error: 'File upload fields are not enabled for public submissions' }

  if (field.type === 'Checkbox') {
    if (rawValue === undefined || rawValue === null) {
      if (field.required) return { error: `${field.label || 'Required field'} must be accepted` }
      return { value: false }
    }
    if (typeof rawValue !== 'boolean') return { error: `${field.label || 'Checkbox'} must be true or false` }
    if (field.required && rawValue !== true) return { error: `${field.label || 'Required field'} must be accepted` }
    return { value: rawValue }
  }

  const maxLength = field.type === 'Textarea' ? 5000 : field.type === 'Email' ? 320 : field.type === 'Phone' ? 40 : 500
  const value = rawValue === undefined || rawValue === null ? '' : normalisedText(rawValue, '', maxLength)
  if (field.required && !value) return { error: `${field.label || 'Required field'} is required` }
  if (!value) return { value: '' }
  if (field.type === 'Email' && !EMAIL_PATTERN.test(value)) return { error: `${field.label || 'Email'} must be a valid email address` }
  if (field.type === 'Phone' && !PHONE_PATTERN.test(value)) return { error: `${field.label || 'Phone'} must be a valid phone number` }
  if (field.type === 'Date' && !validDateValue(value)) return { error: `${field.label || 'Date'} must be a valid date` }
  return { value }
}

function validatePublicSubmission(form, body = {}) {
  if (!plainObject(body)) return { status: 400, error: 'Submission payload must be an object' }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_PUBLIC_FORM_PAYLOAD_BYTES) {
    return { status: 413, error: 'Form submission is too large' }
  }

  const fields = Array.isArray(form.fields) ? form.fields.map(publicFormField) : []
  if (fields.some(field => field.type === 'File')) {
    return { status: 409, error: 'This form requires file uploads, which are not enabled for public submissions yet' }
  }

  if (form.spamProtection !== false) {
    const honeypot = normalisedText(body.website || body.company, '', 120)
    if (honeypot) return { spam: true }
    const startedAt = Number(body.startedAt)
    if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 750) return { spam: true }
  }

  if (!plainObject(body.values)) return { status: 400, error: 'Form values must be an object' }
  const fieldIds = new Set(fields.map(field => field.id))
  const unknown = Object.keys(body.values).find(key => !fieldIds.has(key))
  if (unknown) return { status: 422, error: 'Submission contains an unknown form field' }

  const values = {}
  for (const field of fields) {
    const result = publicFieldValue(field, body.values[field.id])
    if (result.error) return { status: 422, error: result.error }
    values[field.id] = result.value
  }
  return { values }
}

function isBasketMiss(error) {
  return ['Checkout basket was not found', 'Stripe basket reference is missing'].includes(error?.message)
}

function logPublicCheckoutFailure(context, error) {
  console.error(`Public checkout ${context} failed`, error)
}

function publicWebsiteMetadata(website = {}) {
  return {
    id: website.id || null,
    name: website.name || '',
    domain: website.domain || '',
    status: website.status || '',
    logo: website.logo || '',
  }
}

function publicAssetVariant(variant = {}) {
  return {
    id: variant.id || null,
    label: variant.label || '',
    url: variant.url || '',
    mimeType: variant.mimeType || '',
    width: Number(variant.width) > 0 ? Number(variant.width) : null,
    height: Number(variant.height) > 0 ? Number(variant.height) : null,
  }
}

function publicAssetMetadata(asset = {}) {
  return {
    id: asset.id || null,
    name: asset.name || '',
    description: asset.description || '',
    alt: asset.alt || '',
    kind: asset.kind || 'other',
    mimeType: asset.mimeType || '',
    url: asset.url || '',
    width: Number(asset.width) > 0 ? Number(asset.width) : null,
    height: Number(asset.height) > 0 ? Number(asset.height) : null,
    variants: Array.isArray(asset.variants) ? asset.variants.map(publicAssetVariant) : [],
  }
}

export function mountPublicRoutes(app) {
  app.use('/api/public/forms/:websiteId', async (req, res, next) => {
    const websiteId = safeName(req.params.websiteId)
    const websites = await readJson(paths.websites(), starterWebsites)
    const website = websites.find(site => safeName(site.id) === websiteId)
    if (!website) return res.status(404).json({ error: 'Website not found' })

    const forms = await readJson(paths.forms(websiteId), STARTER_PUBLIC_FORMS)
    if (!Array.isArray(forms)) return res.status(500).json({ error: 'Stored forms are invalid' })

    if (req.method === 'GET' && req.path === '/') {
      res.setHeader('Cache-Control', 'no-store')
      return res.json(forms.filter(form => form.status === 'Active').map(publicFormMetadata))
    }

    const parts = String(req.path || '').split('/').filter(Boolean)
    if (req.method === 'POST' && parts.length === 2 && parts[1] === 'submissions') {
      const requestedFormId = formRecordId(parts[0])
      const form = forms.find(item => formRecordId(item.id) === requestedFormId && item.status === 'Active')
      if (!form) return res.status(404).json({ error: 'Active form not found' })

      const validated = validatePublicSubmission(form, req.body || {})
      if (validated.spam) return res.status(202).json({ submitted: true })
      if (validated.error) return res.status(validated.status || 422).json({ error: validated.error })

      const submission = {
        id: `sub-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        status: 'New',
        source: 'Public website',
        values: validated.values,
      }
      const nextForms = forms.map(item => item.id === form.id
        ? { ...item, submissions: [submission, ...(Array.isArray(item.submissions) ? item.submissions : [])] }
        : item)
      await writeJson(paths.forms(websiteId), nextForms)
      return res.status(201).json({ submitted: true, id: submission.id, createdAt: submission.createdAt })
    }

    next()
  })

  app.use('/api/checkout/reservations/:id/release', async (req, res) => {
    try {
      const released = await releasePublicStockReservation(req.params.id)
      if (!released) return res.status(404).json({ error: 'Reservation could not be released' })
      res.json({ released: true })
    } catch {
      res.status(400).json({ error: 'Reservation could not be released' })
    }
  })

  app.use('/api/checkout/stripe/start', async (req, res, next) => {
    if (req.method !== 'GET' || req.path !== '/') return next()
    try {
      await assertProductCheckoutAccess({ websiteId: req.query.websiteId, productId: req.query.productId, provider: 'stripe' })
      const session = await createStripeCheckoutSession({
        websiteId: req.query.websiteId,
        productId: req.query.productId,
        quantity: req.query.quantity,
        variant: { size: req.query.size, colour: req.query.colour },
        discountCode: req.query.discountCode,
      })
      res.redirect(303, session.url)
    } catch (error) {
      logPublicCheckoutFailure('Stripe start', error)
      res.status(400).send('Unable to start Stripe checkout')
    }
  })

  app.use('/api/checkout/stripe/session', express.json({ limit: '1mb' }), async (req, res, next) => {
    if (req.method !== 'POST' || req.path !== '/') return next()
    try {
      await assertProductCheckoutAccess({ websiteId: req.body?.websiteId, productId: req.body?.productId, provider: 'stripe' })
      res.json(await createStripeCheckoutSession(req.body || {}))
    } catch (error) {
      logPublicCheckoutFailure('Stripe session creation', error)
      res.status(400).json({ error: 'Unable to start Stripe checkout' })
    }
  })

  app.use('/api/checkout/stripe/sessions/:id/complete', async (req, res) => {
    try {
      const result = await processStripeCheckoutCompleted({ data: { object: { id: req.params.id } } })
      res.json({ ...result, completed: true })
    } catch (error) {
      logPublicCheckoutFailure('Stripe session completion', error)
      res.status(400).json({ error: 'Unable to complete Stripe checkout' })
    }
  })

  app.use('/api/checkout/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
    try {
      const event = verifyStripeWebhook(req.body, req.headers['stripe-signature'])
      if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return next()
      try {
        await completeBasketStripeSession(event.data?.object?.id)
        return res.json({ received: true, basket: true })
      } catch (error) {
        if (isBasketMiss(error)) return next()
        throw error
      }
    } catch (error) {
      logPublicCheckoutFailure('Stripe webhook', error)
      return res.status(400).json({ error: 'Stripe webhook could not be processed' })
    }
  })

  app.use('/api/checkout/paypal/start', async (req, res, next) => {
    if (req.method !== 'GET' || req.path !== '/') return next()
    try {
      await assertProductCheckoutAccess({ websiteId: req.query.websiteId, productId: req.query.productId, provider: 'paypal' })
      const order = await createPayPalOrder({
        websiteId: req.query.websiteId,
        productId: req.query.productId,
        quantity: req.query.quantity,
        variant: { size: req.query.size, colour: req.query.colour },
        discountCode: req.query.discountCode,
      })
      if (!order.approvalUrl) throw new Error('PayPal approval URL was not returned')
      res.redirect(303, order.approvalUrl)
    } catch (error) {
      logPublicCheckoutFailure('PayPal start', error)
      res.status(400).send('Unable to start PayPal checkout')
    }
  })

  app.use('/api/checkout/paypal/orders', express.json({ limit: '1mb' }), async (req, res, next) => {
    if (req.method !== 'POST' || req.path !== '/') return next()
    try {
      await assertProductCheckoutAccess({ websiteId: req.body?.websiteId, productId: req.body?.productId, provider: 'paypal' })
      res.json(await createPayPalOrder(req.body || {}))
    } catch (error) {
      logPublicCheckoutFailure('PayPal order creation', error)
      res.status(400).json({ error: 'Unable to start PayPal checkout' })
    }
  })

  app.use('/api/checkout/paypal/webhook', express.json({ limit: '1mb' }), async (req, res, next) => {
    try {
      const verified = await verifyPayPalWebhook(req.headers, req.body)
      if (!verified) return res.status(400).json({ error: 'PayPal webhook verification failed' })
      if (req.body?.event_type !== 'CHECKOUT.ORDER.APPROVED') return next()
      try {
        await captureBasketPayPalOrder(req.body.resource?.id)
        return res.json({ received: true, basket: true })
      } catch (error) {
        if (isBasketMiss(error)) return next()
        throw error
      }
    } catch (error) {
      logPublicCheckoutFailure('PayPal webhook', error)
      return res.status(400).json({ error: 'PayPal webhook could not be processed' })
    }
  })

  app.use('/api/checkout/stripe', createStripeRouter())
  app.use('/api/checkout/paypal', express.json({ limit: '1mb' }), createPayPalRouter())

  app.use('/api/public/sites/:websiteId', async (req, res, next) => {
    if (req.method !== 'GET' || req.path !== '/') return next()
    const websiteId = safeName(req.params.websiteId)
    const websites = await readJson(paths.websites(), starterWebsites)
    const website = websites.find(site => safeName(site.id) === websiteId)
    if (!website) return res.status(404).json({ error: 'Website not found' })

    const content = await getPublishedContent(websiteId)
    const assets = (await readWebsiteAssets(websiteId)).map(publicAssetMetadata)
    res.setHeader('Cache-Control', 'no-store')
    res.json({ website: publicWebsiteMetadata(website), content, assets, publishedAt: content.publishedAt || null })
  })

  app.use('/api/public/orders', createPublicOrdersRouter())
}

export function mountProtectedRoutes(app) {
  app.use('/api', createLiveSessionAccessMiddleware())
  app.use('/api', trustedOriginGuard)
  app.use('/api', createCapabilityAccessGuard())
  app.use('/api', createAuditCaptureMiddleware())
  app.use('/api/forms', createFormMutationGuard())
  app.use('/api/audit', createAuditTrailRouter())
  app.use('/api/websites', createWebsiteOrderPrefixGuard())
  app.use('/api/websites', createWebsiteRouter())
  app.use('/api/content', createContentRouter())
  app.use('/api/dynamic-content', createDynamicContentRouter())
  app.use('/api/asset-library', createAssetLibraryRouter())
  app.use('/api/taxonomies', createTaxonomyRouter())
  app.use('/api/localisation', createLocalisationRouter())
  app.use('/api/cms', createCmsRouter())
  app.use('/api/team', createTeamRouter())
  app.use('/api/orders', createDispatchRouter())
  app.use('/api/orders', createOrdersRouter())
  app.use('/api/order-refunds', createRefundRouter())
  app.use('/api/inventory', createInventoryRouter())
  app.use('/api/commerce-settings', createCommerceSettingsRouter())
}
