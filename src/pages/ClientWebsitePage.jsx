import { useEffect, useState } from 'react'
import { SiteSettingsPanel } from '../components/SiteSettingsPanel.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'

function liveUrl(domain) {
  return domain?.startsWith('http') ? domain : `https://${domain}`
}

function assetOwnerId(website, accountId) {
  return website?.owner || accountId || website?.id || 'unassigned'
}

export function ClientWebsitePage() {
  const account = getAccountFromPath()
  const { websites, status } = useWebsites()
  const website = findClientWebsite(websites, account)
  const accountId = account?.id
  const websiteId = website?.id
  const websiteOwner = website?.owner
  const [content, setContent] = useState({ pages: [] })
  const [assets, setAssets] = useState([])
  const [contentStatus, setContentStatus] = useState('Loading content')
  const pages = content.pages || []

  useEffect(() => {
    if (!websiteId) return

    let cancelled = false

    async function loadWebsiteData() {
      try {
        const [contentRecord, assetRecords] = await Promise.all([
          api.getContent(websiteId),
          api.assets(assetOwnerId({ id: websiteId, owner: websiteOwner }, accountId), websiteId),
        ])

        if (cancelled) return
        setContent({ ...contentRecord, pages: contentRecord.pages || [] })
        setAssets(assetRecords)
        setContentStatus('API synced')
      } catch (error) {
        if (!cancelled) setContentStatus(error.message || 'API unavailable')
      }
    }

    loadWebsiteData()

    return () => {
      cancelled = true
    }
  }, [accountId, websiteId, websiteOwner])

  return (
    <Layout client title="My Website">
      <section className="clientSyncHero card websiteManagerHero brandedHero">
        <div>
          <span>Client Website Portal</span>
          <h2>{website?.name || 'Assigned Website'}</h2>
          <p>Manage your assigned website content and request updates through KSJ Digital.</p>
          <div className="brandActions">
            {website?.domain && (
              <a href={liveUrl(website.domain)} target="_blank" rel="noreferrer">
                Open Live Website
              </a>
            )}
            <button onClick={() => (location.href = '/client/editor')}>Edit Website</button>
          </div>
        </div>
        <div className="repoCard clientSummary brandCard">
          <div className="clientLogoMark">{website?.logo || 'KSJ'}</div>
          <b>{website?.status || 'Loading'}</b>
          <small>{website?.domain || 'Waiting for API website record'}</small>
          <small>{status}</small>
          <small>{contentStatus}</small>
        </div>
      </section>

      <section className="simpleWebsiteGrid">
        <div className="card managerPanel mainWork">
          <div className="panelHead">
            <h2>Pages</h2>
            <button onClick={() => (location.href = '/client/editor')}>Edit Content</button>
          </div>
          {pages.map((page, index) => (
            <article className="simplePageRow" key={page.id || page.slug || page.title}>
              <div>
                <b>{page.title}</b>
                <small>
                  {page.slug || (index === 0 ? '/' : '/' + page.title.toLowerCase())} ·{' '}
                  {page.status || 'Draft'}
                </small>
              </div>
              <span>{page.status === 'Published' ? 'Live' : page.status || 'Draft'}</span>
              <button onClick={() => (location.href = '/client/editor')}>Edit</button>
            </article>
          ))}
          {!pages.length && <p className="emptyState">No pages loaded from KSJ Digital yet.</p>}
        </div>
        <aside className="card managerPanel nextSteps">
          <h2>Website Actions</h2>
          <button onClick={() => (location.href = '/client/editor')}>Edit website pages</button>
          <button onClick={() => (location.href = '/client/media')}>Upload images</button>
          <button onClick={() => (location.href = '/client/publish')}>Request update</button>
          {website?.domain && <button onClick={() => window.open(liveUrl(website.domain), '_blank')}>Open live site</button>}
        </aside>
      </section>

      <section className="simpleWebsiteGrid">
        <SiteSettingsPanel website={website} />
        <div className="card managerPanel publishBox">
          <h2>Updates</h2>
          <p>
            Save your changes and request an update. KSJ Digital reviews everything before it goes
            live.
          </p>
          <div className="publishSteps">
            <span>1. Edit</span>
            <span>2. Save</span>
            <span>3. Request update</span>
            <span>4. KSJ approves</span>
          </div>
          <button onClick={() => (location.href = '/client/publish')}>Request Update</button>
        </div>
      </section>

      <section className="simpleWebsiteGrid">
        <div className="card managerPanel">
          <div className="panelHead">
            <h2>Brand & Media</h2>
            <button onClick={() => (location.href = '/client/media')}>Open Media</button>
          </div>
          <div className="miniMediaGrid">
            {assets.slice(0, 6).map(item => (
              <article key={item.id || item.url || item.name}>
                <b>{(item.slotId || item.name || 'AS').slice(0, 2).toUpperCase()}</b>
                <span>{item.name}</span>
              </article>
            ))}
          </div>
          {!assets.length && <p className="emptyState">No media loaded from KSJ Digital yet.</p>}
        </div>
      </section>
    </Layout>
  )
}
