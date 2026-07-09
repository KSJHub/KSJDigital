import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import {
  addField,
  createForm,
  deleteField,
  deleteForm,
  getForms,
  moveField,
  submitTestForm,
  updateField,
  updateForm,
} from '../services/formBuilder.js'

const fieldTypes = ['Text', 'Email', 'Textarea', 'Phone', 'Select', 'Checkbox', 'Date', 'File']

function FieldPreview({ field }) {
  if (field.type === 'Textarea') return <textarea placeholder={field.placeholder} disabled />
  if (field.type === 'Checkbox')
    return (
      <label className="formCheck">
        <input type="checkbox" disabled /> {field.label}
      </label>
    )
  if (field.type === 'Select')
    return (
      <select disabled>
        <option>{field.placeholder || 'Choose an option'}</option>
      </select>
    )
  if (field.type === 'File') return <input type="file" disabled />
  return (
    <input
      type={field.type === 'Email' ? 'email' : field.type === 'Date' ? 'date' : 'text'}
      placeholder={field.placeholder}
      disabled
    />
  )
}

export function FormBuilderPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const websiteId = website?.id
  const [forms, setForms] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('Loading')
  const selected = forms.find(form => form.id === selectedId) || forms[0]

  useEffect(() => {
    if (!websiteId) return
    const next = getForms(websiteId)
    setForms(next)
    setSelectedId(next[0]?.id || '')
    setNotice('Ready')
  }, [websiteId])

  function refresh(nextId = selectedId, message = 'Saved') {
    if (!websiteId) return
    const next = getForms(websiteId)
    setForms(next)
    setSelectedId(next.find(form => form.id === nextId)?.id || next[0]?.id || '')
    setNotice(message)
  }

  function addForm() {
    if (!websiteId) return
    const form = createForm(websiteId)
    refresh(form.id, 'Form created')
  }

  function saveForm(changes) {
    if (!websiteId || !selected?.id) return
    updateForm(websiteId, selected.id, changes)
    refresh(selected.id, 'Form saved')
  }

  function removeForm() {
    if (!websiteId || !selected?.id) return
    deleteForm(websiteId, selected.id)
    refresh(undefined, 'Form deleted')
  }

  function addNewField(type) {
    if (!websiteId || !selected?.id) return
    addField(websiteId, selected.id, type)
    refresh(selected.id, `${type} field added`)
  }

  function editField(fieldId, changes) {
    if (!websiteId || !selected?.id) return
    updateField(websiteId, selected.id, fieldId, changes)
    refresh(selected.id, 'Field updated')
  }

  return (
    <Layout client={client} title="Forms">
      <section className="moduleHero card">
        <div>
          <span>Form Builder</span>
          <h2>{website?.name || 'Assigned Website'} Forms</h2>
          <p>
            Create contact, support, application and custom forms with delivery settings and spam
            protection.
          </p>
        </div>
        <button>{notice}</button>
      </section>
      <section className="formsGrid">
        <aside className="card formList">
          <div className="panelHead">
            <h2>Forms</h2>
            <button onClick={addForm} disabled={!websiteId}>Create</button>
          </div>
          {forms.map(form => (
            <button
              className={form.id === selectedId ? 'active' : ''}
              key={form.id}
              onClick={() => setSelectedId(form.id)}
            >
              <b>{form.name}</b>
              <small>
                {form.status} · {form.fields.length} fields
              </small>
            </button>
          ))}
          {!forms.length && <p className="emptyState">No forms loaded yet.</p>}
        </aside>
        <section className="card formEditor">
          <div className="panelHead">
            <h2>Form Settings</h2>
            <button
              disabled={!selected}
              onClick={() =>
                saveForm({ status: selected.status === 'Active' ? 'Draft' : 'Active' })
              }
            >
              {selected?.status || 'No form'}
            </button>
          </div>
          {selected && (
            <>
              <div className="formSettings">
                <label>
                  Name
                  <input
                    value={selected.name}
                    onChange={event => saveForm({ name: event.target.value })}
                  />
                </label>
                <label>
                  Email Destination
                  <input
                    value={selected.destination}
                    onChange={event => saveForm({ destination: event.target.value })}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={selected.status}
                    onChange={event => saveForm({ status: event.target.value })}
                  >
                    <option>Active</option>
                    <option>Draft</option>
                    <option>Archived</option>
                  </select>
                </label>
                <label className="formCheck">
                  <input
                    type="checkbox"
                    checked={selected.spamProtection}
                    onChange={event => saveForm({ spamProtection: event.target.checked })}
                  />{' '}
                  Spam protection
                </label>
              </div>
              <div className="fieldTypeBar">
                {fieldTypes.map(type => (
                  <button key={type} onClick={() => addNewField(type)}>
                    {type}
                  </button>
                ))}
              </div>
              {selected.fields.map(field => (
                <article className="fieldEditor" key={field.id}>
                  <div className="panelHead">
                    <h3>{field.type}</h3>
                    <div>
                      <button
                        onClick={() => {
                          moveField(websiteId, selected.id, field.id, 'up')
                          refresh(selected.id, 'Moved')
                        }}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => {
                          moveField(websiteId, selected.id, field.id, 'down')
                          refresh(selected.id, 'Moved')
                        }}
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => {
                          deleteField(websiteId, selected.id, field.id)
                          refresh(selected.id, 'Field removed')
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <label>
                    Label
                    <input
                      value={field.label}
                      onChange={event => editField(field.id, { label: event.target.value })}
                    />
                  </label>
                  <label>
                    Placeholder
                    <input
                      value={field.placeholder}
                      onChange={event => editField(field.id, { placeholder: event.target.value })}
                    />
                  </label>
                  <label className="formCheck">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={event => editField(field.id, { required: event.target.checked })}
                    />{' '}
                    Required
                  </label>
                </article>
              ))}
              <div className="formDanger">
                <button onClick={removeForm}>Delete Form</button>
              </div>
            </>
          )}
        </section>
        <aside className="card formPreview">
          <div className="panelHead">
            <h2>Preview</h2>
            <button
              disabled={!websiteId || !selected?.id}
              onClick={() => {
                submitTestForm(websiteId, selected.id)
                refresh(selected.id, 'Test submission added')
              }}
            >
              Test
            </button>
          </div>
          {selected && (
            <form>
              <h3>{selected.name}</h3>
              {selected.fields.map(field => (
                <label key={field.id}>
                  {field.type !== 'Checkbox' && (
                    <span>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </span>
                  )}
                  <FieldPreview field={field} />
                </label>
              ))}
              <button type="button">Submit</button>
            </form>
          )}
          <div className="submissions">
            <h3>Submissions</h3>
            {selected?.submissions?.length ? (
              selected.submissions.map(sub => (
                <p key={sub.id}>
                  <b>{sub.source}</b>
                  <small>{sub.createdAt}</small>
                </p>
              ))
            ) : (
              <p>No submissions yet.</p>
            )}
          </div>
        </aside>
      </section>
    </Layout>
  )
}
