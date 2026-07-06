const FORM_KEY = 'ksjDigitalFormBuilder'

const starterForms = [
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

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback } catch { return fallback }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  return value
}

function key(websiteId = 'twotonetaj') {
  return `${FORM_KEY}:${websiteId}`
}

export function getForms(websiteId) {
  return read(key(websiteId), starterForms)
}

export function saveForms(websiteId, forms) {
  return write(key(websiteId), forms)
}

export function createForm(websiteId, name = 'New Form') {
  const forms = getForms(websiteId)
  const form = { id: `form-${Date.now()}`, name, status: 'Draft', destination: '', spamProtection: true, fields: [], submissions: [] }
  saveForms(websiteId, [form, ...forms])
  return form
}

export function updateForm(websiteId, formId, changes) {
  const forms = getForms(websiteId).map(form => form.id === formId ? { ...form, ...changes } : form)
  return saveForms(websiteId, forms)
}

export function deleteForm(websiteId, formId) {
  return saveForms(websiteId, getForms(websiteId).filter(form => form.id !== formId))
}

export function addField(websiteId, formId, type = 'Text') {
  const field = { id: `field-${Date.now()}`, label: `${type} Field`, type, required: false, placeholder: '' }
  const forms = getForms(websiteId).map(form => form.id === formId ? { ...form, fields: [...form.fields, field] } : form)
  saveForms(websiteId, forms)
  return field
}

export function updateField(websiteId, formId, fieldId, changes) {
  const forms = getForms(websiteId).map(form => form.id === formId ? { ...form, fields: form.fields.map(field => field.id === fieldId ? { ...field, ...changes } : field) } : form)
  return saveForms(websiteId, forms)
}

export function deleteField(websiteId, formId, fieldId) {
  const forms = getForms(websiteId).map(form => form.id === formId ? { ...form, fields: form.fields.filter(field => field.id !== fieldId) } : form)
  return saveForms(websiteId, forms)
}

export function moveField(websiteId, formId, fieldId, direction) {
  const forms = getForms(websiteId).map(form => {
    if (form.id !== formId) return form
    const fields = [...form.fields]
    const index = fields.findIndex(field => field.id === fieldId)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= fields.length) return form
    const [field] = fields.splice(index, 1)
    fields.splice(nextIndex, 0, field)
    return { ...form, fields }
  })
  return saveForms(websiteId, forms)
}

export function submitTestForm(websiteId, formId) {
  const forms = getForms(websiteId).map(form => form.id === formId ? { ...form, submissions: [{ id: `sub-${Date.now()}`, createdAt: new Date().toLocaleString(), status: 'New', source: 'Portal preview' }, ...(form.submissions || [])] } : form)
  return saveForms(websiteId, forms)
}
