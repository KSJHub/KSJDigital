import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { WebsiteCard } from '../components/UI.jsx'
import { api } from '../services/api.js'
import { addWebsite, getWebsites, removeWebsite, saveWebsite } from '../services/websites.js'

export function OwnerWebsitesPage() {
  const [websites, setWebsites] = useState(getWebsites)
  const [selectedId, setSelectedId] = useState(websites[0]?.id)
  const [form, setForm] = useState(websites[0] || {})
  const [notice, setNotice] = useState('Loading')
  const selected = websites.find(site => site.id === selectedId) || websites[0]

  function applyWebsiteState(nextWebsites, nextId = selectedId) {
    const next = nextWebsites.find(site => site.id === nextId) || nextWebsites[0] || {}

    setWebsites(nextWebsites)
    setSelectedId(next.id || '')
    setForm(next)
  }

  async function loadServerWebsites(nextId = selectedId) {
    try {
      const serverWebsites = await api.getWebsites()
      localStorage.setItem('ksjDigitalWebsites', JSON.stringify(serverWebsites))
      applyWebsiteState(serverWebsites, nextId)
      setNotice('Server synced')
    } catch {
      applyWebsiteState(getWebsites(), nextId)
      setNotice('Local mode')
    }
  }

  useEffect(() => {
    loadServerWebsites()
  }, [])

  function choose(site) {
    setSelectedId(site.id)
    setForm(site)
    setNotice('Ready')
  }

  function update(changes) {
    setForm(current => ({ ...current, ...changes }))
  }

  async function create() {
    const payload = { name: 'New Website', domain: 'new-website.co.uk', owner: 'Unassigned' }

    try {
      const created = await api.createWebsite(payload)
      const next = await api.getWebsites()
      localStorage.setItem('ksjDigitalWebsites', JSON.stringify(next))
      applyWebsiteState(next, created.id)
      setNotice('Website added')
    } catch {
      addWebsite(payload)
      applyWebsiteState(getWebsites(), 'new-website')
      setNotice('Website added locally')
    }
  }

  async function save() {
    if (!selected?.id) return

    try {
      const updated = await api.updateWebsite(selected.id, form)
      const next = websites.map(site => (site.id === selected.id ? updated : site))
      localStorage.setItem('ksjDigitalWebsites', JSON.stringify(next))
      applyWebsiteState(next, selected.id)
      setNotice('Website saved to server')
    } catch {
      const updated = saveWebsite(selected.id, form)
      applyWebsiteState(updated, selected.id)
      setNotice('Website saved locally')
    }
  }

  async function remove() {
    if (!selected?.id) return

    try {
      const result = await api.deleteWebsite(selected.id)
      localStorage.setItem('ksjDigitalWebsites', JSON.stringify(result.websites))
      applyWebsiteState(result.websites, result.websites[0]?.id)
      setNotice('Website removed from server')
    } catch {
      const remaining = removeWebsite(selected.id)
      applyWebsiteState(remaining, remaining[0]?.id)
      setNotice('Website removed locally')
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

          <label className="wideField">
            Notes
            <textarea value={form.notes || ''} onChange={event => update({ notes: event.target.value })} />
          </label>

          <div className="accountActions">
            <button onClick={save}>Save Website</button>
            <button onClick={() => (location.href = '/owner/clients')}>Manage Access</button>
            <button onClick={() => (location.href = '/client/website')}>Preview Client View</button>
            <button onClick={remove}>Delete Website</button>
          </div>
        </section>

        <aside className="card accountWebsites">
          <div className="panelHead">
            <h2>Preview</h2>
            <button>{form.status || 'Ready'}</button>
          </div>
          {form.id && <WebsiteCard site={form} active />}
          <div className="ruleGrid">
            <span>Website records now save into server-data/websites.json.</span>
            <span>Dashboard keeps a browser copy for fast loading.</span>
            <span>Deleting removes the server record.</span>
            <span>Source starter files are only defaults.</span>
          </div>
        </aside>
      </section>
    </Layout>
  )
}
