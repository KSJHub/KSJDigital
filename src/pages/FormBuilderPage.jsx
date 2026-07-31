import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { api } from '../services/api.js'

const fieldTypes = ['Text', 'Email', 'Textarea', 'Phone', 'Select', 'Radio', 'Checkbox', 'Number', 'Date', 'File', 'Heading', 'Instructions', 'Divider']
const advancedFieldTypes = new Set(['Radio', 'Number', 'Heading', 'Instructions', 'Divider'])
const displayOnlyTypes = new Set(['Heading', 'Instructions', 'Divider'])
const submissionStatuses = ['New', 'Read', 'Resolved']
const submissionPageSizes = [10, 25, 50]
const lengthFieldTypes = new Set(['Text', 'Email', 'Textarea', 'Phone'])
const editHistoryLimit = 30
const autosaveDelayMs = 1200

const formTemplates = [
  {
    id: 'contact-form',
    name: 'Contact Form',
    description: 'A clean general-purpose contact form.',
    successMessage: 'Thanks — your message has been sent.',
    sections: [],
    fields: [
      { id: 'contact-heading', label: 'Contact Us', type: 'Text', displayType: 'Heading', content: 'Tell us how we can help and we will get back to you.', width: 'full' },
      { id: 'name', label: 'Name', type: 'Text', required: true, placeholder: 'Your name', width: 'half' },
      { id: 'email', label: 'Email', type: 'Email', required: true, placeholder: 'you@example.com', width: 'half' },
      { id: 'phone', label: 'Phone', type: 'Phone', required: false, placeholder: 'Optional phone number', width: 'full' },
      { id: 'message', label: 'Message', type: 'Textarea', required: true, placeholder: 'How can we help?', width: 'full' },
    ],
  },
  {
    id: 'support-request',
    name: 'Support Request',
    description: 'Support intake with category and priority.',
    successMessage: 'Thanks — your support request has been received.',
    sections: [],
    fields: [
      { id: 'support-heading', label: 'Support Request', type: 'Text', displayType: 'Heading', content: 'Give us the details below so the right person can help.', width: 'full' },
      { id: 'name', label: 'Name', type: 'Text', required: true, placeholder: 'Your name', width: 'half' },
      { id: 'email', label: 'Email', type: 'Email', required: true, placeholder: 'you@example.com', width: 'half' },
      { id: 'category', label: 'Support Category', type: 'Select', required: true, placeholder: 'Choose a category', options: ['Website', 'Hosting', 'Automation', 'Account', 'Billing', 'Other'], width: 'full' },
      { id: 'priority', label: 'Priority', type: 'Text', displayType: 'Radio', required: true, options: ['Normal', 'Urgent'], width: 'full' },
      { id: 'details', label: 'What do you need help with?', type: 'Textarea', required: true, placeholder: 'Describe the issue or request', width: 'full' },
    ],
  },
  {
    id: 'application-form',
    name: 'Application Form',
    description: 'Two-step application form with applicant details and questions.',
    successMessage: 'Thanks — your application has been submitted.',
    sections: [
      { id: 'applicant-details', title: 'Your Details', description: 'Tell us who you are.' },
      { id: 'application-details', title: 'Application', description: 'Tell us about your application.' },
    ],
    fields: [
      { id: 'name', label: 'Full Name', type: 'Text', required: true, placeholder: 'Your full name', width: 'half', sectionId: 'applicant-details' },
      { id: 'email', label: 'Email', type: 'Email', required: true, placeholder: 'you@example.com', width: 'half', sectionId: 'applicant-details' },
      { id: 'phone', label: 'Phone', type: 'Phone', required: false, placeholder: 'Optional phone number', width: 'full', sectionId: 'applicant-details' },
      { id: 'application-heading', label: 'Your Application', type: 'Text', displayType: 'Heading', content: 'Answer the questions below as clearly as you can.', width: 'full', sectionId: 'application-details' },
      { id: 'experience', label: 'Relevant Experience', type: 'Textarea', required: true, placeholder: 'Tell us about your relevant experience', width: 'full', sectionId: 'application-details' },
      { id: 'reason', label: 'Why are you applying?', type: 'Textarea', required: true, placeholder: 'Tell us why this is a good fit', width: 'full', sectionId: 'application-details' },
    ],
  },
  {
    id: 'project-enquiry',
    name: 'Project Enquiry',
    description: 'Two-step website, infrastructure and development enquiry.',
    successMessage: 'Thanks — your project enquiry has been sent.',
    sections: [
      { id: 'contact-details', title: 'Contact Details', description: 'How can we reach you?' },
      { id: 'project-details', title: 'Project Details', description: 'Tell us what you want to build.' },
    ],
    fields: [
      { id: 'name', label: 'Name', type: 'Text', required: true, placeholder: 'Your name', width: 'half', sectionId: 'contact-details' },
      { id: 'email', label: 'Email', type: 'Email', required: true, placeholder: 'you@example.com', width: 'half', sectionId: 'contact-details' },
      { id: 'company', label: 'Company / Brand', type: 'Text', required: false, placeholder: 'Optional', width: 'full', sectionId: 'contact-details' },
      { id: 'service', label: 'What do you need?', type: 'Select', required: true, placeholder: 'Choose a service', options: ['Website', 'Hosting & Infrastructure', 'Automation', 'Platform Development', 'Other'], width: 'full', sectionId: 'project-details' },
      { id: 'budget', label: 'Estimated Budget', type: 'Select', required: false, placeholder: 'Choose a range', options: ['Not sure yet', 'Under £1,000', '£1,000–£2,500', '£2,500–£5,000', '£5,000+'], width: 'half', sectionId: 'project-details' },
      { id: 'timeline', label: 'Target Timeline', type: 'Text', required: false, placeholder: 'e.g. 6–8 weeks', width: 'half', sectionId: 'project-details' },
      { id: 'project', label: 'Project Details', type: 'Textarea', required: true, placeholder: 'Describe what you want to build', width: 'full', sectionId: 'project-details' },
    ],
  },
]

const fieldGroups = [
  {
    id: 'contact-details',
    name: 'Contact Details',
    description: 'Name, email and phone.',
    fields: [
      { id: 'name', label: 'Name', type: 'Text', required: true, placeholder: 'Your name', width: 'half' },
      { id: 'email', label: 'Email', type: 'Email', required: true, placeholder: 'you@example.com', width: 'half' },
      { id: 'phone', label: 'Phone', type: 'Phone', required: false, placeholder: 'Optional phone number', width: 'full' },
    ],
  },
  {
    id: 'address',
    name: 'Address',
    description: 'Address line, town/city and postcode.',
    fields: [
      { id: 'address', label: 'Address', type: 'Text', required: true, placeholder: 'Street address', width: 'full' },
      { id: 'town-city', label: 'Town / City', type: 'Text', required: true, placeholder: 'Town or city', width: 'half' },
      { id: 'postcode', label: 'Postcode', type: 'Text', required: true, placeholder: 'Postcode', width: 'half' },
    ],
  },
  {
    id: 'enquiry-details',
    name: 'Enquiry Details',
    description: 'Subject and detailed message.',
    fields: [
      { id: 'subject', label: 'Subject', type: 'Text', required: true, placeholder: 'What is this about?', width: 'full' },
      { id: 'message', label: 'Message', type: 'Textarea', required: true, placeholder: 'Tell us more', width: 'full' },
    ],
  },
]

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function formConfigSnapshot(form = {}) {
  const { submissions: _submissions, revisions: _revisions, publishHistory: _publishHistory, publication: _publication, ...config } = form || {}
  return cloneValue(config) || {}
}

function applyFormConfig(form = {}, snapshot = {}) {
  const submissions = Array.isArray(form.submissions) ? form.submissions : []
  const revisions = Array.isArray(form.revisions) ? form.revisions : []
  const publishHistory = Array.isArray(form.publishHistory) ? form.publishHistory : []
  const publication = form.publication && typeof form.publication === 'object' ? form.publication : undefined
  return { ...form, ...cloneValue(snapshot), id: form.id, submissions, revisions, publishHistory, ...(publication ? { publication } : {}) }
}

function sameConfig(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {})
}

function summariseCollectionChanges(liveItems = [], draftItems = [], singular = 'item') {
  const live = new Map((Array.isArray(liveItems) ? liveItems : []).filter(item => item?.id).map(item => [item.id, item]))
  const draft = new Map((Array.isArray(draftItems) ? draftItems : []).filter(item => item?.id).map(item => [item.id, item]))
  const added = [...draft.keys()].filter(id => !live.has(id)).length
  const removed = [...live.keys()].filter(id => !draft.has(id)).length
  const changed = [...draft.keys()].filter(id => live.has(id) && !sameConfig(live.get(id), draft.get(id))).length
  const labels = []
  if (added) labels.push(`${added} ${singular}${added === 1 ? '' : 's'} added`)
  if (removed) labels.push(`${removed} ${singular}${removed === 1 ? '' : 's'} removed`)
  if (changed) labels.push(`${changed} ${singular}${changed === 1 ? '' : 's'} changed`)
  return labels
}

function draftVsLiveSummary(live = {}, draft = {}) {
  const changes = []
  if (live.name !== draft.name) changes.push('Name changed')
  if (live.destination !== draft.destination) changes.push('Email destination changed')
  if (live.spamProtection !== draft.spamProtection) changes.push('Spam protection changed')
  if (live.successMessage !== draft.successMessage) changes.push('Success message changed')
  changes.push(...summariseCollectionChanges(live.sections, draft.sections, 'section'))
  changes.push(...summariseCollectionChanges(live.fields, draft.fields, 'field'))
  return changes
}

function revisionTimestamp(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

function fieldKind(field = {}) {
  return advancedFieldTypes.has(field.displayType) ? field.displayType : field.type || 'Text'
}

function storesValue(field = {}) {
  return !displayOnlyTypes.has(fieldKind(field))
}

function recordId(value, fallback = 'copy') {
  const clean = String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return clean || fallback
}

function uniqueId(base, existingIds) {
  const initial = recordId(base)
  if (!existingIds.has(initial)) return initial
  let index = 2
  while (existingIds.has(`${initial}-${index}`)) index += 1
  return `${initial}-${index}`
}

function normaliseOptions(value) {
  return String(value || '').split(/\r?\n/).map(option => option.trim()).filter(Boolean).slice(0, 50)
}

function normaliseSections(form = {}) {
  const seen = new Set()
  return (Array.isArray(form.sections) ? form.sections : []).map((section, index) => {
    const id = recordId(section?.id || `step-${index + 1}`, `step-${index + 1}`)
    if (seen.has(id)) return null
    seen.add(id)
    return {
      id,
      title: String(section?.title || `Step ${index + 1}`).trim().slice(0, 120) || `Step ${index + 1}`,
      description: String(section?.description || '').trim().slice(0, 300),
    }
  }).filter(Boolean).slice(0, 20)
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

function validCondition(condition, earlierFields) {
  if (!condition?.fieldId) return null
  const source = earlierFields.find(field => field.id === condition.fieldId && fieldKind(field) !== 'File' && storesValue(field))
  if (!source) return null
  const sourceKind = fieldKind(source)
  if (sourceKind === 'Checkbox' && !['checked', 'unchecked'].includes(condition.operator)) return null
  if (sourceKind !== 'Checkbox' && !['equals', 'notEquals'].includes(condition.operator)) return null
  return {
    fieldId: source.id,
    operator: condition.operator,
    value: sourceKind === 'Checkbox' ? '' : String(condition.value || '').trim().slice(0, 120),
  }
}

function cleanFieldConditions(fields = []) {
  const earlier = []
  return fields.map(field => {
    const condition = validCondition(field.condition, earlier)
    const next = { ...field, condition }
    earlier.push(next)
    return next
  })
}

function visibleFields(fields = [], values = {}, enabled = true) {
  if (!enabled) return fields
  const visibleIds = new Set()
  return fields.filter(field => {
    const condition = field.condition
    const sourceVisible = !condition || visibleIds.has(condition.fieldId)
    const visible = sourceVisible && conditionMatches(condition, values)
    if (visible) visibleIds.add(field.id)
    return visible
  })
}

function fieldsForSection(fields = [], section, sections = []) {
  if (sections.length < 2) return fields
  const firstId = sections[0]?.id || ''
  return fields.filter(field => (field.sectionId || firstId) === section?.id)
}

function emptyPreviewValues(fields = []) {
  return Object.fromEntries(fields.filter(storesValue).map(field => [field.id, fieldKind(field) === 'Checkbox' ? false : '']))
}

function previewWidthClass(field) {
  return field.width === 'half' ? ' previewFieldHalf' : ' previewFieldFull'
}

function FieldPreview({ field, value, onChange }) {
  const kind = fieldKind(field)
  const help = field.helpText ? <small>{field.helpText}</small> : null
  const widthClass = previewWidthClass(field)
  if (kind === 'Heading') return <div className={`previewDisplayBlock previewHeading${widthClass}`}><h4>{field.label || 'Section heading'}</h4>{field.content && <p>{field.content}</p>}</div>
  if (kind === 'Instructions') return <div className={`previewDisplayBlock previewInstructions${widthClass}`}>{field.label && <b>{field.label}</b>}<p>{field.content || field.helpText || 'Add guidance for this part of the form.'}</p></div>
  if (kind === 'Divider') return <div className={`previewDisplayBlock previewDivider${widthClass}`}><span>{field.label}</span></div>
  if (kind === 'Checkbox') return <label className={`formCheck${widthClass}`}><input type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} /> {field.label}{help}</label>
  if (kind === 'Radio') return <fieldset className={`previewRadio${widthClass}`}><legend>{field.label}{field.required ? ' *' : ''}</legend>{(field.options || []).map(option => <label key={option}><input type="radio" name={`preview-${field.id}`} checked={value === option} onChange={() => onChange(option)} /> {option}</label>)}{help}</fieldset>
  if (kind === 'Select') return <label className={widthClass.trim()}><span>{field.label}{field.required ? ' *' : ''}</span><select value={value || ''} onChange={event => onChange(event.target.value)}><option value="">{field.placeholder || 'Choose an option'}</option>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select>{help}</label>
  if (kind === 'Textarea') return <label className={widthClass.trim()}><span>{field.label}{field.required ? ' *' : ''}</span><textarea value={value || ''} placeholder={field.placeholder} onChange={event => onChange(event.target.value)} />{help}</label>
  if (kind === 'File') return <label className={widthClass.trim()}><span>{field.label}{field.required ? ' *' : ''}</span><input type="file" disabled />{help}</label>
  const type = kind === 'Email' ? 'email' : kind === 'Date' ? 'date' : kind === 'Phone' ? 'tel' : kind === 'Number' ? 'number' : 'text'
  const numberProps = kind === 'Number' ? { min: field.min ?? undefined, max: field.max ?? undefined, step: field.step || 'any' } : {}
  return <label className={widthClass.trim()}><span>{field.label}{field.required ? ' *' : ''}</span><input type={type} value={value ?? ''} placeholder={field.placeholder} {...numberProps} onChange={event => onChange(event.target.value)} />{help}</label>
}

function submissionSummary(submission, fields = []) {
  if (!submission?.values || typeof submission.values !== 'object' || Array.isArray(submission.values)) return ''
  return fields.filter(field => storesValue(field) && fieldKind(field) !== 'File').map(field => {
    const value = submission.values[field.id]
    if (value === undefined || value === null || value === '') return ''
    const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value).slice(0, 100)
    return `${field.label || field.id}: ${display}`
  }).filter(Boolean).slice(0, 4).join(' · ')
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function deliveryClass(status = '') {
  return `deliveryStatus delivery${String(status).toLowerCase().replace(/[^a-z]+/g, '')}`
}

function attachmentSize(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function submissionSearchText(submission) {
  const values = submission?.values && typeof submission.values === 'object' ? Object.values(submission.values) : []
  const attachments = Array.isArray(submission?.attachments) ? submission.attachments.map(item => item.name) : []
  return [submission?.id, submission?.source, submission?.status, submission?.createdAt, ...values, ...attachments].filter(value => value !== undefined && value !== null).map(String).join(' ').toLowerCase()
}

export function FormBuilderPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const isOwner = account?.role === 'owner'
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('')
  const website = isOwner ? websites.find(site => site.id === selectedWebsiteId) || websites[0] || null : assignedWebsite
  const websiteId = website?.id
  const canEdit = isOwner || account?.canEdit
  const [forms, setForms] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('Loading')
  const [busyAction, setBusyAction] = useState('')
  const [deliveryStatuses, setDeliveryStatuses] = useState({})
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [emailReadiness, setEmailReadiness] = useState(null)
  const [emailReadinessLoading, setEmailReadinessLoading] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [emailTestState, setEmailTestState] = useState('')
  const [submissionQuery, setSubmissionQuery] = useState('')
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState('All')
  const [submissionSourceFilter, setSubmissionSourceFilter] = useState('All')
  const [submissionPage, setSubmissionPage] = useState(1)
  const [submissionPageSize, setSubmissionPageSize] = useState(10)
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState([])
  const [previewValues, setPreviewValues] = useState({})
  const [previewStepIndex, setPreviewStepIndex] = useState(0)
  const [previewVersion, setPreviewVersion] = useState('draft')
  const [savedConfigs, setSavedConfigs] = useState({})
  const [editHistory, setEditHistory] = useState({})
  const [draftDirty, setDraftDirty] = useState(false)
  const selected = forms.find(form => form.id === selectedId) || forms[0]
  const publication = selected?.publication || {}
  const liveConfig = publication.liveConfig && typeof publication.liveConfig === 'object' ? publication.liveConfig : null
  const isPublished = publication.isPublished === true
  const isArchived = !isPublished && selected?.status === 'Archived'
  const hasUnpublishedChanges = publication.hasUnpublishedChanges === true || draftDirty
  const previewingLive = previewVersion === 'live' && isPublished && liveConfig
  const previewForm = previewingLive ? { ...selected, ...liveConfig, id: selected?.id } : selected
  const fields = selected?.fields || []
  const sections = normaliseSections(selected)
  const previewSourceFields = previewForm?.fields || []
  const previewSourceSections = normaliseSections(previewForm)
  const submissionFields = fields.filter(storesValue)
  const busy = Boolean(busyAction)
  const hasFileFields = fields.some(field => fieldKind(field) === 'File')
  const hasAdvancedFields = fields.some(field => advancedFieldTypes.has(fieldKind(field)))
  const conditionalEnabled = !hasFileFields
  const previewConditionalEnabled = !previewSourceFields.some(field => fieldKind(field) === 'File')
  const previewVisibleFields = visibleFields(previewSourceFields, previewValues, previewConditionalEnabled)
  const steppedPreview = previewSourceSections.length > 1
  const safePreviewStepIndex = Math.min(previewStepIndex, Math.max(0, previewSourceSections.length - 1))
  const previewSection = steppedPreview ? previewSourceSections[safePreviewStepIndex] : null
  const previewFields = steppedPreview ? fieldsForSection(previewVisibleFields, previewSection, previewSourceSections) : previewVisibleFields
  const publicReady = isPublished
  const publishedAt = publication.publishedAt ? revisionTimestamp(publication.publishedAt) : ''
  const draftLiveChanges = isPublished && liveConfig ? draftVsLiveSummary(liveConfig, selected || {}) : []
  const allSubmissions = Array.isArray(selected?.submissions) ? selected.submissions : []
  const persistentRevisions = Array.isArray(selected?.revisions) ? selected.revisions : []
  const publishHistory = Array.isArray(selected?.publishHistory) ? selected.publishHistory : []
  const selectedHistory = editHistory[selected?.id] || { past: [], future: [] }
  const canUndoEdit = Boolean(selected?.id) && (draftDirty || selectedHistory.past.length > 0)
  const canRedoEdit = Boolean(selected?.id) && !draftDirty && selectedHistory.future.length > 0
  const submissionSources = useMemo(() => [...new Set(allSubmissions.map(item => item.source || 'Submission'))].sort(), [allSubmissions])
  const submissionStats = useMemo(() => ({
    total: allSubmissions.length,
    new: allSubmissions.filter(item => (item.status || 'New') === 'New').length,
    read: allSubmissions.filter(item => item.status === 'Read').length,
    resolved: allSubmissions.filter(item => item.status === 'Resolved').length,
    public: allSubmissions.filter(item => item.source === 'Public website').length,
  }), [allSubmissions])
  const filteredSubmissions = useMemo(() => {
    const query = submissionQuery.trim().toLowerCase()
    return allSubmissions.filter(submission => {
      const status = submissionStatuses.includes(submission.status) ? submission.status : 'New'
      const source = submission.source || 'Submission'
      if (submissionStatusFilter !== 'All' && status !== submissionStatusFilter) return false
      if (submissionSourceFilter !== 'All' && source !== submissionSourceFilter) return false
      return !query || submissionSearchText(submission).includes(query)
    })
  }, [allSubmissions, submissionQuery, submissionStatusFilter, submissionSourceFilter])
  const submissionPageCount = Math.max(1, Math.ceil(filteredSubmissions.length / submissionPageSize))
  const currentSubmissionPage = Math.min(submissionPage, submissionPageCount)
  const pagedSubmissions = filteredSubmissions.slice((currentSubmissionPage - 1) * submissionPageSize, currentSubmissionPage * submissionPageSize)
  const selectedSubmissionSet = useMemo(() => new Set(selectedSubmissionIds), [selectedSubmissionIds])
  const selectedSubmissions = allSubmissions.filter(item => selectedSubmissionSet.has(item.id))
  const visibleSubmissionIds = pagedSubmissions.map(item => item.id).filter(Boolean)
  const allVisibleSelected = visibleSubmissionIds.length > 0 && visibleSubmissionIds.every(id => selectedSubmissionSet.has(id))

  useEffect(() => { if (isOwner && !selectedWebsiteId && websites[0]?.id) setSelectedWebsiteId(websites[0].id) }, [isOwner, selectedWebsiteId, websites])

  async function loadForms(nextId = selectedId, message = canEdit ? 'Ready' : 'Preview only') {
    if (!websiteId) {
      setForms([]); setSelectedId(''); setDeliveryStatuses({}); setSavedConfigs({}); setNotice('Waiting for assigned website'); return
    }
    try {
      const next = await api.getForms(websiteId)
      const normalised = Array.isArray(next) ? next : []
      setForms(normalised)
      setSavedConfigs(Object.fromEntries(normalised.filter(form => form?.id).map(form => [form.id, formConfigSnapshot(form)])))
      setSelectedId(normalised.find(form => form.id === nextId)?.id || normalised[0]?.id || '')
      setNotice(message)
    } catch (error) {
      setForms([]); setSelectedId(''); setDeliveryStatuses({}); setSavedConfigs({}); setNotice(error.message || 'Forms unavailable')
    }
  }

  async function loadDeliveryStatuses(formId = selected?.id) {
    if (!websiteId || !formId) return setDeliveryStatuses({})
    setDeliveryLoading(true)
    try {
      const result = await api.getFormDeliveryStatuses(websiteId, formId)
      setDeliveryStatuses(result?.statuses && typeof result.statuses === 'object' ? result.statuses : {})
    } catch { setDeliveryStatuses({}) } finally { setDeliveryLoading(false) }
  }

  async function loadEmailReadiness() {
    if (!isOwner) return setEmailReadiness(null)
    setEmailReadinessLoading(true)
    try { setEmailReadiness(await api.getEmailReadiness()) } catch { setEmailReadiness(null) } finally { setEmailReadinessLoading(false) }
  }

  useEffect(() => { setBusyAction(''); setEditHistory({}); setSavedConfigs({}); setDraftDirty(false); loadForms('', canEdit ? 'Ready' : 'Preview only') }, [canEdit, websiteId])
  useEffect(() => {
    loadDeliveryStatuses(selected?.id)
    setSubmissionQuery(''); setSubmissionStatusFilter('All'); setSubmissionSourceFilter('All'); setSubmissionPage(1); setSelectedSubmissionIds([])
    setPreviewVersion('draft'); setPreviewValues(emptyPreviewValues(selected?.fields || [])); setPreviewStepIndex(0); setDraftDirty(false)
  }, [websiteId, selected?.id])
  useEffect(() => { loadEmailReadiness() }, [isOwner])
  useEffect(() => { if (isOwner) { setTestEmail(selected?.destination || emailReadiness?.from || ''); setEmailTestState('') } }, [isOwner, selected?.id, emailReadiness?.from])
  useEffect(() => { setSubmissionPage(1) }, [submissionQuery, submissionStatusFilter, submissionSourceFilter, submissionPageSize])
  useEffect(() => { if (submissionPage > submissionPageCount) setSubmissionPage(submissionPageCount) }, [submissionPage, submissionPageCount])
  useEffect(() => { if (previewStepIndex >= previewSourceSections.length && previewSourceSections.length) setPreviewStepIndex(previewSourceSections.length - 1) }, [previewStepIndex, previewSourceSections.length])
  useEffect(() => { setPreviewValues(emptyPreviewValues(previewSourceFields)); setPreviewStepIndex(0) }, [previewVersion, selected?.id])
  useEffect(() => {
    const existing = new Set(allSubmissions.map(item => item.id))
    setSelectedSubmissionIds(current => current.filter(id => existing.has(id)))
  }, [allSubmissions])
  useEffect(() => {
    if (!draftDirty || !canEdit || !websiteId || !selected?.id || busy) return undefined
    const formId = selected.id
    const timer = globalThis.setTimeout(() => {
      saveFormsConfiguration(forms, formId, 'Autosaving')
    }, autosaveDelayMs)
    return () => globalThis.clearTimeout(timer)
  }, [draftDirty, canEdit, websiteId, selected?.id, busy, forms])

  function updateSelectedLocal(changes) {
    if (selected?.id) {
      setForms(current => current.map(form => form.id === selected.id ? { ...form, ...changes } : form))
      setDraftDirty(true)
    }
  }

  function updateFieldLocal(fieldId, changes) {
    if (!selected?.id) return
    setForms(current => current.map(form => form.id === selected.id ? { ...form, fields: (form.fields || []).map(field => field.id === fieldId ? { ...field, ...changes } : field) } : form))
    setDraftDirty(true)
  }

  function recordConfigChange(formId, previousSnapshot, nextForm) {
    if (!formId || !nextForm) return
    const nextSnapshot = formConfigSnapshot(nextForm)
    if (previousSnapshot && !sameConfig(previousSnapshot, nextSnapshot)) {
      setEditHistory(current => {
        const history = current[formId] || { past: [], future: [] }
        return { ...current, [formId]: { past: [...history.past, cloneValue(previousSnapshot)].slice(-editHistoryLimit), future: [] } }
      })
    }
    setSavedConfigs(current => ({ ...current, [formId]: nextSnapshot }))
  }

  async function undoEdit() {
    if (!canEdit || !selected?.id || busy) return
    const formId = selected.id
    if (draftDirty) {
      const baseline = savedConfigs[formId]
      if (baseline) setForms(current => current.map(form => form.id === formId ? applyFormConfig(form, baseline) : form))
      setDraftDirty(false)
      setNotice('Unsaved draft changes reverted')
      return
    }
    const history = editHistory[formId] || { past: [], future: [] }
    const target = history.past[history.past.length - 1]
    if (!target) return
    const currentSnapshot = savedConfigs[formId] || formConfigSnapshot(selected)
    const nextForms = forms.map(form => form.id === formId ? applyFormConfig(form, target) : form)
    setBusyAction('history'); setNotice('Restoring previous form version')
    try {
      await api.saveForms(websiteId, nextForms)
      setEditHistory(current => {
        const latest = current[formId] || { past: [], future: [] }
        return { ...current, [formId]: { past: latest.past.slice(0, -1), future: [cloneValue(currentSnapshot), ...latest.future].slice(0, editHistoryLimit) } }
      })
      setSavedConfigs(current => ({ ...current, [formId]: cloneValue(target) }))
      setDraftDirty(false)
      await loadForms(formId, 'Previous form version restored')
    } catch (error) { setNotice(error.message || 'Undo failed') } finally { setBusyAction('') }
  }

  async function redoEdit() {
    if (!canEdit || !selected?.id || busy || draftDirty) return
    const formId = selected.id
    const history = editHistory[formId] || { past: [], future: [] }
    const target = history.future[0]
    if (!target) return
    const currentSnapshot = savedConfigs[formId] || formConfigSnapshot(selected)
    const nextForms = forms.map(form => form.id === formId ? applyFormConfig(form, target) : form)
    setBusyAction('history'); setNotice('Restoring next form version')
    try {
      await api.saveForms(websiteId, nextForms)
      setEditHistory(current => {
        const latest = current[formId] || { past: [], future: [] }
        return { ...current, [formId]: { past: [...latest.past, cloneValue(currentSnapshot)].slice(-editHistoryLimit), future: latest.future.slice(1) } }
      })
      setSavedConfigs(current => ({ ...current, [formId]: cloneValue(target) }))
      setDraftDirty(false)
      await loadForms(formId, 'Next form version restored')
    } catch (error) { setNotice(error.message || 'Redo failed') } finally { setBusyAction('') }
  }

  async function createRestorePoint() {
    if (!canEdit || !websiteId || !selected?.id || busy) return
    if (draftDirty) {
      const saved = await saveFormsConfiguration(forms, selected.id, 'Saving before restore point')
      if (!saved) return
    }
    setBusyAction('restore-point'); setNotice('Creating restore point')
    try {
      const next = await api.createFormRestorePoint(websiteId, selected.id, 'Manual restore point')
      setForms(next)
      setSavedConfigs(current => ({ ...current, [selected.id]: formConfigSnapshot(next.find(form => form.id === selected.id) || selected) }))
      setNotice('Restore point created')
    } catch (error) { setNotice(error.message || 'Restore point failed') }
    finally { setBusyAction('') }
  }

  async function restorePersistentRevision(revision) {
    if (!canEdit || !websiteId || !selected?.id || !revision?.id || busy) return
    const when = revisionTimestamp(revision.createdAt)
    if (!globalThis.confirm(`Restore “${revision.label || 'this revision'}” from ${when}? Your current configuration will be saved as a new revision first. Stored submissions will not be changed.`)) return
    setBusyAction(`restore-${revision.id}`); setNotice('Restoring saved revision')
    try {
      await api.restoreFormRevision(websiteId, selected.id, revision.id)
      setEditHistory(current => ({ ...current, [selected.id]: { past: [], future: [] } }))
      setDraftDirty(false)
      await loadForms(selected.id, 'Saved revision restored')
    } catch (error) { setNotice(error.message || 'Revision restore failed') }
    finally { setBusyAction('') }
  }

  async function saveFormsConfiguration(nextForms, nextId, message) {
    if (!canEdit || !websiteId || busy) return false
    const previousSnapshot = savedConfigs[nextId] || null
    setBusyAction('save-configuration'); setNotice(message)
    try {
      await api.saveForms(websiteId, nextForms, message === 'Autosaving' ? 'Autosaved form changes' : message)
      const savedForm = nextForms.find(form => form.id === nextId)
      if (savedForm) recordConfigChange(nextId, previousSnapshot, savedForm)
      setDraftDirty(false)
      await loadForms(nextId, message === 'Autosaving' ? 'Autosaved' : message.replace(/ing$/, 'ed'))
      return true
    } catch (error) {
      setNotice(error.message || 'Configuration save failed')
      await loadForms(nextId, error.message || 'Configuration save failed')
      return false
    } finally { setBusyAction('') }
  }

  async function saveFormConfiguration(changes) {
    if (!selected?.id) return false
    return saveFormsConfiguration(forms.map(form => form.id === selected.id ? { ...form, ...changes } : form), selected.id, 'Saving form configuration')
  }

  async function saveFieldConfiguration(fieldId, changes) {
    if (!selected?.id || !fieldId) return false
    const nextForms = forms.map(form => form.id === selected.id ? { ...form, fields: cleanFieldConditions((form.fields || []).map(field => field.id === fieldId ? { ...field, ...changes } : field)) } : form)
    return saveFormsConfiguration(nextForms, selected.id, 'Saving field configuration')
  }

  async function createFromTemplate(template) {
    if (!canEdit || !websiteId || busy || !template) return
    const id = uniqueId(template.id || template.name, new Set(forms.map(form => form.id)))
    const nextForm = {
      id,
      name: template.name,
      status: 'Draft',
      destination: selected?.destination || '',
      spamProtection: true,
      successMessage: template.successMessage || '',
      sections: (template.sections || []).map(section => ({ ...section })),
      fields: (template.fields || []).map(field => ({ ...field })),
      submissions: [],
    }
    if (await saveFormsConfiguration([...forms, nextForm], id, `Creating ${template.name}`)) setSelectedId(id)
  }

  async function insertFieldGroup(group) {
    if (!canEdit || !selected?.id || busy || !group) return
    const existingIds = new Set(fields.map(field => field.id))
    const defaultSectionId = sections.length > 1 ? sections[Math.min(previewStepIndex, sections.length - 1)]?.id || sections[0]?.id : ''
    const inserted = (group.fields || []).map(source => {
      const id = uniqueId(source.id || source.label || 'field', existingIds)
      existingIds.add(id)
      return { ...source, id, ...(defaultSectionId ? { sectionId: defaultSectionId } : {}) }
    })
    const nextFields = cleanFieldConditions([...fields, ...inserted])
    await saveFormsConfiguration(forms.map(form => form.id === selected.id ? { ...form, fields: nextFields } : form), selected.id, `Inserting ${group.name} group`)
  }

  async function addSection() {
    if (!selected?.id || busy || sections.length >= 20) return
    const existing = new Set(sections.map(section => section.id))
    const id = uniqueId(`step-${sections.length + 1}`, existing)
    const nextSections = [...sections, { id, title: `Step ${sections.length + 1}`, description: '' }]
    await saveFormConfiguration({ sections: nextSections })
  }

  async function updateSection(sectionId, changes) {
    const nextSections = sections.map(section => section.id === sectionId ? { ...section, ...changes } : section)
    await saveFormConfiguration({ sections: nextSections })
  }

  async function removeSection(sectionId) {
    if (sections.length <= 1 || busy) return
    const nextSections = sections.filter(section => section.id !== sectionId)
    const fallbackId = nextSections[0]?.id || ''
    const nextFields = fields.map(field => field.sectionId === sectionId ? { ...field, sectionId: fallbackId } : field)
    await saveFormsConfiguration(forms.map(form => form.id === selected.id ? { ...form, sections: nextSections, fields: nextFields } : form), selected.id, 'Removing section')
  }

  async function moveSection(sectionId, direction) {
    if (busy) return
    const index = sections.findIndex(section => section.id === sectionId)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= sections.length) return
    const nextSections = [...sections]
    ;[nextSections[index], nextSections[target]] = [nextSections[target], nextSections[index]]
    await saveFormConfiguration({ sections: nextSections })
  }

  async function setFieldCondition(field, index, fieldId) {
    if (!fieldId) return saveFieldConfiguration(field.id, { condition: null })
    const source = fields.slice(0, index).find(item => item.id === fieldId)
    const sourceKind = fieldKind(source)
    if (!source || sourceKind === 'File' || !storesValue(source)) return
    const condition = sourceKind === 'Checkbox' ? { fieldId, operator: 'checked', value: '' } : { fieldId, operator: 'equals', value: ['Select', 'Radio'].includes(sourceKind) ? source.options?.[0] || '' : '' }
    await saveFieldConfiguration(field.id, { condition })
  }

  async function updateFieldCondition(field, changes) {
    await saveFieldConfiguration(field.id, { condition: { ...(field.condition || {}), ...changes } })
  }

  async function duplicateForm() {
    if (!canEdit || !selected?.id || busy) return
    const id = uniqueId(`${selected.id || selected.name}-copy`, new Set(forms.map(form => form.id)))
    const duplicate = { ...selected, id, name: `${selected.name || 'Form'} Copy`, status: 'Draft', sections: sections.map(section => ({ ...section })), fields: fields.map(field => ({ ...field })), submissions: [], revisions: [], publishHistory: [], publication: undefined }
    if (await saveFormsConfiguration([...forms, duplicate], id, 'Duplicating form')) setSelectedId(id)
  }

  async function duplicateField(field) {
    if (!canEdit || !selected?.id || !field?.id || busy) return
    const id = uniqueId(`${field.id || field.label}-copy`, new Set(fields.map(item => item.id)))
    const index = fields.findIndex(item => item.id === field.id)
    const nextFields = [...fields]
    nextFields.splice(index + 1, 0, { ...field, id, label: `${field.label || fieldKind(field)} Copy` })
    await saveFormsConfiguration(forms.map(form => form.id === selected.id ? { ...form, fields: cleanFieldConditions(nextFields) } : form), selected.id, 'Duplicating field')
  }

  async function sendEmailTest() {
    if (!isOwner || busy) return
    const recipient = testEmail.trim()
    if (!recipient) return setNotice('Enter a test recipient email')
    if (!emailReadiness?.configured) return setNotice('Email delivery is not configured')
    setBusyAction('email-test'); setEmailTestState('Queuing test email…'); setNotice('Queuing email test')
    try { const result = await api.sendEmailTest(recipient); setEmailTestState(`Test ${result?.jobs?.[0]?.status || 'queued'}`); setNotice('Email test queued') }
    catch (error) { setEmailTestState(error.message || 'Email test failed'); setNotice(error.message || 'Email test failed') }
    finally { setBusyAction('') }
  }

  async function addForm() {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || busy) return
    setBusyAction('create-form'); setNotice('Creating form')
    try { const result = await api.createForm(websiteId, { name: 'New Form' }); setForms(result.forms); setSavedConfigs(current => ({ ...current, [result.form.id]: formConfigSnapshot(result.form) })); setSelectedId(result.form.id); setNotice('Form created') }
    catch (error) { setNotice(error.message || 'Create failed') } finally { setBusyAction('') }
  }

  async function saveForm(changes) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || busy) return false
    const formId = selected.id
    const previousSnapshot = savedConfigs[formId] || formConfigSnapshot(selected)
    setBusyAction('save-form'); setNotice('Saving form')
    try {
      const next = await api.updateForm(websiteId, formId, changes)
      const savedForm = next.find(form => form.id === formId)
      if (savedForm) recordConfigChange(formId, previousSnapshot, savedForm)
      setForms(next); setSelectedId(formId); setDraftDirty(false); setNotice('Form saved'); return true
    }
    catch (error) { setNotice(error.message || 'Save failed'); await loadForms(formId, error.message || 'Save failed'); return false }
    finally { setBusyAction('') }
  }

  async function changeLifecycle(nextStatus) {
    if (!canEdit || !websiteId || !selected?.id || busy || !['Draft', 'Archived'].includes(nextStatus)) return
    const formName = selected.name || 'this form'
    if (nextStatus === 'Archived') {
      const warning = isPublished
        ? `Archive “${formName}”? This will remove the currently live form from the public website. Stored submissions and revision history will be preserved.`
        : `Archive “${formName}”? It will remain stored but unavailable for publishing until restored to Draft.`
      if (!globalThis.confirm(warning)) return
    }
    setBusyAction('lifecycle'); setNotice(nextStatus === 'Archived' ? 'Archiving form' : 'Restoring form to draft')
    try {
      const next = await api.updateForm(websiteId, selected.id, { status: nextStatus })
      setForms(next)
      setSelectedId(selected.id)
      setDraftDirty(false)
      setEditHistory(current => ({ ...current, [selected.id]: { past: [], future: [] } }))
      const updated = next.find(form => form.id === selected.id)
      if (updated) setSavedConfigs(current => ({ ...current, [selected.id]: formConfigSnapshot(updated) }))
      setNotice(nextStatus === 'Archived' ? 'Form archived' : 'Form restored to draft')
    } catch (error) {
      setNotice(error.message || 'Lifecycle update failed')
      await loadForms(selected.id, error.message || 'Lifecycle update failed')
    } finally { setBusyAction('') }
  }

  async function publishChanges() {
    if (!canEdit || !websiteId || !selected?.id || busy || isArchived) return
    const formId = selected.id
    if (draftDirty) {
      const saved = await saveFormsConfiguration(forms, formId, 'Saving draft before publish')
      if (!saved) return
    }
    const reviewChanges = isPublished && liveConfig ? draftVsLiveSummary(liveConfig, selected || {}) : []
    const reviewMessage = isPublished
      ? `Publish changes to “${selected.name || 'this form'}”?\n\nChanges going live:\n${reviewChanges.length ? `• ${reviewChanges.join('\n• ')}` : '• Saved draft configuration changes'}\n\nThe public form will update immediately after confirmation.`
      : `Publish “${selected.name || 'this form'}” and make it available on the public website?\n\nPre-publish review:\n• ${fields.length} field${fields.length === 1 ? '' : 's'}\n• ${sections.length > 1 ? `${sections.length} sections / steps` : 'Single-page form'}\n• Email destination: ${selected.destination || 'Not configured'}\n• Spam protection: ${selected.spamProtection !== false ? 'Enabled' : 'Disabled'}\n\nThe form will become available publicly immediately after confirmation.`
    if (!globalThis.confirm(reviewMessage)) return
    setBusyAction('publish-form'); setNotice(isPublished ? 'Publishing changes' : 'Publishing form')
    try {
      const next = await api.publishForm(websiteId, formId)
      setForms(next)
      setSelectedId(formId)
      setDraftDirty(false)
      setEditHistory(current => ({ ...current, [formId]: { past: [], future: [] } }))
      const published = next.find(form => form.id === formId)
      if (published) setSavedConfigs(current => ({ ...current, [formId]: formConfigSnapshot(published) }))
      setNotice(isPublished ? 'Changes published' : 'Form published')
    } catch (error) {
      setNotice(error.message || 'Publish failed')
      await loadForms(formId, error.message || 'Publish failed')
    } finally { setBusyAction('') }
  }

  async function discardDraft() {
    if (!canEdit || !websiteId || !selected?.id || !isPublished || !hasUnpublishedChanges || busy) return
    const formId = selected.id
    const formName = selected.name || 'this form'
    if (!globalThis.confirm(`Discard all unpublished changes to “${formName}” and return the editor to the current live version? The public form and stored submissions will not change. The discarded saved draft will remain recoverable in Revision History.`)) return
    if (draftDirty) {
      const saved = await saveFormsConfiguration(forms, formId, 'Saving draft before discard')
      if (!saved) return
    }
    setBusyAction('discard-draft'); setNotice('Discarding draft changes')
    try {
      const next = await api.discardFormDraft(websiteId, formId)
      setForms(next)
      setSelectedId(formId)
      setDraftDirty(false)
      setEditHistory(current => ({ ...current, [formId]: { past: [], future: [] } }))
      const live = next.find(form => form.id === formId)
      if (live) setSavedConfigs(current => ({ ...current, [formId]: formConfigSnapshot(live) }))
      setNotice('Draft discarded · live version restored')
    } catch (error) {
      setNotice(error.message || 'Discard draft failed')
      await loadForms(formId, error.message || 'Discard draft failed')
    } finally { setBusyAction('') }
  }

  async function rollbackPublishedVersion(release) {
    if (!canEdit || !websiteId || !selected?.id || !isPublished || !release?.id || busy) return
    const releaseTime = revisionTimestamp(release.publishedAt)
    const draftNote = hasUnpublishedChanges ? '\n\nYour current unpublished Draft will be preserved.' : ''
    if (!globalThis.confirm(`Roll the Live version of “${selected.name || 'this form'}” back to the release from ${releaseTime}? Visitors will receive that version immediately after confirmation. Stored submissions and Revision History will not be changed.${draftNote}`)) return
    setBusyAction(`rollback-publish-${release.id}`); setNotice('Rolling back live form')
    try {
      const next = await api.rollbackFormPublish(websiteId, selected.id, release.id)
      setForms(next)
      setSelectedId(selected.id)
      setPreviewVersion('live')
      setDraftDirty(false)
      setEditHistory(current => ({ ...current, [selected.id]: { past: [], future: [] } }))
      const updated = next.find(form => form.id === selected.id)
      if (updated) setSavedConfigs(current => ({ ...current, [selected.id]: formConfigSnapshot(updated) }))
      setNotice('Live version rolled back')
    } catch (error) {
      setNotice(error.message || 'Publish rollback failed')
      await loadForms(selected.id, error.message || 'Publish rollback failed')
    } finally { setBusyAction('') }
  }

  async function removeForm() {
    if (!canEdit || !websiteId || !selected?.id || busy) return
    if (!globalThis.confirm(`Delete “${selected.name || 'this form'}”? Its configured fields and stored submissions will be removed. This action cannot be undone.`)) return
    const removedId = selected.id
    setBusyAction('delete-form'); setNotice('Deleting form')
    try {
      const next = await api.deleteForm(websiteId, removedId)
      setForms(next); setSelectedId(next[0]?.id || ''); setDeliveryStatuses({}); setDraftDirty(false)
      setSavedConfigs(current => { const updated = { ...current }; delete updated[removedId]; return updated })
      setEditHistory(current => { const updated = { ...current }; delete updated[removedId]; return updated })
      setNotice('Form deleted')
    }
    catch (error) { setNotice(error.message || 'Delete failed') } finally { setBusyAction('') }
  }

  async function addNewField(type) {
    if (!canEdit || !websiteId || !selected?.id || busy) return
    if (type === 'File' && hasAdvancedFields) return setNotice('File fields cannot be combined with advanced fields yet')
    if (advancedFieldTypes.has(type) && hasFileFields) return setNotice('Advanced fields cannot be combined with File fields yet')
    if (advancedFieldTypes.has(type)) {
      const id = uniqueId(type.toLowerCase(), new Set(fields.map(field => field.id)))
      const labels = { Radio: 'Choose an option', Number: 'Number', Heading: 'Section Heading', Instructions: 'Instructions', Divider: 'Divider' }
      const nextField = {
        id,
        label: labels[type],
        type: 'Text',
        displayType: type,
        required: false,
        placeholder: '',
        helpText: '',
        width: 'full',
        ...(sections.length > 1 ? { sectionId: sections[0].id } : {}),
        ...(type === 'Radio' ? { options: ['Option One', 'Option Two'] } : {}),
        ...(type === 'Instructions' ? { content: 'Add guidance for this part of the form.' } : {}),
      }
      return saveFormsConfiguration(forms.map(form => form.id === selected.id ? { ...form, fields: [...(form.fields || []), nextField] } : form), selected.id, `Adding ${type} field`)
    }
    const previousSnapshot = savedConfigs[selected.id] || formConfigSnapshot(selected)
    setBusyAction('add-field'); setNotice('Adding field')
    try {
      const next = await api.addField(websiteId, selected.id, { type })
      const assigned = next.map(form => form.id === selected.id ? { ...form, fields: (form.fields || []).map((field, index) => index === (form.fields || []).length - 1 ? { ...field, width: field.width || 'full', ...(sections.length > 1 && !field.sectionId ? { sectionId: sections[0].id } : {}) } : field) } : form)
      await api.saveForms(websiteId, assigned, `Added ${type} field layout`)
      const savedForm = assigned.find(form => form.id === selected.id)
      if (savedForm) recordConfigChange(selected.id, previousSnapshot, savedForm)
      setForms(assigned); setSelectedId(selected.id); setDraftDirty(false); setNotice(`${type} field added`)
    } catch (error) { setNotice(error.message || 'Add field failed') } finally { setBusyAction('') }
  }

  async function editField(fieldId, changes) {
    if (!canEdit || !websiteId || !selected?.id || busy) return false
    const formId = selected.id
    const previousSnapshot = savedConfigs[formId] || formConfigSnapshot(selected)
    setBusyAction(`field-${fieldId}`); setNotice('Saving field')
    try {
      const next = await api.updateField(websiteId, formId, fieldId, changes)
      const savedForm = next.find(form => form.id === formId)
      if (savedForm) recordConfigChange(formId, previousSnapshot, savedForm)
      setForms(next); setSelectedId(formId); setDraftDirty(false); setNotice('Field updated'); return true
    }
    catch (error) { setNotice(error.message || 'Field save failed'); await loadForms(formId, error.message || 'Field save failed'); return false }
    finally { setBusyAction('') }
  }

  async function removeField(field) {
    if (!canEdit || !selected?.id || !field?.id || busy) return
    if (!globalThis.confirm(`Remove “${field.label || 'this field'}” from ${selected.name || 'this form'}?`)) return
    const nextFields = cleanFieldConditions(fields.filter(item => item.id !== field.id).map(item => item.condition?.fieldId === field.id ? { ...item, condition: null } : item))
    await saveFormsConfiguration(forms.map(form => form.id === selected.id ? { ...form, fields: nextFields } : form), selected.id, 'Removing field')
  }

  async function shiftField(fieldId, direction) {
    if (!canEdit || !selected?.id || busy) return
    const index = fields.findIndex(field => field.id === fieldId)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= fields.length) return
    const nextFields = [...fields]
    ;[nextFields[index], nextFields[target]] = [nextFields[target], nextFields[index]]
    await saveFormsConfiguration(forms.map(form => form.id === selected.id ? { ...form, fields: cleanFieldConditions(nextFields) } : form), selected.id, 'Moving field')
  }

  async function addTestSubmission() {
    if (!canEdit || !websiteId || !selected?.id || busy) return
    setBusyAction('test'); setNotice('Adding portal test submission')
    try { const next = await api.submitTestForm(websiteId, selected.id); setForms(next); setSelectedId(selected.id); setNotice('Portal test submission added'); await loadDeliveryStatuses(selected.id) }
    catch (error) { setNotice(error.message || 'Test failed') } finally { setBusyAction('') }
  }

  async function saveSubmissionChanges(submissionId, updater, message) {
    if (!canEdit || !websiteId || !selected?.id || !submissionId || busy) return
    setBusyAction(`submission-${submissionId}`); setNotice(message)
    const nextForms = forms.map(form => form.id === selected.id ? { ...form, submissions: updater(Array.isArray(form.submissions) ? form.submissions : []) } : form)
    try { await api.saveForms(websiteId, nextForms, message); await loadForms(selected.id, message.replace(/ing$/, 'ed')); await loadDeliveryStatuses(selected.id) }
    catch (error) { setNotice(error.message || 'Submission update failed'); await loadForms(selected.id, error.message || 'Submission update failed') }
    finally { setBusyAction('') }
  }

  async function saveBulkSubmissionChanges(updater, message) {
    if (!canEdit || !websiteId || !selected?.id || !selectedSubmissionIds.length || busy) return
    setBusyAction('bulk-submissions'); setNotice(message)
    const nextForms = forms.map(form => form.id === selected.id ? { ...form, submissions: updater(Array.isArray(form.submissions) ? form.submissions : []) } : form)
    try { await api.saveForms(websiteId, nextForms, message); setSelectedSubmissionIds([]); await loadForms(selected.id, message.replace(/ing$/, 'ed')); await loadDeliveryStatuses(selected.id) }
    catch (error) { setNotice(error.message || 'Bulk submission update failed'); await loadForms(selected.id, error.message || 'Bulk submission update failed') }
    finally { setBusyAction('') }
  }

  async function updateSubmissionStatus(submission, status) {
    if (submissionStatuses.includes(status) && submission.status !== status) await saveSubmissionChanges(submission.id, submissions => submissions.map(item => item.id === submission.id ? { ...item, status } : item), 'Updating submission')
  }

  async function removeSubmission(submission) {
    if (!submission?.id || busy || !globalThis.confirm(`Delete this ${submission.source || 'form'} submission permanently? This action cannot be undone.`)) return
    await saveSubmissionChanges(submission.id, submissions => submissions.filter(item => item.id !== submission.id), 'Deleting submission')
  }

  async function updateSelectedSubmissionStatus(status) {
    if (!submissionStatuses.includes(status) || !selectedSubmissionIds.length) return
    const ids = new Set(selectedSubmissionIds)
    await saveBulkSubmissionChanges(submissions => submissions.map(item => ids.has(item.id) ? { ...item, status } : item), `Updating ${ids.size} submissions`)
  }

  async function removeSelectedSubmissions() {
    if (!selectedSubmissionIds.length || busy) return
    const count = selectedSubmissionIds.length
    if (!globalThis.confirm(`Delete ${count} selected submission${count === 1 ? '' : 's'} permanently? Stored attachments for deleted submissions will also be removed. This action cannot be undone.`)) return
    const ids = new Set(selectedSubmissionIds)
    await saveBulkSubmissionChanges(submissions => submissions.filter(item => !ids.has(item.id)), `Deleting ${count} submissions`)
  }

  function toggleSubmissionSelection(id) { setSelectedSubmissionIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }
  function toggleVisibleSubmissions() {
    setSelectedSubmissionIds(current => {
      const next = new Set(current)
      if (allVisibleSelected) visibleSubmissionIds.forEach(id => next.delete(id)); else visibleSubmissionIds.forEach(id => next.add(id))
      return [...next]
    })
  }

  function exportSubmissions(records = filteredSubmissions, label = 'filtered') {
    if (!selected?.id || !records.length) return setNotice('No submissions to export')
    const header = ['Submission ID', 'Created At', 'Status', 'Source', 'Email Delivery', 'Attachments', ...submissionFields.map(field => field.label || field.id)]
    const rows = records.map(submission => [submission.id, submission.createdAt, submission.status || 'New', submission.source || 'Submission', deliveryStatuses[submission.id]?.status || (submission.source === 'Public website' ? 'Unknown' : 'Not applicable'), (submission.attachments || []).map(attachment => attachment.name).join(' | '), ...submissionFields.map(field => submission.values?.[field.id] ?? '')])
    const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `${websiteId}-${selected.id}-${label}-submissions.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    setNotice(`${records.length} submission${records.length === 1 ? '' : 's'} exported`)
  }

  return (
    <Layout client={client} title="Forms">
      <section className="moduleHero card"><div><span>Form Builder</span><h2>{website?.name || 'Assigned Website'} Forms</h2><p>{canEdit ? 'Create contact, support, application and custom forms.' : 'View the forms currently configured for this website.'}</p></div><button type="button" disabled aria-live="polite">{notice}</button></section>

      {isOwner && websites.length > 1 && <section className="card formSettings"><label>Website<select value={websiteId || ''} disabled={busy} onChange={event => { setSelectedWebsiteId(event.target.value); setSelectedId(''); setDeliveryStatuses({}) }}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label></section>}

      {canEdit && <section className="card formSectionsEditor">
        <div className="panelHead"><div><h3>Start From a Template</h3><small>Create a new Draft form with a ready-made structure. Everything can be edited afterwards.</small></div></div>
        <div className="fieldTypeBar">{formTemplates.map(template => <button type="button" key={template.id} disabled={!websiteId || busy} title={template.description} onClick={() => createFromTemplate(template)}>{template.name}</button>)}</div>
      </section>}

      {isOwner && <section className="card emailReadinessPanel">
        <div className="panelHead"><div><span>Email Delivery</span><h2>{emailReadiness?.configured ? 'Ready' : emailReadinessLoading ? 'Checking…' : 'Setup required'}</h2></div><button type="button" disabled={emailReadinessLoading || busy} onClick={loadEmailReadiness}>{emailReadinessLoading ? 'Checking…' : 'Refresh'}</button></div>
        <div className="emailReadinessGrid"><p><b>HTTP endpoint</b><small>{emailReadiness?.endpointConfigured ? 'Configured' : 'Not configured'}</small></p><p><b>Sender</b><small>{emailReadiness?.from || 'Not configured'}</small></p><p><b>Authentication</b><small>{emailReadiness?.authenticationConfigured ? 'Token configured' : 'No token configured'}</small></p></div>
        <div className="emailTestControls"><label>Test recipient<input type="email" value={testEmail} disabled={busy} placeholder="you@example.com" onChange={event => { setTestEmail(event.target.value); setEmailTestState('') }} /></label><button type="button" disabled={busy || !emailReadiness?.configured || !testEmail.trim()} onClick={sendEmailTest}>{busyAction === 'email-test' ? 'Queuing…' : 'Send Test Email'}</button>{emailTestState && <small aria-live="polite">{emailTestState}</small>}</div>
      </section>}

      <section className="formsGrid">
        <aside className="card formList"><div className="panelHead"><h2>Forms</h2>{canEdit && <button onClick={addForm} disabled={!websiteId || busy}>{busyAction === 'create-form' ? 'Creating…' : 'Create'}</button>}</div>{forms.map(form => <button className={form.id === selectedId ? 'active' : ''} disabled={busy} key={form.id} onClick={() => setSelectedId(form.id)}><b>{form.name}</b><small>{form.publication?.isPublished ? (form.publication?.hasUnpublishedChanges ? 'Live · draft changes' : 'Live') : form.status || 'Draft'} · {(form.fields || []).length} fields</small></button>)}{!forms.length && <p className="emptyState">No forms configured yet.</p>}</aside>

        <section className="card formEditor">
          <div className="panelHead"><h2>{canEdit ? 'Form Settings' : 'Form Details'}</h2>{selected && <div className="formHeaderActions"><button type="button" disabled>{isPublished ? (hasUnpublishedChanges ? 'Live · Draft changes' : 'Live') : isArchived ? 'Archived' : 'Draft'}</button>{canEdit && <><button type="button" disabled={busy || !canUndoEdit} onClick={undoEdit}>{draftDirty ? 'Undo Draft' : 'Undo'}</button><button type="button" disabled={busy || !canRedoEdit} onClick={redoEdit}>Redo</button><button type="button" disabled={busy} onClick={duplicateForm}>Duplicate Form</button></>}</div>}</div>
          {selected && <>
            <div className="formSectionsEditor">
              <div className="panelHead"><div><h3>Publishing</h3><small>{isArchived ? 'This form is archived. Restore it to Draft before publishing.' : isPublished ? (hasUnpublishedChanges ? 'The public website is still using the last published version while these changes remain in draft.' : 'The saved editor configuration matches the version currently live on the public website.') : 'This form is not currently published to the public website.'}</small></div>{canEdit && !isArchived && <div className="formHeaderActions">{isPublished && hasUnpublishedChanges && <button type="button" disabled={busy} onClick={discardDraft}>{busyAction === 'discard-draft' ? 'Discarding…' : 'Discard Draft'}</button>}<button type="button" disabled={busy || (isPublished && !hasUnpublishedChanges)} onClick={publishChanges}>{busyAction === 'publish-form' ? 'Publishing…' : isPublished ? 'Publish Changes' : 'Publish Form'}</button></div>}</div>
              <div className="submissions"><p><b>Live state</b><small>{isPublished ? 'Published and available to the public website' : isArchived ? 'Archived and unavailable to the public website' : 'Not published'}</small></p><p><b>Draft state</b><small>{isArchived ? 'Archived · restore to Draft to continue publishing' : draftDirty ? 'Unsaved editor changes · autosaving shortly' : publication.hasUnpublishedChanges ? 'Saved draft changes waiting to be published' : isPublished ? 'No unpublished changes' : 'Saved as draft'}</small></p><p><b>Last published</b><small>{publishedAt || 'Never published'}</small></p>{isPublished && hasUnpublishedChanges && <p><b>Draft vs Live</b><small>{draftLiveChanges.length ? draftLiveChanges.join(' · ') : 'Draft contains unpublished configuration changes'}</small></p>}{isPublished && hasUnpublishedChanges && <p><b>Public safety</b><small>Visitors continue to receive the previous live version until Publish Changes is confirmed.</small></p>}</div>
            </div>

            <div className="formSettings">
              <label>Name<input value={selected.name || ''} disabled={!canEdit || busy} onChange={event => updateSelectedLocal({ name: event.target.value })} onBlur={event => saveForm({ name: event.target.value })} /></label>
              <label>Email Destination<input type="email" value={selected.destination || ''} disabled={!canEdit || busy} onChange={event => updateSelectedLocal({ destination: event.target.value })} onBlur={event => saveForm({ destination: event.target.value.trim() })} /></label>
              <label>Lifecycle<input value={isPublished ? 'Live' : isArchived ? 'Archived' : 'Draft'} disabled readOnly /></label>
              <label className="formCheck"><input type="checkbox" checked={selected.spamProtection !== false} disabled={!canEdit || busy} onChange={event => saveForm({ spamProtection: event.target.checked })} /> Spam protection</label>
              <label className="formSettingsWide">Success Message<textarea value={selected.successMessage || ''} disabled={!canEdit || busy} placeholder="Thanks — your enquiry has been sent." onChange={event => updateSelectedLocal({ successMessage: event.target.value })} onBlur={event => saveFormConfiguration({ successMessage: event.target.value.trim().slice(0, 500) })} /></label>
            </div>

            <div className="formSectionsEditor">
              <div className="panelHead"><div><h3>Form Lifecycle</h3><small>{isPublished ? 'Archive removes this form from the public website but preserves submissions and revision history.' : isArchived ? 'Restore returns this form to Draft. Publishing remains a separate explicit action.' : 'Draft forms can be archived for storage or published through the Publishing panel.'}</small></div>{canEdit && <button type="button" disabled={busy} onClick={() => changeLifecycle(isArchived ? 'Draft' : 'Archived')}>{busyAction === 'lifecycle' ? (isArchived ? 'Restoring…' : 'Archiving…') : isArchived ? 'Restore to Draft' : 'Archive Form'}</button>}</div>
            </div>

            <div className="submissions"><h3>Public Submission Readiness</h3><p><b>Public website integration</b><small>{publicReady ? (hasUnpublishedChanges ? 'Live · draft changes are not public yet' : 'Connected and accepting submissions') : isArchived ? 'Archived · restore to Draft before publishing' : 'Ready after this form is published'}</small></p><p><b>Delivery destination</b><small>{selected.destination || 'No destination configured'}</small></p><p><b>Draft safety</b><small>{draftDirty ? 'Unsaved changes · autosaving shortly' : publication.hasUnpublishedChanges ? 'Saved draft changes · live version protected' : `${selectedHistory.past.length} undo revision${selectedHistory.past.length === 1 ? '' : 's'} available this session · autosave enabled`}</small></p><p><b>Persistent history</b><small>{persistentRevisions.length ? `${persistentRevisions.length} saved revision${persistentRevisions.length === 1 ? '' : 's'} available across sessions` : 'No saved revisions yet'}</small></p><p><b>Publish history</b><small>{publishHistory.length ? `${publishHistory.length} live release${publishHistory.length === 1 ? '' : 's'} retained for rollback` : 'No published releases recorded yet'}</small></p><p><b>Conditional logic</b><small>{conditionalEnabled ? 'Available · conditions may reference earlier answer fields only' : 'Unavailable while this form contains File fields'}</small></p><p><b>Form layout</b><small>{sections.length > 1 ? `${sections.length} stepped sections · full / half-width controls available` : 'Single page · full / half-width controls available'}</small></p><p><b>Advanced fields</b><small>{hasFileFields ? 'Unavailable while this form contains File fields' : 'Radio, Number, Heading, Instructions and Divider available'}</small></p><p><b>Success message</b><small>{selected.successMessage || 'Default confirmation message'}</small></p><p><b>Email transport</b><small>{isOwner ? (emailReadiness?.configured ? 'Configured' : 'Setup required') : 'Managed by KSJ Digital'}</small></p><p><b>Spam protection</b><small>{selected.spamProtection !== false ? 'Enabled for public submissions' : 'Disabled'}</small></p>{hasFileFields && <p><b>Secure file uploads</b><small>Enabled · PDF, PNG, JPG/JPEG and WebP · 5 MB per file · private authenticated downloads</small></p>}</div>

            <div className="formSectionsEditor">
              <div className="panelHead"><div><h3>Revision History</h3><small>Saved configuration history survives refresh and logout. Restoring never replaces stored submissions.</small></div>{canEdit && <button type="button" disabled={busy} onClick={createRestorePoint}>{busyAction === 'restore-point' ? 'Creating…' : 'Create Restore Point'}</button>}</div>
              {persistentRevisions.length ? <div className="submissions">{persistentRevisions.map((revision, index) => <p key={revision.id || `${revision.createdAt}-${index}`}><b>{revision.label || 'Saved form revision'}</b><small>{revisionTimestamp(revision.createdAt)} · {(Array.isArray(revision.changes) && revision.changes.length ? revision.changes : ['Form configuration']).join(', ')}</small>{canEdit && <button type="button" disabled={busy || !revision.id} onClick={() => restorePersistentRevision(revision)}>{busyAction === `restore-${revision.id}` ? 'Restoring…' : 'Restore'}</button>}</p>)}</div> : <p className="emptyState">No persistent revisions yet. Changes will appear here after saves, or create a manual restore point now.</p>}
            </div>

            <div className="formSectionsEditor">
              <div className="panelHead"><div><h3>Publish History</h3><small>Each Live release is retained separately from editor revisions. Rollback changes the public version only and preserves submissions and any newer Draft.</small></div></div>
              {publishHistory.length ? <div className="submissions">{publishHistory.map((release, index) => {
                const releaseFields = Array.isArray(release.snapshot?.fields) ? release.snapshot.fields.length : 0
                const releaseSections = normaliseSections(release.snapshot || {}).length
                const currentRelease = index === 0 && isPublished && release.publishedAt === publication.publishedAt
                return <p key={release.id || `${release.publishedAt}-${index}`}><b>{release.label || 'Published form'}</b><small>{revisionTimestamp(release.publishedAt)} · {releaseFields} field{releaseFields === 1 ? '' : 's'} · {releaseSections > 1 ? `${releaseSections} steps` : 'single page'}{currentRelease ? ' · Current Live' : ''}</small>{canEdit && isPublished && !currentRelease && <button type="button" disabled={busy || !release.id} onClick={() => rollbackPublishedVersion(release)}>{busyAction === `rollback-publish-${release.id}` ? 'Rolling back…' : 'Rollback Live Version'}</button>}</p>
              })}</div> : <p className="emptyState">No publish history yet. The first release will appear here after this form is published.</p>}
            </div>

            <div className="formSectionsEditor">
              <div className="panelHead"><div><h3>Sections / Steps</h3><small>{sections.length > 1 ? 'Public form uses Previous / Next navigation.' : 'Optional — add at least two sections to create a multi-page form.'}</small></div>{canEdit && <button type="button" disabled={busy || sections.length >= 20} onClick={addSection}>Add Section</button>}</div>
              {sections.length ? sections.map((section, index) => <article key={section.id} className="formSectionItem">
                <div className="formSectionNumber">{index + 1}</div>
                <label>Title<input value={section.title} disabled={!canEdit || busy} onChange={event => updateSelectedLocal({ sections: sections.map(item => item.id === section.id ? { ...item, title: event.target.value } : item) })} onBlur={event => updateSection(section.id, { title: event.target.value.trim().slice(0, 120) || `Step ${index + 1}` })} /></label>
                <label>Description<input value={section.description || ''} disabled={!canEdit || busy} placeholder="Optional guidance for this step" onChange={event => updateSelectedLocal({ sections: sections.map(item => item.id === section.id ? { ...item, description: event.target.value } : item) })} onBlur={event => updateSection(section.id, { description: event.target.value.trim().slice(0, 300) })} /></label>
                {canEdit && <div className="formSectionActions"><button type="button" disabled={busy || index === 0} onClick={() => moveSection(section.id, 'up')}>↑</button><button type="button" disabled={busy || index === sections.length - 1} onClick={() => moveSection(section.id, 'down')}>↓</button><button type="button" disabled={busy || sections.length <= 1} onClick={() => removeSection(section.id)}>Remove</button></div>}
              </article>) : <p className="emptyState">No sections configured. This form stays on one page.</p>}
            </div>

            {canEdit && <div className="formSectionsEditor">
              <div className="panelHead"><div><h3>Reusable Field Groups</h3><small>Insert a ready-made group into {sections.length > 1 ? 'the currently previewed step' : 'this form'}. Duplicate IDs are renamed automatically.</small></div></div>
              <div className="fieldTypeBar">{fieldGroups.map(group => <button type="button" key={group.id} disabled={busy} title={group.description} onClick={() => insertFieldGroup(group)}>{group.name}</button>)}</div>
            </div>}

            {canEdit && <div className="fieldTypeBar">{fieldTypes.map(type => <button key={type} disabled={busy || (type === 'File' && hasAdvancedFields) || (advancedFieldTypes.has(type) && hasFileFields)} title={(type === 'File' && hasAdvancedFields) || (advancedFieldTypes.has(type) && hasFileFields) ? 'Secure File fields and advanced fields cannot be combined yet' : ''} onClick={() => addNewField(type)}>{type}</button>)}</div>}
            {fields.map((field, index) => {
              const kind = fieldKind(field)
              const earlierFields = fields.slice(0, index).filter(item => fieldKind(item) !== 'File' && storesValue(item))
              const source = earlierFields.find(item => item.id === field.condition?.fieldId)
              const sourceKind = fieldKind(source)
              return <article className="fieldEditor" key={field.id}>
                <div className="panelHead"><h3>{kind}</h3>{canEdit && <div><button aria-label={`Move ${field.label || kind} up`} disabled={busy || index === 0} onClick={() => shiftField(field.id, 'up')}>↑</button><button aria-label={`Move ${field.label || kind} down`} disabled={busy || index === fields.length - 1} onClick={() => shiftField(field.id, 'down')}>↓</button><button disabled={busy} onClick={() => duplicateField(field)}>Duplicate</button><button disabled={busy} onClick={() => removeField(field)}>Remove</button></div>}</div>
                <label>Label<input value={field.label || ''} disabled={!canEdit || busy} onChange={event => updateFieldLocal(field.id, { label: event.target.value })} onBlur={event => editField(field.id, { label: event.target.value })} /></label>
                {!displayOnlyTypes.has(kind) && <label>Placeholder<input value={field.placeholder || ''} disabled={!canEdit || busy} onChange={event => updateFieldLocal(field.id, { placeholder: event.target.value })} onBlur={event => editField(field.id, { placeholder: event.target.value })} /></label>}
                {['Heading', 'Instructions'].includes(kind) && <label>Content<textarea value={field.content || ''} disabled={!canEdit || busy} placeholder="Optional supporting text" onChange={event => updateFieldLocal(field.id, { content: event.target.value })} onBlur={event => saveFieldConfiguration(field.id, { content: event.target.value.trim().slice(0, 1000) })} /></label>}
                {!displayOnlyTypes.has(kind) && <label>Help Text<input value={field.helpText || ''} disabled={!canEdit || busy} placeholder="Optional guidance shown below the field" onChange={event => updateFieldLocal(field.id, { helpText: event.target.value })} onBlur={event => saveFieldConfiguration(field.id, { helpText: event.target.value.trim().slice(0, 300) })} /></label>}
                <label>Width<select value={field.width === 'half' ? 'half' : 'full'} disabled={!canEdit || busy} onChange={event => saveFieldConfiguration(field.id, { width: event.target.value })}><option value="full">Full width</option><option value="half">Half width</option></select></label>
                {sections.length > 1 && <label>Section / Step<select value={field.sectionId || sections[0].id} disabled={!canEdit || busy} onChange={event => saveFieldConfiguration(field.id, { sectionId: event.target.value })}>{sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>}
                {['Select', 'Radio'].includes(kind) && <label>Options<textarea value={(field.options || []).join('\n')} disabled={!canEdit || busy} placeholder={'Option One\nOption Two\nOption Three'} onChange={event => updateFieldLocal(field.id, { options: normaliseOptions(event.target.value) })} onBlur={event => saveFieldConfiguration(field.id, { options: normaliseOptions(event.target.value) })} /><small>One option per line · up to 50 options</small></label>}
                {lengthFieldTypes.has(kind) && <div className="fieldValidationGrid"><label>Minimum Length<input type="number" min="0" max="5000" value={field.minLength || ''} disabled={!canEdit || busy} onChange={event => updateFieldLocal(field.id, { minLength: event.target.value ? Math.max(0, Math.min(5000, Number(event.target.value))) : null })} onBlur={event => saveFieldConfiguration(field.id, { minLength: event.target.value ? Math.max(0, Math.min(5000, Number(event.target.value))) : null })} /></label><label>Maximum Length<input type="number" min="1" max="5000" value={field.maxLength || ''} disabled={!canEdit || busy} onChange={event => updateFieldLocal(field.id, { maxLength: event.target.value ? Math.max(1, Math.min(5000, Number(event.target.value))) : null })} onBlur={event => saveFieldConfiguration(field.id, { maxLength: event.target.value ? Math.max(1, Math.min(5000, Number(event.target.value))) : null })} /></label></div>}
                {kind === 'Number' && <div className="fieldNumberGrid"><label>Minimum<input type="number" value={field.min ?? ''} disabled={!canEdit || busy} onChange={event => updateFieldLocal(field.id, { min: event.target.value === '' ? null : Number(event.target.value) })} onBlur={event => saveFieldConfiguration(field.id, { min: event.target.value === '' ? null : Number(event.target.value) })} /></label><label>Maximum<input type="number" value={field.max ?? ''} disabled={!canEdit || busy} onChange={event => updateFieldLocal(field.id, { max: event.target.value === '' ? null : Number(event.target.value) })} onBlur={event => saveFieldConfiguration(field.id, { max: event.target.value === '' ? null : Number(event.target.value) })} /></label><label>Step<input type="number" min="0.000001" value={field.step ?? ''} disabled={!canEdit || busy} placeholder="Any" onChange={event => updateFieldLocal(field.id, { step: event.target.value === '' ? null : Number(event.target.value) })} onBlur={event => saveFieldConfiguration(field.id, { step: event.target.value === '' ? null : Math.max(0.000001, Number(event.target.value)) })} /></label></div>}
                {storesValue(field) && <label className="formCheck"><input type="checkbox" checked={field.required === true} disabled={!canEdit || busy} onChange={event => editField(field.id, { required: event.target.checked })} /> Required</label>}
                {conditionalEnabled && index > 0 && <div className="fieldConditionEditor">
                  <b>Conditional visibility</b>
                  <label>Show this field when<select value={field.condition?.fieldId || ''} disabled={!canEdit || busy} onChange={event => setFieldCondition(field, index, event.target.value)}><option value="">Always visible</option>{earlierFields.map(item => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}</select></label>
                  {source && <div className="fieldConditionRule"><label>Condition<select value={field.condition?.operator || (sourceKind === 'Checkbox' ? 'checked' : 'equals')} disabled={!canEdit || busy} onChange={event => updateFieldCondition(field, { operator: event.target.value, value: sourceKind === 'Checkbox' ? '' : field.condition?.value || '' })}>{sourceKind === 'Checkbox' ? <><option value="checked">is checked</option><option value="unchecked">is unchecked</option></> : <><option value="equals">equals</option><option value="notEquals">does not equal</option></>}</select></label>{sourceKind !== 'Checkbox' && <label>Value{['Select', 'Radio'].includes(sourceKind) && (source.options || []).length ? <select value={field.condition?.value || ''} disabled={!canEdit || busy} onChange={event => updateFieldCondition(field, { value: event.target.value })}><option value="">Choose value</option>{source.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : <input value={field.condition?.value || ''} disabled={!canEdit || busy} placeholder="Value to compare" onChange={event => updateFieldLocal(field.id, { condition: { ...(field.condition || {}), value: event.target.value } })} onBlur={event => updateFieldCondition(field, { value: event.target.value.trim().slice(0, 120) })} />}</label>}</div>}
                </div>}
              </article>
            })}
            {!fields.length && <p className="emptyState">Add the first field to build this form.</p>}
            {canEdit && <div className="formDanger"><button onClick={removeForm} disabled={busy}>{busyAction === 'delete-form' ? 'Deleting…' : 'Delete Form'}</button></div>}
          </>}
        </section>

        <aside className="card formPreview">
          <div className="panelHead"><div><h2>Portal Preview</h2>{selected && <small>{previewingLive ? 'Live version currently served to visitors' : isPublished ? (hasUnpublishedChanges ? 'Draft preview · unpublished changes' : 'Draft preview · matches Live') : 'Draft preview · not published'}</small>}</div><div className="formHeaderActions">{selected && isPublished && <><button type="button" disabled={previewVersion === 'draft'} onClick={() => setPreviewVersion('draft')}>Draft</button><button type="button" disabled={previewVersion === 'live'} onClick={() => setPreviewVersion('live')}>Live</button></>}{canEdit && <button disabled={!websiteId || !selected?.id || busy} onClick={addTestSubmission}>{busyAction === 'test' ? 'Testing…' : 'Add Test Submission'}</button>}</div></div>
          {selected && <form onSubmit={event => event.preventDefault()}><h3>{previewForm?.name}</h3>{steppedPreview && <div className="previewStepProgress"><span>Step {safePreviewStepIndex + 1} of {previewSourceSections.length}</span><b>{previewSection?.title}</b>{previewSection?.description && <small>{previewSection.description}</small>}</div>}<div className="previewFieldsGrid">{previewFields.map(field => <FieldPreview key={field.id} field={field} value={previewValues[field.id]} onChange={value => setPreviewValues(current => ({ ...current, [field.id]: value }))} />)}</div>{steppedPreview ? <div className="previewStepActions">{safePreviewStepIndex > 0 && <button type="button" onClick={() => setPreviewStepIndex(index => Math.max(0, index - 1))}>Previous</button>}{safePreviewStepIndex < previewSourceSections.length - 1 ? <button type="button" onClick={() => setPreviewStepIndex(index => Math.min(previewSourceSections.length - 1, index + 1))}>Next</button> : <button type="button" disabled>Preview only</button>}</div> : <button type="button" disabled>Preview only</button>}{previewConditionalEnabled && previewSourceFields.some(field => field.condition) && <small>Conditional preview is live — change answers above to test rules.</small>}{previewForm?.successMessage && <small>Success: {previewForm.successMessage}</small>}</form>}

          <div className="submissions submissionManager">
            <div className="panelHead"><div><h3>Submissions</h3><small>{filteredSubmissions.length === submissionStats.total ? `${submissionStats.total} total` : `${filteredSubmissions.length} of ${submissionStats.total}`}</small></div><div className="submissionToolbar"><button type="button" disabled={!selected?.id || deliveryLoading} onClick={() => loadDeliveryStatuses(selected?.id)}>{deliveryLoading ? 'Checking…' : 'Refresh delivery'}</button><button type="button" disabled={!filteredSubmissions.length || busy} onClick={() => exportSubmissions(filteredSubmissions, 'filtered')}>Export filtered</button>{selectedSubmissions.length > 0 && <button type="button" disabled={busy} onClick={() => exportSubmissions(selectedSubmissions, 'selected')}>Export selected ({selectedSubmissions.length})</button>}</div></div>
            <div className="submissionStats" aria-label="Submission counts"><span><b>{submissionStats.total}</b>Total</span><span><b>{submissionStats.new}</b>New</span><span><b>{submissionStats.read}</b>Read</span><span><b>{submissionStats.resolved}</b>Resolved</span><span><b>{submissionStats.public}</b>Public</span></div>
            <div className="submissionFilters"><label>Search<input type="search" value={submissionQuery} placeholder="ID, answer, filename…" onChange={event => setSubmissionQuery(event.target.value)} /></label><label>Status<select value={submissionStatusFilter} onChange={event => setSubmissionStatusFilter(event.target.value)}><option>All</option>{submissionStatuses.map(status => <option key={status}>{status}</option>)}</select></label><label>Source<select value={submissionSourceFilter} onChange={event => setSubmissionSourceFilter(event.target.value)}><option>All</option>{submissionSources.map(source => <option key={source}>{source}</option>)}</select></label><label>Per page<select value={submissionPageSize} onChange={event => setSubmissionPageSize(Number(event.target.value))}>{submissionPageSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label></div>
            {filteredSubmissions.length > 0 && <div className="submissionBulkBar"><label className="formCheck"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSubmissions} /> Select page</label><span>{selectedSubmissionIds.length ? `${selectedSubmissionIds.length} selected` : 'No selection'}</span>{canEdit && selectedSubmissionIds.length > 0 && <><select aria-label="Set selected submission status" defaultValue="" disabled={busy} onChange={event => { const status = event.target.value; event.target.value = ''; updateSelectedSubmissionStatus(status) }}><option value="" disabled>Set status…</option>{submissionStatuses.map(status => <option key={status}>{status}</option>)}</select><button type="button" className="danger" disabled={busy} onClick={removeSelectedSubmissions}>{busyAction === 'bulk-submissions' ? 'Saving…' : 'Delete selected'}</button></>}</div>}
            {pagedSubmissions.length ? pagedSubmissions.map(sub => {
              const summary = submissionSummary(sub, fields)
              const submissionBusy = busyAction === `submission-${sub.id}`
              const delivery = deliveryStatuses[sub.id]
              const deliveryText = sub.source === 'Public website' ? (delivery?.status || (deliveryLoading ? 'Checking…' : 'Not queued')) : 'Not applicable'
              const attachments = Array.isArray(sub.attachments) ? sub.attachments : []
              return <article className={`submissionItem${selectedSubmissionSet.has(sub.id) ? ' selected' : ''}`} key={sub.id}><label className="submissionSelect" title="Select submission"><input type="checkbox" checked={selectedSubmissionSet.has(sub.id)} onChange={() => toggleSubmissionSelection(sub.id)} /><span className="srOnly">Select submission</span></label><div><b>{sub.source || 'Submission'}</b><small>{sub.createdAt}</small><span className={deliveryClass(deliveryText)} title={delivery?.error || ''}>Email: {deliveryText}</span>{summary && <small>{summary}</small>}{attachments.length > 0 && <div className="submissionAttachments">{attachments.map(attachment => { const field = fields.find(item => item.id === attachment.fieldId); return <a key={attachment.id} href={api.formAttachmentUrl(websiteId, selected.id, sub.id, attachment.id)}><b>{attachment.name}</b><small>{field?.label || 'Attachment'} · {attachment.mimeType || 'file'} · {attachmentSize(attachment.size)}</small></a> })}</div>}</div><div className="submissionActions"><select aria-label="Submission status" value={submissionStatuses.includes(sub.status) ? sub.status : 'New'} disabled={!canEdit || busy} onChange={event => updateSubmissionStatus(sub, event.target.value)}>{submissionStatuses.map(status => <option key={status}>{status}</option>)}</select>{canEdit && <button type="button" disabled={busy} onClick={() => removeSubmission(sub)}>{submissionBusy ? 'Saving…' : 'Delete'}</button>}</div></article>
            }) : <p>{allSubmissions.length ? 'No submissions match these filters.' : 'No submissions yet.'}</p>}
            {filteredSubmissions.length > 0 && <div className="submissionPagination"><button type="button" disabled={currentSubmissionPage <= 1} onClick={() => setSubmissionPage(page => Math.max(1, page - 1))}>Previous</button><span>Page {currentSubmissionPage} of {submissionPageCount} · {filteredSubmissions.length} result{filteredSubmissions.length === 1 ? '' : 's'}</span><button type="button" disabled={currentSubmissionPage >= submissionPageCount} onClick={() => setSubmissionPage(page => Math.min(submissionPageCount, page + 1))}>Next</button></div>}
          </div>
        </aside>
      </section>
    </Layout>
  )
}
