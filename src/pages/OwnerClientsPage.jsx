import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { useClients } from '../hooks/useClients.js'
import { useWebsites } from '../hooks/useWebsites.js'

const PLATFORM_ACCOUNT_ID = 'morgan'

function normaliseClient(client = {}) {
  const platformOwner = client.id === PLATFORM_ACCOUNT_ID
  return {
    id: client.id || '',
    name: platformOwner ? 'KSJ Digital' : (client.name || ''),
    email: client.email || '',
    role: platformOwner ? 'Platform Owner' : (client.roleLabel || 'Website Owner'),
    websiteIds: client.websiteIds || [],
    status: client.status || 'Draft',
    access: platformOwner ? 'Platform administration' : (client.access || 'Full website access'),
    canEdit: client.canEdit ?? true,
    canManagePages: client.canManagePages ?? false,
    canManageMedia: client.canManageMedia ?? true,
    canRequestUpdates: client.canRequestUpdates ?? true,
    canViewSupport: client.canViewSupport ?? true,
  }
}

function websiteNameList(websites, ids = []) {
  if (!ids.length) return 'No websites assigned'
  return ids.map(id => websites.find(site => site.id === id)?.name || id).join(', ')
}

export function OwnerClientsPage() {
  const { clients, refresh, status, setStatus } = useClients()
  const { websites } = useWebsites()
  const [selectedId, setSelectedId] = useState(clients[0]?.id || '')
  const [form, setForm] = useState(normaliseClient(clients[0]))
  const selected = clients.find(client => client.id === selectedId) || clients[0]
  const platformAccount = selected?.id === PLATFORM_ACCOUNT_ID

  useEffect(() => {
    const next = clients.find(client => client.id === selectedId) || clients[0]
    if (next) {
      setSelectedId(next.id)
      setForm(normaliseClient(next))
    } else {
      setSelectedId('')
      setForm(normaliseClient())
    }
  }, [clients, selectedId])

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
      name: 'New Website User',
      email: 'client@example.com',
      websiteIds: [],
      status: 'Draft',
      role: 'client',
      roleLabel: 'Website Owner',
      access: 'Full website access',
      canEdit: true,
      canManagePages: false,
      canManageMedia: true,
      canRequestUpdates: true,
      canViewSupport: true,
    }

    try {
      const created = await api.createClient(payload)
      const records = await refresh()
      setSelectedId(created.id)
      setForm(normaliseClient(records.find(client => client.id === created.id) || created))
      setStatus('Website user added')
    } catch (error) {
      setStatus(error.message)
    }
  }

  async function save() {
    if (!selected?.id) return

    const roleLabel = platformAccount ? 'Platform Owner' : form.role
    const payload = {
      ...form,
      name: platformAccount ? 'KSJ Digital' : form.name,
      displayName: platformAccount ? 'KSJ Digital' : form.name,
      role: platformAccount ? 'owner' : 'client',
      roleLabel,
      access: platformAccount ? 'Platform administration' : form.access,
      websiteId: form.websiteIds?.[0] || '',
    }

    try {
      const updated = await api.updateClient(selected.id, payload)
      const records = await refresh()
      setSelectedId(updated.id)
      setForm(normaliseClient(records.find(client => client.id === updated.id) || updated))
      setStatus('Account access saved — user must sign in again')
    } catch (error) {
      setStatus(error.message)
    }
  }

  async function remove() {
    if (!selected?.id || platformAccount) return

    try {
      const result = await api.deleteClient(selected.id)
      window.dispatchEvent(new CustomEvent('ksj-clients-updated', { detail: result.clients }))
      const next = result.clients[0]
      setSelectedId(next?.id || '')
      setForm(normaliseClient(next))
      setStatus('Website user deleted')
    } catch (error) {
      setStatus(error.message)
    }
  }

  function toggleWebsite(id) {
    const ids = new Set(form.websiteIds || [])
    ids.has(id) ? ids.delete(id) : ids.add(id)
    updateForm({ websiteIds: [...ids] })
  }

  return (
    <Layout title="Website Access">
      <section className="moduleHero card">
        <div>
          <span>KSJ Digital Control</span>
          <h2>Website Users & Access</h2>
          <p>Roles define what a user can do. The website access tick boxes define exactly where they can do it.</p>
        </div>
        <button onClick={add}>Add Website User</button>
      </section>

      <section className="accountGrid">
        <aside className="card accountList">
          <div className="panelHead"><h2>Accounts</h2><button onClick={add}>Add</button></div>
          {clients.map(client => (
            <button className={client.id === selectedId ? 'active' : ''} key={client.id} onClick={() => choose(client)}>
              <b>{client.id === PLATFORM_ACCOUNT_ID ? 'KSJ Digital' : client.name}</b>
              <small>{client.email}</small>
              <span>{client.id === PLATFORM_ACCOUNT_ID ? 'Platform Owner' : (client.roleLabel || 'Website Owner')}</span>
            </button>
          ))}
        </aside>

        <section className="card accountEditor">
          <div className="panelHead"><h2>Edit Account</h2><button>{status}</button></div>
          <div className="accountForm">
            <label>Name<input value={form.name || ''} disabled={platformAccount} onChange={event => updateForm({ name: event.target.value })} /></label>
            <label>Email<input value={form.email || ''} onChange={event => updateForm({ email: event.target.value })} /></label>
            <label>Status<select value={form.status || 'Draft'} onChange={event => updateForm({ status: event.target.value })}><option>Active</option><option>Draft</option><option>Preparing</option><option>Suspended</option></select></label>
            <label>Role<select value={form.role} disabled={platformAccount} onChange={event => updateForm({ role: event.target.value })}><option>Website Owner</option><option>Website Manager</option><option>Website Editor</option><option>Viewer</option>{platformAccount && <option>Platform Owner</option>}</select></label>
            <label>Access Level<select value={form.access} disabled={platformAccount} onChange={event => updateForm({ access: event.target.value })}><option>Full website access</option><option>Website editor</option><option>Media only</option><option>Read only</option>{platformAccount && <option>Platform administration</option>}</select></label>
          </div>

          <div className="permissionGrid">
            <label><input type="checkbox" checked={!!form.canEdit} disabled={platformAccount} onChange={event => updateForm({ canEdit: event.target.checked })} />Can edit page content</label>
            <label><input type="checkbox" checked={!!form.canManagePages} disabled={platformAccount} onChange={event => updateForm({ canManagePages: event.target.checked })} />Can create and manage pages</label>
            <label><input type="checkbox" checked={!!form.canManageMedia} disabled={platformAccount} onChange={event => updateForm({ canManageMedia: event.target.checked })} />Can manage branding and media</label>
            <label><input type="checkbox" checked={!!form.canRequestUpdates} disabled={platformAccount} onChange={event => updateForm({ canRequestUpdates: event.target.checked })} />Can submit changes</label>
            <label><input type="checkbox" checked={!!form.canViewSupport} disabled={platformAccount} onChange={event => updateForm({ canViewSupport: event.target.checked })} />Can use support</label>
          </div>

          <div className="accountActions">
            <button onClick={save} disabled={!selected?.id}>Save Account</button>
            <button onClick={remove} disabled={!selected?.id || platformAccount}>Delete Account</button>
          </div>
        </section>

        <aside className="card accountWebsites">
          <div className="panelHead"><h2>Website Access</h2><button onClick={save} disabled={!selected?.id}>Apply</button></div>
          <p>Only ticked websites are returned to this account and available throughout the portal.</p>
          {websites.map(site => (
            <label key={site.id}>
              <input type="checkbox" checked={(form.websiteIds || []).includes(site.id)} onChange={() => toggleWebsite(site.id)} />
              <span><b>{site.name}</b><small>{site.domain}</small></span>
            </label>
          ))}
        </aside>
      </section>

      <section className="accountGrid bottomGrid">
        <section className="card accessPanel">
          <div className="panelHead"><h2>Current Access Summary</h2><button>Authoritative</button></div>
          <div className="ruleGrid">
            <span>{form.name || 'User'} can access: {websiteNameList(websites, form.websiteIds)}</span>
            <span>Role: {form.role}</span>
            <span>Page management: {form.canManagePages ? 'Enabled' : 'Disabled'}</span>
            <span>Status: {form.status || 'Draft'}</span>
          </div>
        </section>
      </section>
    </Layout>
  )
}
