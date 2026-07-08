import { SiteSettingsPanel } from '../components/SiteSettingsPanel.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { Layout } from '../layouts/Shell.jsx'
import { getClientWebsite, getMediaItems, getWebsitePages } from '../services/platform.js'

function liveUrl(domain) {
  return domain?.startsWith('http') ? domain : `https://${domain}`
}

export function ClientWebsitePage() {
  const account = getAccountFromPath()
  const { websites, status } = useWebsites()
  const website = findClientWebsite(websites, account) || getClientWebsite()
  const pages = getWebsitePages()
  const mediaItems = getMediaItems()

  return (
    <Layout client title="My Website">
      <section className="clientSyncHero card websiteManagerHero brandedHero">
        <div>
          <span>Client Website Portal</span>
          <h2>{website.name}</h2>
          <p>Manage your assigned website content and request updates through KSJ Digital.</p>
          <div className="brandActions">
            <a href={liveUrl(website.domain)} target="_blank" rel="noreferrer">
              Open Live Website
            </a>
            <button onClick={() => (location.href = '/client/editor')}>Edit Website</button>
          </div>
        </div>
        <div className="repoCard clientSummary brandCard">
          <div className="clientLogoMark">{website.logo}</div>
          <b>{website.status}</b>
          <small>{website.domain}</small>
          <small>{status}</small>
        </div>
      </section>

      <section className="simpleWebsiteGrid">
        <div className="card managerPanel mainWork">
          <div className="panelHead">
            <h2>Pages</h2>
            <button onClick={() => (location.href = '/client/editor')}>Edit Content</button>
          </div>
          {pages.map((page, index) => (
            <article className="simplePageRow" key={page}>
              <div>
                <b>{page}</b>
                <small>
                  {index === 0 ? '/' : '/' + page.toLowerCase()} ·{' '}
                  {index < 5 ? 'Published' : 'Draft'}
                </small>
              </div>
              <span>{index < 5 ? 'Live' : 'Draft'}</span>
              <button onClick={() => (location.href = '/client/editor')}>Edit</button>
            </article>
          ))}
        </div>
        <aside className="card managerPanel nextSteps">
          <h2>Website Actions</h2>
          <button onClick={() => (location.href = '/client/editor')}>Edit website pages</button>
          <button onClick={() => (location.href = '/client/media')}>Upload images</button>
          <button onClick={() => (location.href = '/client/publish')}>Request update</button>
          <button onClick={() => window.open(liveUrl(website.domain), '_blank')}>Open live site</button>
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
            {mediaItems.slice(0, 6).map(item => (
              <article key={item}>
                <b>{item.slice(0, 2).toUpperCase()}</b>
                <span>{item}</span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  )
}
