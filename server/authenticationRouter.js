import express from 'express'
import { completeMfaLogin } from './services/authenticationService.js'
import { paths, readJson, safeName } from './storage.js'

const PUBLIC_FIELD_TYPES = new Set(['Text', 'Email', 'Textarea', 'Phone', 'Select', 'Checkbox', 'Date', 'File'])

function publicFieldConfiguration(field = {}) {
  const options = Array.isArray(field.options)
    ? field.options.map(value => String(value || '').trim().slice(0, 120)).filter(Boolean).slice(0, 50)
    : []
  const minLength = Number(field.minLength)
  const maxLength = Number(field.maxLength)
  return {
    id: String(field.id || ''),
    label: String(field.label || ''),
    type: PUBLIC_FIELD_TYPES.has(field.type) ? field.type : 'Text',
    required: field.required === true,
    placeholder: String(field.placeholder || ''),
    helpText: String(field.helpText || '').trim().slice(0, 300),
    options,
    minLength: Number.isInteger(minLength) && minLength > 0 ? Math.min(minLength, 5000) : null,
    maxLength: Number.isInteger(maxLength) && maxLength > 0 ? Math.min(maxLength, 5000) : null,
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
