import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { api } from '../services/api.js'

const fieldTypes = ['Text', 'Email', 'Textarea', 'Phone', 'Select', 'Checkbox', 'Date', 'File']
const submissionStatuses = ['New', 'Read', 'Resolved']
const submissionPageSizes = [10, 25, 50]

function FieldPreview({ field }) {
  if (field.type === 'Textarea') return <textarea placeholder={field.placeholder} disabled />
  if (field.type === 'Checkbox') return <label className="formCheck"><input type="checkbox" disabled /> {field.label}</label>
  if (field.type === 'Select') return <select disabled><option>{field.placeholder || 'Choose an option'}</option></select>
  if (field.type === 'File') return <input type="file" disabled />
  return <input type={field.type === 'Email' ? 'email' : field.type === 'Date' ? 'date' : 'text'} placeholder={field.placeholder} disabled />
}

function submissionSummary(submission, fields = []) {
  if (!submission?.values || typeof submission.values !== 'object' || Array.isArray(submission.values)) return ''
  return fields
    .filter(field => field.type !== 'File')
    .map(field => {
      const value = submission.values[field.id]
      if (value === undefined || value === null || value === '') return ''
      const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value).slice(0, 100)
      return `${field.label || field.id}: ${display}`
    })
    .filter(Boolean)
    .slice(0, 4)
    .join(' · ')
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
  return [submission?.id, submission?.source, submission?.status, submission?.createdAt, ...values, ...attachments]
    .filter(value => value !== undefined && value !== null)
    .map(String)
    .join(' ')
    .toLowerCase()
}

export function FormBuilderPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const isOwner = account?.role === 'owner'
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('')
  const website = isOwner
    ? websites.find(site => site.id === selectedWebsiteId) || websites[0] || null
    : assignedWebsite
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
  const selected = forms.find(form => form.id === selectedId) || forms[0]
  const busy = Boolean(busyAction)
  const hasFileFields = Boolean((selected?.fields || []).some(field => field.type === 'File'))
  const publicReady = selected?.status === 'Active'
  const allSubmissions = Array.isArray(selected?.submissions) ? selected.submissions : []
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

  useEffect(() => {
    if (isOwner && !selectedWebsiteId && websites[0]?.id) setSelectedWebsiteId(websites[0].id)
  }, [isOwner, selectedWebsiteId, websites])

  async function loadForms(nextId = selectedId, message = canEdit ? 'Ready' : 'Preview only') {
    if (!websiteId) {
      setForms([])
      setSelectedId('')
      setDeliveryStatuses({})
      setNotice('Waiting for assigned website')
      return
    }
    try {
      const next = await api.getForms(websiteId)
      setForms(Array.isArray(next) ? next : [])
      setSelectedId(next.find(form => form.id === nextId)?.id || next[0]?.id || '')
      setNotice(message)
    } catch (error) {
      setForms([])
      setSelectedId('')
      setDeliveryStatuses({})
      setNotice(error.message || 'Forms unavailable')
    }
  }

  async function loadDeliveryStatuses(formId = selected?.id) {
    if (!websiteId || !formId) {
      setDeliveryStatuses({})
      return
    }
    setDeliveryLoading(true)
    try {
      const result = await api.getFormDeliveryStatuses(websiteId, formId)
      setDeliveryStatuses(result?.statuses && typeof result.statuses === 'object' ? result.statuses : {})
    } catch {
      setDeliveryStatuses({})
    } finally {
      setDeliveryLoading(false)
    }
  }

  async function loadEmailReadiness() {
    if (!isOwner) {
      setEmailReadiness(null)
      return
    }
    setEmailReadinessLoading(true)
    try {
      const result = await api.getEmailReadiness()
      setEmailReadiness(result)
    } catch {
      setEmailReadiness(null)
    } finally {
      setEmailReadinessLoading(false)
    }
  }

  useEffect(() => {
    setBusyAction('')
    loadForms('', canEdit ? 'Ready' : 'Preview only')
  }, [canEdit, websiteId])

  useEffect(() => {
    loadDeliveryStatuses(selected?.id)
    setSubmissionQuery('')
    setSubmissionStatusFilter('All')
    setSubmissionSourceFilter('All')
    setSubmissionPage(1)
    setSelectedSubmissionIds([])
  }, [websiteId, selected?.id])

  useEffect(() => {
    loadEmailReadiness()
  }, [isOwner])

  useEffect(() => {
    if (!isOwner) return
    setTestEmail(selected?.destination || emailReadiness?.from || '')
    setEmailTestState('')
  }, [isOwner, selected?.id, emailReadiness?.from])

  useEffect(() => {
    setSubmissionPage(1)
  }, [submissionQuery, submissionStatusFilter, submissionSourceFilter, submissionPageSize])

  useEffect(() => {
    if (submissionPage > submissionPageCount) setSubmissionPage(submissionPageCount)
  }, [submissionPage, submissionPageCount])

  useEffect(() => {
    const existing = new Set(allSubmissions.map(item => item.id))
    setSelectedSubmissionIds(current => current.filter(id => existing.has(id)))
  }, [allSubmissions])

  function updateSelectedLocal(changes) {
    if (!selected?.id) return
    setForms(current => current.map(form => form.id === selected.id ? { ...form, ...changes } : form))
  }

  function updateFieldLocal(fieldId, changes) {
    if (!selected?.id) return
    setForms(current => current.map(form => form.id === selected.id
      ? { ...form, fields: (form.fields || []).map(field => field.id === fieldId ? { ...field, ...changes } : field) }
      : form))
  }

  async function sendEmailTest() {
    if (!isOwner || busy) return
    const recipient = testEmail.trim()
    if (!recipient) return setNotice('Enter a test recipient email')
    if (!emailReadiness?.configured) return setNotice('Email delivery is not configured')
    setBusyAction('email-test')
    setEmailTestState('Queuing test email…')
    setNotice('Queuing email test')
    try {
      const result = await api.sendEmailTest(recipient)
      const status = result?.jobs?.[0]?.status || 'queued'
      setEmailTestState(`Test ${status}`)
      setNotice('Email test queued')
    } catch (error) {
      setEmailTestState(error.message || 'Email test failed')
      setNotice(error.message || 'Email test failed')
    } finally {
      setBusyAction('')
    }
  }

  async function addForm() {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || busy) return
    setBusyAction('create-form')
    setNotice('Creating form')
    try {
      const result = await api.createForm(websiteId, { name: 'New Form' })
      setForms(result.forms)
      setSelectedId(result.form.id)
      setNotice('Form created')
    } catch (error) {
      setNotice(error.message || 'Create failed')
    } finally {
      setBusyAction('')
    }
  }

  async function saveForm(changes) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || busy) return false
    const formId = selected.id
    setBusyAction('save-form')
    setNotice('Saving form')
    try {
      const next = await api.updateForm(websiteId, formId, changes)
      setForms(next)
      setSelectedId(formId)
      setNotice('Form saved')
      return true
    } catch (error) {
      setNotice(error.message || 'Save failed')
      await loadForms(formId, error.message || 'Save failed')
      return false
    } finally {
      setBusyAction('')
    }
  }

  async function removeForm() {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || busy) return
    if (!globalThis.confirm(`Delete “${selected.name || 'this form'}”? Its configured fields and stored submissions will be removed. This action cannot be undone.`)) return
    const formId = selected.id
    setBusyAction('delete-form')
    setNotice('Deleting form')
    try {
      const next = await api.deleteForm(websiteId, formId)
      setForms(next)
      setSelectedId(next[0]?.id || '')
      setDeliveryStatuses({})
      setNotice('Form deleted')
    } catch (error) {
      setNotice(error.message || 'Delete failed')
    } finally {
      setBusyAction('')
    }
  }

  async function addNewField(type) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || busy) return
    const formId = selected.id
    setBusyAction('add-field')
    setNotice('Adding field')
    try {
      const next = await api.addField(websiteId, formId, { type })
      setForms(next)
      setSelectedId(formId)
      setNotice(`${type} field added`)
    } catch (error) {
      setNotice(error.message || 'Add field failed')
    } finally {
      setBusyAction('')
    }
  }

  async function editField(fieldId, changes) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || busy) return false
    const formId = selected.id
    setBusyAction(`field-${fieldId}`)
    setNotice('Saving field')
    try {
      const next = await api.updateField(websiteId, formId, fieldId, changes)
      setForms(next)
      setSelectedId(formId)
      setNotice('Field updated')
      return true
    } catch (error) {
      setNotice(error.message || 'Field save failed')
      await loadForms(formId, error.message || 'Field save failed')
      return false
    } finally {
      setBusyAction('')
    }
  }

  async function removeField(field) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || !field?.id || busy) return
    if (!globalThis.confirm(`Remove “${field.label || 'this field'}” from ${selected.name || 'this form'}?`)) return
    const formId = selected.id
    setBusyAction(`remove-${field.id}`)
    setNotice('Removing field')
    try {
      const next = await api.deleteField(websiteId, formId, field.id)
      setForms(next)
      setSelectedId(formId)
      setNotice('Field removed')
    } catch (error) {
      setNotice(error.message || 'Remove failed')
    } finally {
      setBusyAction('')
    }
  }

  async function shiftField(fieldId, direction) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || busy) return
    const formId = selected.id
    setBusyAction(`move-${fieldId}`)
    setNotice('Moving field')
    try {
      const next = await api.moveField(websiteId, formId, fieldId, direction)
      setForms(next)
      setSelectedId(formId)
      setNotice('Field moved')
    } catch (error) {
      setNotice(error.message || 'Move failed')
    } finally {
      setBusyAction('')
    }
  }

  async function addTestSubmission() {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || busy) return
    const formId = selected.id
    setBusyAction('test')
    setNotice('Adding portal test submission')
    try {
      const next = await api.submitTestForm(websiteId, formId)
      setForms(next)
      setSelectedId(formId)
      setNotice('Portal test submission added')
      await loadDeliveryStatuses(formId)
    } catch (error) {
      setNotice(error.message || 'Test failed')
    } finally {
      setBusyAction('')
    }
  }

  async function saveSubmissionChanges(submissionId, updater, message) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || !submissionId || busy) return
    const formId = selected.id
    setBusyAction(`submission-${submissionId}`)
    setNotice(message)
    const nextForms = forms.map(form => form.id === formId
      ? { ...form, submissions: updater(Array.isArray(form.submissions) ? form.submissions : []) }
      : form)
    try {
      await api.saveForms(websiteId, nextForms)
      await loadForms(formId, message.replace(/ing$/, 'ed'))
      await loadDeliveryStatuses(formId)
    } catch (error) {
      setNotice(error.message || 'Submission update failed')
      await loadForms(formId, error.message || 'Submission update failed')
    } finally {
      setBusyAction('')
    }
  }

  async function saveBulkSubmissionChanges(updater, message) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id || !selectedSubmissionIds.length || busy) return
    const formId = selected.id
    setBusyAction('bulk-submissions')
    setNotice(message)
    const nextForms = forms.map(form => form.id === formId
      ? { ...form, submissions: updater(Array.isArray(form.submissions) ? form.submissions : []) }
      : form)
    try {
      await api.saveForms(websiteId, nextForms)
      setSelectedSubmissionIds([])
      await loadForms(formId, message.replace(/ing$/, 'ed'))
      await loadDeliveryStatuses(formId)
    } catch (error) {
      setNotice(error.message || 'Bulk submission update failed')
      await loadForms(formId, error.message || 'Bulk submission update failed')
    } finally {
      setBusyAction('')
    }
  }

  async function updateSubmissionStatus(submission, status) {
    if (!submissionStatuses.includes(status) || submission.status === status) return
    await saveSubmissionChanges(
      submission.id,
      submissions => submissions.map(item => item.id === submission.id ? { ...item, status } : item),
      'Updating submission',
    )
  }

  async function removeSubmission(submission) {
    if (!submission?.id || busy) return
    if (!globalThis.confirm(`Delete this ${submission.source || 'form'} submission permanently? This action cannot be undone.`)) return
    await saveSubmissionChanges(
      submission.id,
      submissions => submissions.filter(item => item.id !== submission.id),
      'Deleting submission',
    )
  }

  async function updateSelectedSubmissionStatus(status) {
    if (!submissionStatuses.includes(status) || !selectedSubmissionIds.length) return
    const ids = new Set(selectedSubmissionIds)
    await saveBulkSubmissionChanges(
      submissions => submissions.map(item => ids.has(item.id) ? { ...item, status } : item),
      `Updating ${ids.size} submissions`,
    )
  }

  async function removeSelectedSubmissions() {
    if (!selectedSubmissionIds.length || busy) return
    const count = selectedSubmissionIds.length
    if (!globalThis.confirm(`Delete ${count} selected submission${count === 1 ? '' : 's'} permanently? Stored attachments for deleted submissions will also be removed. This action cannot be undone.`)) return
    const ids = new Set(selectedSubmissionIds)
    await saveBulkSubmissionChanges(
      submissions => submissions.filter(item => !ids.has(item.id)),
      `Deleting ${count} submissions`,
    )
  }

  function toggleSubmissionSelection(id) {
    setSelectedSubmissionIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  function toggleVisibleSubmissions() {
    setSelectedSubmissionIds(current => {
      const currentSet = new Set(current)
      if (allVisibleSelected) visibleSubmissionIds.forEach(id => currentSet.delete(id))
      else visibleSubmissionIds.forEach(id => currentSet.add(id))
      return [...currentSet]
    })
  }

  function exportSubmissions(records = filteredSubmissions, label = 'filtered') {
    if (!selected?.id || !records.length) return setNotice('No submissions to export')
    const fields = selected.fields || []
    const header = ['Submission ID', 'Created At', 'Status', 'Source', 'Email Delivery', 'Attachments', ...fields.map(field => field.label || field.id)]
    const rows = records.map(submission => [
      submission.id,
      submission.createdAt,
      submission.status || 'New',
      submission.source || 'Submission',
      deliveryStatuses[submission.id]?.status || (submission.source === 'Public website' ? 'Unknown' : 'Not applicable'),
      (submission.attachments || []).map(attachment => attachment.name).join(' | '),
      ...fields.map(field => submission.values?.[field.id] ?? ''),
    ])
    const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${websiteId}-${selected.id}-${label}-submissions.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setNotice(`${records.length} submission${records.length === 1 ? '' : 's'} exported`)
  }

  return (
    <Layout client={client} title="Forms">
      <section className="moduleHero card">
        <div>
          <span>Form Builder</span>
          <h2>{website?.name || 'Assigned Website'} Forms</h2>
          <p>{canEdit ? 'Create contact, support, application and custom forms.' : 'View the forms currently configured for this website.'}</p>
        </div>
        <button type="button" disabled aria-live="polite">{notice}</button>
      </section>

      {isOwner && websites.length > 1 && <section className="card formSettings">
        <label>Website<select value={websiteId || ''} disabled={busy} onChange={event => { setSelectedWebsiteId(event.target.value); setSelectedId(''); setDeliveryStatuses({}) }}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      </section>}

      {isOwner && <section className="card emailReadinessPanel">
        <div className="panelHead"><div><span>Email Delivery</span><h2>{emailReadiness?.configured ? 'Ready' : emailReadinessLoading ? 'Checking…' : 'Setup required'}</h2></div><button type="button" disabled={emailReadinessLoading || busy} onClick={loadEmailReadiness}>{emailReadinessLoading ? 'Checking…' : 'Refresh'}</button></div>
        <div className="emailReadinessGrid">
          <p><b>HTTP endpoint</b><small>{emailReadiness?.endpointConfigured ? 'Configured' : 'Not configured'}</small></p>
          <p><b>Sender</b><small>{emailReadiness?.from || 'Not configured'}</small></p>
          <p><b>Authentication</b><small>{emailReadiness?.authenticationConfigured ? 'Token configured' : 'No token configured'}</small></p>
        </div>
        <div className="emailTestControls">
          <label>Test recipient<input type="email" value={testEmail} disabled={busy} placeholder="you@example.com" onChange={event => { setTestEmail(event.target.value); setEmailTestState('') }} /></label>
          <button type="button" disabled={busy || !emailReadiness?.configured || !testEmail.trim()} onClick={sendEmailTest}>{busyAction === 'email-test' ? 'Queuing…' : 'Send Test Email'}</button>
          {emailTestState && <small aria-live="polite">{emailTestState}</small>}
        </div>
      </section>}

      <section className="formsGrid">
        <aside className="card formList">
          <div className="panelHead"><h2>Forms</h2>{canEdit && <button onClick={addForm} disabled={!websiteId || busy}>{busyAction === 'create-form' ? 'Creating…' : 'Create'}</button>}</div>
          {forms.map(form => <button className={form.id === selectedId ? 'active' : ''} disabled={busy} key={form.id} onClick={() => setSelectedId(form.id)}><b>{form.name}</b><small>{form.status} · {(form.fields || []).length} fields</small></button>)}
          {!forms.length && <p className="emptyState">No forms configured yet.</p>}
        </aside>
        <section className="card formEditor">
          <div className="panelHead"><h2>{canEdit ? 'Form Settings' : 'Form Details'}</h2>{selected && <button type="button" disabled>{selected.status}</button>}</div>
          {selected && <>
            <div className="formSettings">
              <label>Name<input value={selected.name || ''} disabled={!canEdit || busy} onChange={event => updateSelectedLocal({ name: event.target.value })} onBlur={event => saveForm({ name: event.target.value })} /></label>
              <label>Email Destination<input type="email" value={selected.destination || ''} disabled={!canEdit || busy} onChange={event => updateSelectedLocal({ destination: event.target.value })} onBlur={event => saveForm({ destination: event.target.value.trim() })} /></label>
              <label>Status<select value={selected.status || 'Draft'} disabled={!canEdit || busy} onChange={event => saveForm({ status: event.target.value })}><option>Active</option><option>Draft</option><option>Archived</option></select></label>
              <label className="formCheck"><input type="checkbox" checked={selected.spamProtection !== false} disabled={!canEdit || busy} onChange={event => saveForm({ spamProtection: event.target.checked })} /> Spam protection</label>
            </div>
            <div className="submissions">
              <h3>Public Submission Readiness</h3>
              <p><b>Public website integration</b><small>{publicReady ? 'Connected and accepting submissions' : 'Ready when this form is Active'}</small></p>
              <p><b>Delivery destination</b><small>{selected.destination || 'No destination configured'}</small></p>
              <p><b>Email transport</b><small>{isOwner ? (emailReadiness?.configured ? 'Configured' : 'Setup required') : 'Managed by KSJ Digital'}</small></p>
              <p><b>Spam protection</b><small>{selected.spamProtection !== false ? 'Enabled for public submissions' : 'Disabled'}</small></p>
              <p><b>Portal preview test</b><small>Available below and stored separately by source label</small></p>
              {hasFileFields && <p><b>Secure file uploads</b><small>Enabled · PDF, PNG, JPG/JPEG and WebP · 5 MB per file · private authenticated downloads</small></p>}
            </div>
            {canEdit && <div className="fieldTypeBar">{fieldTypes.map(type => <button key={type} disabled={busy} onClick={() => addNewField(type)}>{type}</button>)}</div>}
            {(selected.fields || []).map((field, index) => <article className="fieldEditor" key={field.id}>
              <div className="panelHead"><h3>{field.type}</h3>{canEdit && <div><button aria-label={`Move ${field.label || field.type} up`} disabled={busy || index === 0} onClick={() => shiftField(field.id, 'up')}>↑</button><button aria-label={`Move ${field.label || field.type} down`} disabled={busy || index === selected.fields.length - 1} onClick={() => shiftField(field.id, 'down')}>↓</button><button disabled={busy} onClick={() => removeField(field)}>{busyAction === `remove-${field.id}` ? 'Removing…' : 'Remove'}</button></div>}</div>
              <label>Label<input value={field.label || ''} disabled={!canEdit || busy} onChange={event => updateFieldLocal(field.id, { label: event.target.value })} onBlur={event => editField(field.id, { label: event.target.value })} /></label>
              <label>Placeholder<input value={field.placeholder || ''} disabled={!canEdit || busy} onChange={event => updateFieldLocal(field.id, { placeholder: event.target.value })} onBlur={event => editField(field.id, { placeholder: event.target.value })} /></label>
              <label className="formCheck"><input type="checkbox" checked={field.required === true} disabled={!canEdit || busy} onChange={event => editField(field.id, { required: event.target.checked })} /> Required</label>
            </article>)}
            {!(selected.fields || []).length && <p className="emptyState">Add the first field to build this form.</p>}
            {canEdit && <div className="formDanger"><button onClick={removeForm} disabled={busy}>{busyAction === 'delete-form' ? 'Deleting…' : 'Delete Form'}</button></div>}
          </>}
        </section>
        <aside className="card formPreview">
          <div className="panelHead"><h2>Portal Preview</h2>{canEdit && <button disabled={!websiteId || !selected?.id || busy} onClick={addTestSubmission}>{busyAction === 'test' ? 'Testing…' : 'Add Test Submission'}</button>}</div>
          {selected && <form onSubmit={event => event.preventDefault()}><h3>{selected.name}</h3>{(selected.fields || []).map(field => <label key={field.id}>{field.type !== 'Checkbox' && <span>{field.label}{field.required ? ' *' : ''}</span>}<FieldPreview field={field} /></label>)}<button type="button" disabled>Preview only</button></form>}
          <div className="submissions submissionManager">
            <div className="panelHead"><div><h3>Submissions</h3><small>{filteredSubmissions.length === submissionStats.total ? `${submissionStats.total} total` : `${filteredSubmissions.length} of ${submissionStats.total}`}</small></div><div className="submissionToolbar"><button type="button" disabled={!selected?.id || deliveryLoading} onClick={() => loadDeliveryStatuses(selected?.id)}>{deliveryLoading ? 'Checking…' : 'Refresh delivery'}</button><button type="button" disabled={!filteredSubmissions.length || busy} onClick={() => exportSubmissions(filteredSubmissions, 'filtered')}>Export filtered</button>{selectedSubmissions.length > 0 && <button type="button" disabled={busy} onClick={() => exportSubmissions(selectedSubmissions, 'selected')}>Export selected ({selectedSubmissions.length})</button>}</div></div>
            <div className="submissionStats" aria-label="Submission counts">
              <span><b>{submissionStats.total}</b>Total</span>
              <span><b>{submissionStats.new}</b>New</span>
              <span><b>{submissionStats.read}</b>Read</span>
              <span><b>{submissionStats.resolved}</b>Resolved</span>
              <span><b>{submissionStats.public}</b>Public</span>
            </div>
            <div className="submissionFilters">
              <label>Search<input type="search" value={submissionQuery} placeholder="ID, answer, filename…" onChange={event => setSubmissionQuery(event.target.value)} /></label>
              <label>Status<select value={submissionStatusFilter} onChange={event => setSubmissionStatusFilter(event.target.value)}><option>All</option>{submissionStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
              <label>Source<select value={submissionSourceFilter} onChange={event => setSubmissionSourceFilter(event.target.value)}><option>All</option>{submissionSources.map(source => <option key={source}>{source}</option>)}</select></label>
              <label>Per page<select value={submissionPageSize} onChange={event => setSubmissionPageSize(Number(event.target.value))}>{submissionPageSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
            </div>
            {filteredSubmissions.length > 0 && <div className="submissionBulkBar">
              <label className="formCheck"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSubmissions} /> Select page</label>
              <span>{selectedSubmissionIds.length ? `${selectedSubmissionIds.length} selected` : 'No selection'}</span>
              {canEdit && selectedSubmissionIds.length > 0 && <><select aria-label="Set selected submission status" defaultValue="" disabled={busy} onChange={event => { const status = event.target.value; event.target.value = ''; updateSelectedSubmissionStatus(status) }}><option value="" disabled>Set status…</option>{submissionStatuses.map(status => <option key={status}>{status}</option>)}</select><button type="button" className="danger" disabled={busy} onClick={removeSelectedSubmissions}>{busyAction === 'bulk-submissions' ? 'Saving…' : 'Delete selected'}</button></>}
            </div>}
            {pagedSubmissions.length ? pagedSubmissions.map(sub => {
              const summary = submissionSummary(sub, selected.fields || [])
              const submissionBusy = busyAction === `submission-${sub.id}`
              const delivery = deliveryStatuses[sub.id]
              const deliveryText = sub.source === 'Public website' ? (delivery?.status || (deliveryLoading ? 'Checking…' : 'Not queued')) : 'Not applicable'
              const attachments = Array.isArray(sub.attachments) ? sub.attachments : []
              return <article className={`submissionItem${selectedSubmissionSet.has(sub.id) ? ' selected' : ''}`} key={sub.id}>
                <label className="submissionSelect" title="Select submission"><input type="checkbox" checked={selectedSubmissionSet.has(sub.id)} onChange={() => toggleSubmissionSelection(sub.id)} /><span className="srOnly">Select submission</span></label>
                <div><b>{sub.source || 'Submission'}</b><small>{sub.createdAt}</small><span className={deliveryClass(deliveryText)} title={delivery?.error || ''}>Email: {deliveryText}</span>{summary && <small>{summary}</small>}{attachments.length > 0 && <div className="submissionAttachments">{attachments.map(attachment => {
                  const field = (selected.fields || []).find(item => item.id === attachment.fieldId)
                  return <a key={attachment.id} href={api.formAttachmentUrl(websiteId, selected.id, sub.id, attachment.id)}><b>{attachment.name}</b><small>{field?.label || 'Attachment'} · {attachment.mimeType || 'file'} · {attachmentSize(attachment.size)}</small></a>
                })}</div>}</div>
                <div className="submissionActions">
                  <select aria-label="Submission status" value={submissionStatuses.includes(sub.status) ? sub.status : 'New'} disabled={!canEdit || busy} onChange={event => updateSubmissionStatus(sub, event.target.value)}>{submissionStatuses.map(status => <option key={status}>{status}</option>)}</select>
                  {canEdit && <button type="button" disabled={busy} onClick={() => removeSubmission(sub)}>{submissionBusy ? 'Saving…' : 'Delete'}</button>}
                </div>
              </article>
            }) : <p>{allSubmissions.length ? 'No submissions match these filters.' : 'No submissions yet.'}</p>}
            {filteredSubmissions.length > 0 && <div className="submissionPagination">
              <button type="button" disabled={currentSubmissionPage <= 1} onClick={() => setSubmissionPage(page => Math.max(1, page - 1))}>Previous</button>
              <span>Page {currentSubmissionPage} of {submissionPageCount} · {filteredSubmissions.length} result{filteredSubmissions.length === 1 ? '' : 's'}</span>
              <button type="button" disabled={currentSubmissionPage >= submissionPageCount} onClick={() => setSubmissionPage(page => Math.min(submissionPageCount, page + 1))}>Next</button>
            </div>}
          </div>
        </aside>
      </section>
    </Layout>
  )
}
