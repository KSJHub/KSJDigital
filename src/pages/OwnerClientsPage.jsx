import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { useClients } from '../hooks/useClients.js'
import { useWebsites } from '../hooks/useWebsites.js'

function normaliseClient(client = {}) {
  return {
    id: client.id || '',
    name: client.name || '',
    email: client.email || '',
    accessCode: client.accessCode || '',
    role: client.role || 'Client',
    websiteIds: client.websiteIds || [],
    status: client.status || 'Draft',
    access: client.access || 'Website editor',
    canEdit: client.canEdit ?? true,
    canManageMedia: client.canManageMedia ?? true,
    canRequestUpdates: client.canRequestUpdates ?? true,
    canViewSupport: client.canViewSupport ?? true,
  }
}

function createAccessCode() {
  return `ksj-${Math.random().toString(36).slice(2, 8)}`
}

export function OwnerClientsPage() {
  const { clients, refresh, status, setStatus } = useClients()
  const { websites } = useWebsites()
  const [selectedId, setSelectedId] = useState(clients[0]?.id || '')
  const [form, setForm] = useState(normaliseClient(clients[0]))
  const selected = clients.find(client => client.id === selectedId) || clients[0]

  useEffect(() => {
    const next = clients.find(client => client.id === selectedId) || clients[0]
    if (next) {
      setSelectedId(next.id)
      setForm(normaliseClient(next))
    }
  }, [clients])

  function choose(client) {
    setSelectedId(client.id)
    setForm(normaliseClient(client))
    setStatus('Ready')
  }

  function updateForm(changes) {
    setForm(current => ({ ...current, ...changes }))
  }

  async function add() {
    const payload = {
      name: 'New Client',
      email: 'client@example.com',
      accessCode: createAccessCode(),
      websiteIds: websites[0]?.id ? [websites[0].id] : [],
      status: 'Draft',
    }

    try {
      const created = await api.createClient(payload)
      const records = await refresh()
      setSelectedId(created.id)
      setForm(normaliseClient(records.find(client => client.id === created.id) || created))
      setStatus('Client added')
    } catch (error) {
      setStatus(error.message)
    }
  }

  async function save() {
    if (!selected?.id) return

    try {
      const updated = await api.updateClient(selected.id, form)
      const records = await refresh()
      setSelectedId(updated.id)
      setForm(normaliseClient(records.find(client => client.id === updated.id) || updated))
      setStatus('Client saved to server')
    } catch (error) {
      setStatus(error.message)
    }
  }

  async function remove() {
    if (!selected?.id) return

    try {
      const result = await api.deleteClient(selected.id)
      localStorage.setItem('ksjDigitalClients', JSON.stringify(result.clients))
      window.dispatchEvent(new CustomEvent('ksj-clients-updated', { detail: result.clients }))
      const next = result.clients[0]
      setSelectedId(next?.id || '')
      setForm(normaliseClient(next))
      setStatus('Client deleted from server')
    } catch (error) {
      setStatus(error.message)
    }
  }

  function toggleWebsite(id) {
    const ids = new Set(form.websiteIds || [])
    ids.has(id) ? ids.delete(id) : ids.add(id)
    updateForm({ websiteIds: [...ids] })
  }

  function resetAccess() {
    const accessCode = createAccessCode()
    updateForm({ accessCode })
    setStatus(`New access code: ${accessCode}`)
  }

  function emailClient() {
    setStatus(`Email ${form.email || 'client'} with access code ${form.accessCode || 'not set'}`)
  }

  return (
    <Layout title="Clients">
      <section className="moduleHero card">
        <div>
          <span>Owner Control</span>
          <h2>Client Access Management</h2>
          <p>Add, edit and remove clients using the backend client data source.</p>
        </div>
        <button onClick={add}>Add Client</button>
      </section>

      <section className="accountGrid">
        <aside className="card accountList">
          <div className="panelHead">
            <h2>Accounts</h2>
            <button onClick={add}>Add</button>
          </div>
          {clients.map(client => (
            <button
              className={client.id === selectedId ? 'active' : ''}
              key={client.id}
              onClick={() => choose(client)}
            >
              <b>{client.name}</b>
              <small>{client.email}</small>
              <span>{client.status}</span>
            </button>
          ))}
        </aside>

        <section className="card accountEditor">
          <div className="panelHead">
            <h2>Edit Account</h2>
            <button>{status}</button>
          </div>

          <div className="accountForm">
            <label>
              Name
              <input value={form.name || ''} onChange={event => updateForm({ name: event.target.value })} />
            </label>
            <label>
              Email
              <input value={form.email || ''} onChange={event => updateForm({ email: event.target.value })} />
            </label>
            <label>
              Access Code
              <input
                value={form.accessCode || ''}
                onChange={event => updateForm({ accessCode: event.target.value })}
              />
            </label>
            <label>
              Status
              <select value={form.status || 'Draft'} onChange={event => updateForm({ status: event.target.value })}>
                <option>Active</option>
                <option>Draft</option>
                <option>Preparing</option>
                <option>Suspended</option>
              </select>
            </label>
            <label>
              Role
              <select value={form.role || 'Client'} onChange={event => updateForm({ role: event.target.value })}>
                <option>Client</option>
                <option>Owner</option>
                <option>Viewer</option>
              </select>
            </label>
            <label>
              Access Level
              <select value={form.access || 'Website editor'} onChange={event => updateForm({ access: event.target.value })}>
                <option>Website editor</option>
                <option>Media only</option>
                <option>Read only</option>
                <option>Full owner access</option>
              </select>
            </label>
          </div>

          <div className="permissionGrid">
            <label>
              <input
                type="checkbox"
                checked={!!form.canEdit}
                onChange={event => updateForm({ canEdit: event.target.checked })}
              />
              Can edit pages
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!form.canManageMedia}
                onChange={event => updateForm({ canManageMedia: event.target.checked })}
              />
              Can manage media
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!form.canRequestUpdates}
                onChange={event => updateForm({ canRequestUpdates: event.target.checked })}
              />
              Can request updates
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!form.canViewSupport}
                onChange={event => updateForm({ canViewSupport: event.target.checked })}
              />
              Can use support
            </label>
          </div>

          <div className="accountActions">
            <button onClick={save}>Save Account</button>
            <button onClick={resetAccess}>Reset Access</button>
            <button onClick={emailClient}>Prepare Email</button>
            <button onClick={remove}>Delete Account</button>
          </div>
        </section>

        <aside className="card accountWebsites">
          <div className="panelHead">
            <h2>Website Access</h2>
            <button onClick={save}>Apply</button>
          </div>
          {websites.map(site => (
            <label key={site.id}>
              <input
                type="checkbox"
                checked={(form.websiteIds || []).includes(site.id)}
                onChange={() => toggleWebsite(site.id)}
              />
              <span>
                <b>{site.name}</b>
                <small>{site.domain}</small>
              </span>
            </label>
          ))}
        </aside>
      </section>
    </Layout>
  )
}
