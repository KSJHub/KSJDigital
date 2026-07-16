import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { WebsiteCard } from '../components/UI.jsx'
import { api } from '../services/api.js'

const CLIENT_TOOLS = [
  { id: 'website', label: 'Website Editing', description: 'Pages, navigation, header, footer and website updates.' },
  { id: 'media', label: 'Media Library', description: 'Upload and manage website images and documents.' },
  { id: 'forms', label: 'Forms', description: 'Create and manage website forms and enquiries.' },
  { id: 'commerce', label: 'Shop & Orders', description: 'Products, stock, orders and payment settings.' },
  { id: 'team', label: 'Team', description: 'Allow the website owner to manage their own team.' },
  { id: 'support', label: 'KSJ Support', description: 'Open and reply to support requests.' },
]

const ALL_CLIENT_TOOLS = CLIENT_TOOLS.map(tool => tool.id)

function orderPrefix(value = '') {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function normaliseCapabilities(value) {
  if (!Array.isArray(value) || !value.length) return [...ALL_CLIENT_TOOLS]
  const allowed = new Set(ALL_CLIENT_TOOLS)
  return [...new Set(value.filter(item => allowed.has(item)))]
}

export function OwnerWebsitesPage() {
  const [websites, setWebsites] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState({})
  const [notice, setNotice] = useState('Loading')
  const selected = websites.find(site => site.id === selectedId) || websites[0]

  function websiteForm(site = {}) {
    return { ...site, capabilities: normaliseCapabilities(site.capabilities) }
  }

  function applyWebsiteState(nextWebsites, nextId = selectedId) {
    const next = nextWebsites.find(site => site.id === nextId) || nextWebsites[0] || {}

    setWebsites(nextWebsites)
    setSelectedId(next.id || '')
    setForm(websiteForm(next))
    window.dispatchEvent(new CustomEvent('ksj-websites-updated', { detail: nextWebsites }))
  }

  async function loadServerWebsites(nextId = selectedId) {
    try {
      const serverWebsites = await api.getWebsites()
      applyWebsiteState(serverWebsites, nextId)
      setNotice('Server synced')
    } catch (error) {
      applyWebsiteState([], '')
      setNotice(error.message || 'API unavailable')
    }
  }

  useEffect(() => {
    loadServerWebsites()
  }, [])

  function choose(site) {
    setSelectedId(site.id)
    setForm(websiteForm(site))
    setNotice('Ready')
  }

  function update(changes) {
    setForm(current => ({ ...current, ...changes }))
  }

  function toggleCapability(capability) {
    setForm(current => {
      const enabled = new Set(normaliseCapabilities(current.capabilities))
      if (enabled.has(capability)) enabled.delete(capability)
      else enabled.add(capability)
      return { ...current, capabilities: [...enabled] }
    })
    setNotice('Unsaved changes')
  }

  async function create() {
    const payload = {
      name: 'New Website',
      domain: 'new-website.co.uk',
      owner: 'Unassigned',
      orderPrefix: 'WEB',
      capabilities: [...ALL_CLIENT_TOOLS],
    }

    try {
      const created = await api.createWebsite(payload)
      const next = await api.getWebsites()
      applyWebsiteState(next, created.id)
      setNotice('Website added')
    } catch (error) {
      setNotice(error.message || 'Create failed')
    }
  }

  async function save() {
    if (!selected?.id) return

    try {
      const payload = { ...form, capabilities: normaliseCapabilities(form.capabilities) }
      const updated = await api.updateWebsite(selected.id, payload)
      const next = websites.map(site => (site.id === selected.id ? updated : site))
      applyWebsiteState(next, selected.id)
      setNotice('Website saved to server')
    } catch (error) {
      setNotice(error.message || 'Save failed')
    }
  }

  async function remove() {
    if (!selected?.id) return

    try {
      const result = await api.deleteWebsite(selected.id)
      applyWebsiteState(result.websites, result.websites[0]?.id)
      setNotice('Website removed from server')
    } catch (error) {
      setNotice(error.message || 'Delete failed')
    }
  }

  return (
    <Layout title="Websites">
      <section className="websitesHero card">
        <div>
          <span>Owner Control</span>
          <h2>Website Management</h2>
          <p>Add, edit, remove and control every website managed by KSJ Digital.</p>
        </div>
        <button onClick={create}>Add Website</button>
      </section>

      <section className="websiteAdminGrid">
        <aside className="card accountList">
          <div className="panelHead">
            <h2>Websites</h2>
            <button onClick={create}>Add</button>
          </div>
          {websites.map(site => (
            <button
              className={site.id === selectedId ? 'active' : ''}
              key={site.id}
              onClick={() => choose(site)}
            >
              <b>{site.name}</b>
              <small>{site.domain}</small>
              <span>{site.status}</span>
            </button>
          ))}
          {!websites.length && <p className="emptyState">No websites loaded from the API.</p>}
        </aside>

        <section className="card accountEditor">
          <div className="panelHead">
            <h2>Edit Website</h2>
            <button>{notice}</button>
          </div>

          <div className="accountForm">
            <label>
              Name
              <input value={form.name || ''} onChange={event => update({ name: event.target.value })} />
            </label>
            <label>
              Domain
              <input value={form.domain || ''} onChange={event => update({ domain: event.target.value })} />
            </label>
            <label>
              Order Prefix
              <input
                value={form.orderPrefix || ''}
                maxLength="6"
                placeholder="TAJ"
                onChange={event => update({ orderPrefix: orderPrefix(event.target.value) })}
              />
              <small>2–6 unique letters or numbers. Example: TAJ-HOODIE-2026-000001.</small>
            </label>
            <label>
              Owner
              <input value={form.owner || ''} onChange={event => update({ owner: event.target.value })} />
            </label>
            <label>
              Status
              <select
                value={form.status || 'Draft'}
                onChange={event => update({ status: event.target.value })}
              >
                <option>Live</option>
                <option>Draft</option>
                <option>Coming Soon</option>
                <option>In Development</option>
                <option>Maintenance</option>
                <option>Archived</option>
              </select>
            </label>
            <label>
              Plan
              <select value={form.plan || 'Build'} onChange={event => update({ plan: event.target.value })}>
                <option>Build</option>
                <option>Launch</option>
                <option>Premium</option>
                <option>Maintenance</option>
              </select>
            </label>
            <label>
              Repository
              <input
                value={form.repository || ''}
                onChange={event => update({ repository: event.target.value })}
              />
            </label>
            <label>
              Pages
              <input
                type="number"
                value={form.pageCount || 0}
                onChange={event => update({ pageCount: Number(event.target.value) })}
              />
            </label>
            <label>
              Media
              <input
                type="number"
                value={form.mediaCount || 0}
                onChange={event => update({ mediaCount: Number(event.target.value) })}
              />
            </label>
            <label>
              SEO
              <input
                type="number"
                value={form.seo || 0}
                onChange={event => update({ seo: Number(event.target.value) })}
              />
            </label>
            <label>
              Speed
              <input
                type="number"
                value={form.performance || 0}
                onChange={event => update({ performance: Number(event.target.value) })}
              />
            </label>
          </div>

          <fieldset className="clientToolsFieldset">
            <legend>Client Workspace Tools</legend>
            <p>Choose what this website’s client and team can manage. Disabled tools disappear from their portal and cannot be opened directly.</p>
            <div className="clientToolsGrid">
              {CLIENT_TOOLS.map(tool => {
                const enabled = normaliseCapabilities(form.capabilities).includes(tool.id)
                return (
                  <label className={enabled ? 'clientTool enabled' : 'clientTool'} key={tool.id}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleCapability(tool.id)}
                    />
                    <span>
                      <b>{tool.label}</b>
                      <small>{tool.description}</small>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <label className="wideField">
            Notes
            <textarea value={form.notes || ''} onChange={event => update({ notes: event.target.value })} />
          </label>

          <div className="accountActions">
            <button onClick={save} disabled={!selected?.id}>Save Website</button>
            <button onClick={() => (location.href = '/owner/clients')}>Manage Access</button>
            <button onClick={() => (location.href = '/client/website')}>Preview Client View</button>
            <button onClick={remove} disabled={!selected?.id}>Delete Website</button>
          </div>
        </section>

        <aside className="card accountWebsites">
          <div className="panelHead">
            <h2>Preview</h2>
            <button>{form.status || 'Ready'}</button>
          </div>
          {form.id && <WebsiteCard site={form} active />}
          <div className="ruleGrid">
            <span>Order prefix: {form.orderPrefix || 'Not set'}</span>
            <span>Client tools enabled: {normaliseCapabilities(form.capabilities).length}</span>
            <span>Each website prefix must be unique.</span>
            <span>The API is the owner website source of truth.</span>
          </div>
        </aside>
      </section>
    </Layout>
  )
}
