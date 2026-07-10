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
  const website = findClientWebsite(websites, account)
  const websiteId = website?.id
  const canEdit = account?.role === 'owner' || account?.canEdit
  const [forms, setForms] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('Loading')
  const selected = forms.find(form => form.id === selectedId) || forms[0]

  async function loadForms(nextId = selectedId, message = canEdit ? 'Ready' : 'Preview only') {
    if (!websiteId) return
    try {
      const next = await api.getForms(websiteId)
      setForms(next)
      setSelectedId(next.find(form => form.id === nextId)?.id || next[0]?.id || '')
      setNotice(message)
    } catch (error) {
      setForms([])
      setSelectedId('')
      setNotice(error.message || 'Forms unavailable')
    }
  }

  useEffect(() => {
    loadForms('', canEdit ? 'Ready' : 'Preview only')
  }, [canEdit, websiteId])

  async function addForm() {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId) return
    setNotice('Creating form')
    try {
      const result = await api.createForm(websiteId, { name: 'New Form' })
      setForms(result.forms)
      setSelectedId(result.form.id)
      setNotice('Form created')
    } catch (error) {
      setNotice(error.message || 'Create failed')
    }
  }

  async function saveForm(changes) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id) return
    setNotice('Saving form')
    try {
      const next = await api.updateForm(websiteId, selected.id, changes)
      setForms(next)
      setSelectedId(selected.id)
      setNotice('Form saved')
    } catch (error) {
      setNotice(error.message || 'Save failed')
    }
  }

  async function removeForm() {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id) return
    setNotice('Deleting form')
    try {
      const next = await api.deleteForm(websiteId, selected.id)
      setForms(next)
      setSelectedId(next[0]?.id || '')
      setNotice('Form deleted')
    } catch (error) {
      setNotice(error.message || 'Delete failed')
    }
  }

  async function addNewField(type) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id) return
    setNotice('Adding field')
    try {
      const next = await api.addField(websiteId, selected.id, { type })
      setForms(next)
      setSelectedId(selected.id)
      setNotice(`${type} field added`)
    } catch (error) {
      setNotice(error.message || 'Add field failed')
    }
  }

  async function editField(fieldId, changes) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id) return
    setNotice('Saving field')
    try {
      const next = await api.updateField(websiteId, selected.id, fieldId, changes)
      setForms(next)
      setSelectedId(selected.id)
      setNotice('Field updated')
    } catch (error) {
      setNotice(error.message || 'Field save failed')
    }
  }

  async function removeField(fieldId) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id) return
    setNotice('Removing field')
    try {
      const next = await api.deleteField(websiteId, selected.id, fieldId)
      setForms(next)
      setSelectedId(selected.id)
      setNotice('Field removed')
    } catch (error) {
      setNotice(error.message || 'Remove failed')
    }
  }

  async function shiftField(fieldId, direction) {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id) return
    setNotice('Moving field')
    try {
      const next = await api.moveField(websiteId, selected.id, fieldId, direction)
      setForms(next)
      setSelectedId(selected.id)
      setNotice('Moved')
    } catch (error) {
      setNotice(error.message || 'Move failed')
    }
  }

  async function addTestSubmission() {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId || !selected?.id) return
    setNotice('Adding test submission')
    try {
      const next = await api.submitTestForm(websiteId, selected.id)
      setForms(next)
      setSelectedId(selected.id)
      setNotice('Test submission added')
    } catch (error) {
      setNotice(error.message || 'Test failed')
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
        <button>{notice}</button>
      </section>
      <section className="formsGrid">
        <aside className="card formList">
          <div className="panelHead"><h2>Forms</h2>{canEdit && <button onClick={addForm} disabled={!websiteId}>Create</button>}</div>
          {forms.map(form => <button className={form.id === selectedId ? 'active' : ''} key={form.id} onClick={() => setSelectedId(form.id)}><b>{form.name}</b><small>{form.status} · {form.fields.length} fields</small></button>)}
          {!forms.length && <p className="emptyState">No forms loaded yet.</p>}
        </aside>
        <section className="card formEditor">
          <div className="panelHead"><h2>{canEdit ? 'Form Settings' : 'Form Details'}</h2>{canEdit && <button disabled={!selected} onClick={() => saveForm({ status: selected.status === 'Active' ? 'Draft' : 'Active' })}>{selected?.status || 'No form'}</button>}</div>
          {selected && <>
            <div className="formSettings">
              <label>Name<input value={selected.name} disabled={!canEdit} onChange={event => saveForm({ name: event.target.value })} /></label>
              <label>Email Destination<input value={selected.destination} disabled={!canEdit} onChange={event => saveForm({ destination: event.target.value })} /></label>
              <label>Status<select value={selected.status} disabled={!canEdit} onChange={event => saveForm({ status: event.target.value })}><option>Active</option><option>Draft</option><option>Archived</option></select></label>
              <label className="formCheck"><input type="checkbox" checked={selected.spamProtection} disabled={!canEdit} onChange={event => saveForm({ spamProtection: event.target.checked })} /> Spam protection</label>
            </div>
            {canEdit && <div className="fieldTypeBar">{fieldTypes.map(type => <button key={type} onClick={() => addNewField(type)}>{type}</button>)}</div>}
            {selected.fields.map(field => <article className="fieldEditor" key={field.id}>
              <div className="panelHead"><h3>{field.type}</h3>{canEdit && <div><button onClick={() => shiftField(field.id, 'up')}>↑</button><button onClick={() => shiftField(field.id, 'down')}>↓</button><button onClick={() => removeField(field.id)}>Remove</button></div>}</div>
              <label>Label<input value={field.label} disabled={!canEdit} onChange={event => editField(field.id, { label: event.target.value })} /></label>
              <label>Placeholder<input value={field.placeholder} disabled={!canEdit} onChange={event => editField(field.id, { placeholder: event.target.value })} /></label>
              <label className="formCheck"><input type="checkbox" checked={field.required} disabled={!canEdit} onChange={event => editField(field.id, { required: event.target.checked })} /> Required</label>
            </article>)}
            {canEdit && <div className="formDanger"><button onClick={removeForm}>Delete Form</button></div>}
          </>}
        </section>
        <aside className="card formPreview">
          <div className="panelHead"><h2>Preview</h2>{canEdit && <button disabled={!websiteId || !selected?.id} onClick={addTestSubmission}>Test</button>}</div>
          {selected && <form><h3>{selected.name}</h3>{selected.fields.map(field => <label key={field.id}>{field.type !== 'Checkbox' && <span>{field.label}{field.required ? ' *' : ''}</span>}<FieldPreview field={field} /></label>)}<button type="button">Submit</button></form>}
          <div className="submissions"><h3>Submissions</h3>{selected?.submissions?.length ? selected.submissions.map(sub => <p key={sub.id}><b>{sub.source}</b><small>{sub.createdAt}</small></p>) : <p>No submissions yet.</p>}</div>
        </aside>
      </section>
    </Layout>
  )
}
