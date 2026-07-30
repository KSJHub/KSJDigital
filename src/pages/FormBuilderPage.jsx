import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { api } from '../services/api.js'

const fieldTypes = ['Text', 'Email', 'Textarea', 'Phone', 'Select', 'Checkbox', 'Date', 'File']

function FieldPreview({ field }) {
  if (field.type === 'Textarea') return <textarea placeholder={field.placeholder} disabled />
  if (field.type === 'Checkbox') return <label className="formCheck"><input type="checkbox" disabled /> {field.label}</label>
  if (field.type === 'Select') return <select disabled><option>{field.placeholder || 'Choose an option'}</option></select>
  if (field.type === 'File') return <input type="file" disabled />
  return <input type={field.type === 'Email' ? 'email' : field.type === 'Date' ? 'date' : 'text'} placeholder={field.placeholder} disabled />
}

export function FormBuilderPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('')
  const website = account?.role === 'owner'
    ? websites.find(site => site.id === selectedWebsiteId) || websites[0] || null
    : assignedWebsite
  const websiteId = website?.id
  const canEdit = account?.role === 'owner' || account?.canEdit
  const [forms, setForms] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('Loading')
  const [busyAction, setBusyAction] = useState('')
  const selected = forms.find(form => form.id === selectedId) || forms[0]
  const busy = Boolean(busyAction)

  useEffect(() => {
    if (account?.role === 'owner' && !selectedWebsiteId && websites[0]?.id) setSelectedWebsiteId(websites[0].id)
  }, [account?.role, selectedWebsiteId, websites])

  async function loadForms(nextId = selectedId, message = canEdit ? 'Ready' : 'Preview only') {
    if (!websiteId) {
      setForms([])
      setSelectedId('')
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
      setNotice(error.message || 'Forms unavailable')
    }
  }

  useEffect(() => {
    setBusyAction('')
    loadForms('', canEdit ? 'Ready' : 'Preview only')
  }, [canEdit, websiteId])

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
    if (!globalThis.confirm(`Delete “${selected.name || 'this form'}”? Its configured fields and stored test submissions will be removed. This action cannot be undone.`)) return
    const formId = selected.id
    setBusyAction('delete-form')
    setNotice('Deleting form')
    try {
      const next = await api.deleteForm(websiteId, formId)
      setForms(next)
      setSelectedId(next[0]?.id || '')
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
    setNotice('Adding test submission')
    try {
      const next = await api.submitTestForm(websiteId, formId)
      setForms(next)
      setSelectedId(formId)
      setNotice('Test submission added')
    } catch (error) {
      setNotice(error.message || 'Test failed')
    } finally {
      setBusyAction('')
    }
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

      {account?.role === 'owner' && websites.length > 1 && <section className="card formSettings">
        <label>Website<select value={websiteId || ''} disabled={busy} onChange={event => { setSelectedWebsiteId(event.target.value); setSelectedId('') }}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
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
          <div className="panelHead"><h2>Preview</h2>{canEdit && <button disabled={!websiteId || !selected?.id || busy} onClick={addTestSubmission}>{busyAction === 'test' ? 'Testing…' : 'Test'}</button>}</div>
          {selected && <form onSubmit={event => event.preventDefault()}><h3>{selected.name}</h3>{(selected.fields || []).map(field => <label key={field.id}>{field.type !== 'Checkbox' && <span>{field.label}{field.required ? ' *' : ''}</span>}<FieldPreview field={field} /></label>)}<button type="button" disabled>Submit</button></form>}
          <div className="submissions"><h3>Submissions</h3>{selected?.submissions?.length ? selected.submissions.map(sub => <p key={sub.id}><b>{sub.source}</b><small>{sub.createdAt}</small></p>) : <p>No submissions yet.</p>}</div>
        </aside>
      </section>
    </Layout>
  )
}
