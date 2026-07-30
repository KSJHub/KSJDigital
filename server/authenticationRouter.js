import express from 'express'
import { completeMfaLogin } from './services/authenticationService.js'
import { paths, readJson, safeName } from './storage.js'

const PUBLIC_FIELD_TYPES = new Set(['Text', 'Email', 'Textarea', 'Phone', 'Select', 'Checkbox', 'Date', 'File'])
const PUBLIC_FIELD_LENGTH_CAPS = { Text: 500, Email: 320, Textarea: 5000, Phone: 40 }

function publicFieldConfiguration(field = {}) {
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
  }
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
      res.json(forms.filter(form => form.status === 'Active').map(form => ({
        id: String(form.id || ''),
        successMessage: String(form.successMessage || '').trim().slice(0, 500),
        fields: Array.isArray(form.fields) ? form.fields.map(publicFieldConfiguration) : [],
      })))
    } catch (error) {
      next(error)
    }
  })
  return router
}
