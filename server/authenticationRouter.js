import crypto from 'node:crypto'
import express from 'express'
import { completeMfaLogin } from './services/authenticationService.js'
import { paths, readJson, safeName, writeJson } from './storage.js'

const PUBLIC_FIELD_TYPES = new Set(['Text', 'Email', 'Textarea', 'Phone', 'Select', 'Checkbox', 'Date', 'File'])
const PUBLIC_FIELD_LENGTH_CAPS = { Text: 500, Email: 320, Textarea: 5000, Phone: 40, Select: 500, Date: 20 }
const PUBLIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PUBLIC_PHONE_PATTERN = /^[0-9+() .'\-]{5,40}$/
const PUBLIC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CONDITIONAL_OPERATORS = new Set(['equals', 'notEquals', 'checked', 'unchecked'])

function publicSections(form = {}) {
  const source = Array.isArray(form.sections) ? form.sections : []
  const seen = new Set()
  return source.map((section, index) => {
    const id = safeName(section?.id || `step-${index + 1}`)
    if (!id || seen.has(id)) return null
    seen.add(id)
    return {
      id,
      title: String(section?.title || `Step ${index + 1}`).trim().slice(0, 120) || `Step ${index + 1}`,
      description: String(section?.description || '').trim().slice(0, 300),
    }
  }).filter(Boolean).slice(0, 20)
}

function publicCondition(field = {}, earlierFields = []) {
  const condition = field.condition && typeof field.condition === 'object' && !Array.isArray(field.condition) ? field.condition : null
  if (!condition) return null
  const source = earlierFields.find(item => item.id === String(condition.fieldId || ''))
  if (!source || source.type === 'File') return null
  const operator = String(condition.operator || '')
  if (!CONDITIONAL_OPERATORS.has(operator)) return null
  if (source.type === 'Checkbox' && !['checked', 'unchecked'].includes(operator)) return null
  if (source.type !== 'Checkbox' && !['equals', 'notEquals'].includes(operator)) return null
  return {
    fieldId: source.id,
    operator,
    value: source.type === 'Checkbox' ? '' : String(condition.value || '').trim().slice(0, 120),
  }
}

function publicFieldConfiguration(field = {}, earlierFields = [], sectionIds = new Set()) {
  const type = PUBLIC_FIELD_TYPES.has(field.type) ? field.type : 'Text'
  const cap = PUBLIC_FIELD_LENGTH_CAPS[type] || null
  const options = Array.isArray(field.options)
    ? field.options.map(value => String(value || '').trim().slice(0, 120)).filter(Boolean).slice(0, 50)
    : []
  const requestedMin = Number(field.minLength)
  const requestedMax = Number(field.maxLength)
  const maxLength = cap && Number.isInteger(requestedMax) && requestedMax > 0 ? Math.min(requestedMax, cap) : null
  const minLength = cap && Number.isInteger(requestedMin) && requestedMin > 0
    ? Math.min(requestedMin, maxLength || cap)
    : null
  const requestedSectionId = safeName(field.sectionId || '')
  return {
    id: String(field.id || ''),
    label: String(field.label || ''),
    type,
    required: field.required === true,
    placeholder: String(field.placeholder || ''),
    helpText: String(field.helpText || '').trim().slice(0, 300),
    options,
    minLength,
    maxLength,
    sectionId: sectionIds.has(requestedSectionId) ? requestedSectionId : '',
    condition: publicCondition(field, earlierFields),
  }
}

function publicFields(form = {}, sections = publicSections(form)) {
  const result = []
  const sectionIds = new Set(sections.map(section => section.id))
  for (const field of Array.isArray(form.fields) ? form.fields : []) result.push(publicFieldConfiguration(field, result, sectionIds))
  return result
}

function conditionMatches(condition, values = {}) {
  if (!condition) return true
  const actual = values[condition.fieldId]
  if (condition.operator === 'checked') return actual === true
  if (condition.operator === 'unchecked') return actual !== true
  const text = actual === undefined || actual === null ? '' : String(actual).trim()
  if (condition.operator === 'equals') return text === condition.value
  if (condition.operator === 'notEquals') return text !== condition.value
  return true
}

function validDate(value) {
  if (!PUBLIC_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function validateFieldValue(field, rawValue) {
  if (field.type === 'Checkbox') {
    if (rawValue === undefined || rawValue === null) return field.required ? { error: `${field.label || 'Required field'} must be accepted` } : { value: false }
    if (typeof rawValue !== 'boolean') return { error: `${field.label || 'Checkbox'} must be true or false` }
    if (field.required && rawValue !== true) return { error: `${field.label || 'Required field'} must be accepted` }
    return { value: rawValue }
  }
  const cap = PUBLIC_FIELD_LENGTH_CAPS[field.type] || 500
  const value = String(rawValue ?? '').trim().slice(0, cap)
  if (field.required && !value) return { error: `${field.label || 'Required field'} is required` }
  if (!value) return { value: '' }
  if (field.minLength && value.length < field.minLength) return { error: `${field.label || 'Field'} must be at least ${field.minLength} characters` }
  if (field.maxLength && value.length > field.maxLength) return { error: `${field.label || 'Field'} must be no more than ${field.maxLength} characters` }
  if (field.type === 'Email' && !PUBLIC_EMAIL_PATTERN.test(value)) return { error: `${field.label || 'Email'} must be a valid email address` }
  if (field.type === 'Phone' && !PUBLIC_PHONE_PATTERN.test(value)) return { error: `${field.label || 'Phone'} must be a valid phone number` }
  if (field.type === 'Date' && !validDate(value)) return { error: `${field.label || 'Date'} must be a valid date` }
  if (field.type === 'Select' && field.options.length && !field.options.includes(value)) return { error: `${field.label || 'Selection'} contains an invalid option` }
  return { value }
}

function validateConditionalJsonSubmission(form, body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, error: 'Submission payload must be an object' }
  if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) return { status: 400, error: 'Form values must be an object' }
  if (form.spamProtection !== false) {
    if (String(body.website || body.company || '').trim()) return { spam: true }
    const startedAt = Number(body.startedAt)
    if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 750) return { spam: true }
  }
  const fields = publicFields(form)
  if (fields.some(field => field.type === 'File')) return { status: 409, error: 'Conditional logic is not enabled for file-upload forms yet' }
  const fieldIds = new Set(fields.map(field => field.id))
  if (Object.keys(body.values).some(key => !fieldIds.has(key))) return { status: 422, error: 'Submission contains an unknown form field' }
  const values = {}
  for (const field of fields) {
    if (!conditionMatches(field.condition, values)) continue
    const result = validateFieldValue(field, body.values[field.id])
    if (result.error) return { status: 422, error: result.error }
    values[field.id] = result.value
  }
  return { values }
}

export function createAuthenticationPublicRouter() {
  const router = express.Router()
  router.post('/api/login/mfa', (req, res, next) => {
    Promise.resolve(completeMfaLogin(req, res)).catch(next)
  })
  router.get('/api/public/form-config/:websiteId', async (req, res, next) => {
    try {
      const websiteId = safeName(req.params.websiteId)
      const forms = await readJson(paths.forms(websiteId), [])
      if (!Array.isArray(forms)) return res.status(500).json({ error: 'Stored forms are invalid' })
      res.setHeader('Cache-Control', 'no-store')
      res.json(forms.filter(form => form.status === 'Active').map(form => {
        const sections = publicSections(form)
        return {
          id: String(form.id || ''),
          successMessage: String(form.successMessage || '').trim().slice(0, 500),
          conditionalLogicEnabled: !(form.fields || []).some(field => field.type === 'File'),
          sections,
          fields: publicFields(form, sections),
        }
      }))
    } catch (error) {
      next(error)
    }
  })
  router.post('/api/public/forms/:websiteId/:formId/submissions', async (req, res, next) => {
    if (String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data;')) return next()
    try {
      const websiteId = safeName(req.params.websiteId)
      const formId = safeName(req.params.formId)
      const forms = await readJson(paths.forms(websiteId), [])
      if (!Array.isArray(forms)) return res.status(500).json({ error: 'Stored forms are invalid' })
      const form = forms.find(item => safeName(item.id) === formId && item.status === 'Active')
      if (!form) return res.status(404).json({ error: 'Active form not found' })
      const hasConditions = (form.fields || []).some(field => field.condition)
      if (!hasConditions) return next()
      const validated = validateConditionalJsonSubmission(form, req.body || {})
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
    } catch (error) {
      next(error)
    }
  })
  return router
}
