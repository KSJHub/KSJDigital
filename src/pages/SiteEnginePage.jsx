import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

const defaultSiteEngine = {
  navigation: [
    { id: 'nav-home', label: 'Home', target: '/', visible: true, external: false, order: 1 },
    { id: 'nav-about', label: 'About', target: '/about', visible: true, external: false, order: 2 },
    { id: 'nav-community', label: 'Community', target: '/community', visible: true, external: false, order: 3 },
    { id: 'nav-contact', label: 'Contact', target: '/contact', visible: true, external: false, order: 4 },
  ],
  theme: {
    mode: 'Dark',
    primary: '#157bff',
    secondary: '#9434e8',
    background: '#05070d',
    text: '#ffffff',
    radius: 18,
    buttonStyle: 'Gradient',
    font: 'Inter',
    spacing: 'Comfortable',
  },
  globals: {
    announcement: 'Welcome to the official website.',
    footerText: 'Powered by KSJ Digital',
    cookieBanner: true,
    maintenanceMode: false,
    notFoundTitle: 'Page not found',
  },
  seo: {
    siteTitle: 'Website managed by KSJ Digital',
    description: 'Official website managed through the KSJ Digital client portal.',
    keywords: 'gaming, community, website',
    ogImage: '',
    robots: 'index,follow',
  },
  settings: {
    domain: '',
    ssl: 'Pending',
    branch: 'main',
    publishMethod: 'GitHub + VPS',
    analyticsId: '',
    backupStatus: 'Ready',
  },
}

function normaliseSiteEngine(content = {}) {
  return {
    ...defaultSiteEngine,
    ...(content.engine || {}),
    navigation: content.engine?.navigation || content.navigation || defaultSiteEngine.navigation,
    theme: { ...defaultSiteEngine.theme, ...(content.engine?.theme || content.theme || {}) },
    globals: { ...defaultSiteEngine.globals, ...(content.engine?.globals || content.globals || {}) },
    seo: { ...defaultSiteEngine.seo, ...(content.engine?.seo || content.seo || {}) },
    settings: { ...defaultSiteEngine.settings, ...(content.engine?.settings || content.settings || {}) },
  }
}

function buildSiteExport(website, content = {}, config = normaliseSiteEngine(content)) {
  return {
    website: {
      id: website?.id,
      name: website?.name,
      domain: website?.domain,
      status: website?.status,
    },
    navigation: (config.navigation || []).filter(item => item.visible).sort((a, b) => a.order - b.order),
    theme: config.theme,
    globals: config.globals,
    seo: config.seo,
    settings: config.settings,
    pages: content.pages || [],
    exportedAt: new Date().toISOString(),
  }
}

function sortNav(items = []) {
  return [...items].sort((a, b) => a.order - b.order)
}

export function SiteEnginePage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const websiteId = website?.id
  const [content, setContent] = useState({ pages: [] })
  const [config, setConfig] = useState(normaliseSiteEngine())
  const [notice, setNotice] = useState('Loading')
  const pages = content.pages || []

  async function loadContent() {
    if (!websiteId) {
      setNotice('Waiting for assigned website')
      return
    }

    try {
      const data = await api.getContent(websiteId)
      setContent(data)
      setConfig(normaliseSiteEngine(data))
      setNotice('Ready')
    } catch (error) {
      setNotice(error.message || 'Engine unavailable')
    }
  }

  useEffect(() => {
    loadContent()
  }, [websiteId])

  async function saveEngine(nextConfig, message = 'Website config saved') {
    if (!websiteId) return setNotice('No website assigned')

    const nextContent = {
      ...content,
      engine: nextConfig,
    }

    setConfig(nextConfig)
    setContent(nextContent)
    setNotice('Saving')

    try {
      const saved = await api.saveContent(websiteId, nextContent)
      setContent(saved)
      setConfig(normaliseSiteEngine(saved))
      setNotice(message)
    } catch (error) {
      setNotice(error.message || 'Save failed')
    }
  }

  function updateSection(section, values) {
    saveEngine({
      ...config,
      [section]: {
        ...config[section],
        ...values,
      },
    })
  }

  function addNav() {
    saveEngine(
      {
        ...config,
        navigation: [
          ...(config.navigation || []),
          {
            id: `nav-${Date.now()}`,
            label: 'New Link',
            target: '/new-link',
            visible: true,
            external: false,
            order: (config.navigation || []).length + 1,
          },
        ],
      },
      'Navigation item added',
    )
  }

  function updateNav(id, changes) {
    saveEngine({
      ...config,
      navigation: (config.navigation || []).map(item =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    }, 'Navigation updated')
  }

  function deleteNav(id) {
    saveEngine({
      ...config,
      navigation: (config.navigation || [])
        .filter(item => item.id !== id)
        .map((item, index) => ({ ...item, order: index + 1 })),
    }, 'Navigation deleted')
  }

  function moveNav(id, direction) {
    const nav = sortNav(config.navigation)
    const index = nav.findIndex(item => item.id === id)
    const nextIndex = direction === 'up' ? index - 1 : index + 1

    if (index < 0 || nextIndex < 0 || nextIndex >= nav.length) return

    const [item] = nav.splice(index, 1)
    nav.splice(nextIndex, 0, item)
    saveEngine({ ...config, navigation: nav.map((entry, order) => ({ ...entry, order: order + 1 })) }, 'Navigation moved')
  }

  function exportConfig() {
    const data = buildSiteExport(website, content, config)
    navigator.clipboard?.writeText(JSON.stringify(data, null, 2))
    setNotice('CMS export copied')
  }

  return (
    <Layout client={client} title="Website Engine">
      <section className="moduleHero card">
        <div>
          <span>CMS Engine</span>
          <h2>{website?.name || 'Assigned Website'} Website System</h2>
          <p>Control navigation, theme, SEO, global sections and publishing settings from one website configuration.</p>
        </div>
        <button onClick={exportConfig}>{notice}</button>
      </section>
      <section className="engineGrid">
        <section className="card enginePanel navPanel">
          <div className="panelHead"><h2>Navigation</h2><button onClick={addNav} disabled={!websiteId}>Add Link</button></div>
          {sortNav(config.navigation).map(item => (
            <article className="navEditorRow" key={item.id}>
              <label>Label<input value={item.label} onChange={event => updateNav(item.id, { label: event.target.value })} /></label>
              <label>Target<input value={item.target} onChange={event => updateNav(item.id, { target: event.target.value })} /></label>
              <label className="checkLabel"><input type="checkbox" checked={item.visible} onChange={event => updateNav(item.id, { visible: event.target.checked })} />Visible</label>
              <label className="checkLabel"><input type="checkbox" checked={item.external} onChange={event => updateNav(item.id, { external: event.target.checked })} />External</label>
              <div className="rowActions"><button onClick={() => moveNav(item.id, 'up')}>↑</button><button onClick={() => moveNav(item.id, 'down')}>↓</button><button onClick={() => deleteNav(item.id)}>Delete</button></div>
            </article>
          ))}
        </section>
        <section className="card enginePanel">
          <div className="panelHead"><h2>Theme</h2><button onClick={() => updateSection('theme', config.theme)}>Save</button></div>
          <div className="engineForm">
            <label>Mode<select value={config.theme.mode} onChange={event => updateSection('theme', { mode: event.target.value })}><option>Dark</option><option>Light</option></select></label>
            <label>Primary<input value={config.theme.primary} onChange={event => updateSection('theme', { primary: event.target.value })} /></label>
            <label>Secondary<input value={config.theme.secondary} onChange={event => updateSection('theme', { secondary: event.target.value })} /></label>
            <label>Background<input value={config.theme.background} onChange={event => updateSection('theme', { background: event.target.value })} /></label>
            <label>Font<input value={config.theme.font} onChange={event => updateSection('theme', { font: event.target.value })} /></label>
            <label>Button Style<select value={config.theme.buttonStyle} onChange={event => updateSection('theme', { buttonStyle: event.target.value })}><option>Gradient</option><option>Solid</option><option>Outline</option></select></label>
          </div>
          <div className="themePreview" style={{ background: config.theme.background, color: config.theme.text, borderColor: config.theme.primary }}><b style={{ color: config.theme.primary }}>{website?.name || 'Website'}</b><p>{config.globals.announcement}</p><button style={{ background: `linear-gradient(90deg, ${config.theme.primary}, ${config.theme.secondary})` }}>Preview Button</button></div>
        </section>
        <section className="card enginePanel">
          <div className="panelHead"><h2>Global Sections</h2><button onClick={() => updateSection('globals', config.globals)}>Save</button></div>
          <div className="engineForm single">
            <label>Announcement<input value={config.globals.announcement} onChange={event => updateSection('globals', { announcement: event.target.value })} /></label>
            <label>Footer Text<input value={config.globals.footerText} onChange={event => updateSection('globals', { footerText: event.target.value })} /></label>
            <label>404 Title<input value={config.globals.notFoundTitle} onChange={event => updateSection('globals', { notFoundTitle: event.target.value })} /></label>
            <label className="checkLabel"><input type="checkbox" checked={config.globals.cookieBanner} onChange={event => updateSection('globals', { cookieBanner: event.target.checked })} />Cookie banner</label>
            <label className="checkLabel"><input type="checkbox" checked={config.globals.maintenanceMode} onChange={event => updateSection('globals', { maintenanceMode: event.target.checked })} />Maintenance mode</label>
          </div>
        </section>
        <section className="card enginePanel">
          <div className="panelHead"><h2>SEO</h2><button onClick={() => updateSection('seo', config.seo)}>Save</button></div>
          <div className="engineForm single">
            <label>Site Title<input value={config.seo.siteTitle} onChange={event => updateSection('seo', { siteTitle: event.target.value })} /></label>
            <label>Description<textarea value={config.seo.description} onChange={event => updateSection('seo', { description: event.target.value })} /></label>
            <label>Keywords<input value={config.seo.keywords} onChange={event => updateSection('seo', { keywords: event.target.value })} /></label>
            <label>Robots<select value={config.seo.robots} onChange={event => updateSection('seo', { robots: event.target.value })}><option>index,follow</option><option>noindex,nofollow</option></select></label>
          </div>
        </section>
        <section className="card enginePanel">
          <div className="panelHead"><h2>Website Config</h2><button onClick={() => updateSection('settings', config.settings)}>Save</button></div>
          <div className="engineForm single">
            <label>Domain<input value={config.settings.domain || website?.domain || ''} onChange={event => updateSection('settings', { domain: event.target.value })} /></label>
            <label>SSL<select value={config.settings.ssl} onChange={event => updateSection('settings', { ssl: event.target.value })}><option>Pending</option><option>Active</option><option>Issue</option></select></label>
            <label>Branch<input value={config.settings.branch} onChange={event => updateSection('settings', { branch: event.target.value })} /></label>
            <label>Publish Method<input value={config.settings.publishMethod} onChange={event => updateSection('settings', { publishMethod: event.target.value })} /></label>
            <label>Analytics ID<input value={config.settings.analyticsId} onChange={event => updateSection('settings', { analyticsId: event.target.value })} /></label>
          </div>
        </section>
        <aside className="card enginePanel">
          <h2>CMS Output</h2>
          <p>The export combines pages, navigation, theme, globals, SEO and website settings into one structure ready for publishing.</p>
          <div className="engineSummary"><span>{pages.length} pages</span><span>{(config.navigation || []).filter(item => item.visible).length} nav links</span><span>{config.theme.mode} theme</span><span>{config.seo.robots}</span></div>
          <button onClick={exportConfig}>Copy CMS Export</button>
        </aside>
      </section>
    </Layout>
  )
}
