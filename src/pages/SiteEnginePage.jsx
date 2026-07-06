import { useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getPages } from '../services/pageBuilder.js'
import { addNavigationItem, buildSiteExport, deleteNavigationItem, getSiteConfig, moveNavigationItem, updateNavigationItem, updateSiteSection } from '../services/siteEngine.js'
import { getClientWebsite } from '../services/platform.js'

export function SiteEnginePage({ client = false }) {
  const website = getClientWebsite()
  const [config, setConfig] = useState(getSiteConfig(website.id))
  const [notice, setNotice] = useState('Ready')
  const pages = getPages(website.id)

  function refresh(message = 'Saved') {
    setConfig(getSiteConfig(website.id))
    setNotice(message)
  }

  function updateSection(section, values) {
    updateSiteSection(website.id, section, values)
    refresh('Website config saved')
  }

  function addNav() {
    addNavigationItem(website.id)
    refresh('Navigation item added')
  }

  function updateNav(id, changes) {
    updateNavigationItem(website.id, id, changes)
    refresh('Navigation updated')
  }

  function exportConfig() {
    const data = buildSiteExport(website, pages, config)
    navigator.clipboard?.writeText(JSON.stringify(data, null, 2))
    setNotice('CMS export copied')
  }

  return <Layout client={client} title="Website Engine"><section className="moduleHero card"><div><span>CMS Engine</span><h2>{website.name} Website System</h2><p>Control navigation, theme, SEO, global sections and publishing settings from one website configuration.</p></div><button onClick={exportConfig}>{notice}</button></section><section className="engineGrid"><section className="card enginePanel navPanel"><div className="panelHead"><h2>Navigation</h2><button onClick={addNav}>Add Link</button></div>{config.navigation.sort((a,b)=>a.order-b.order).map(item => <article className="navEditorRow" key={item.id}><label>Label<input value={item.label} onChange={event => updateNav(item.id, { label: event.target.value })} /></label><label>Target<input value={item.target} onChange={event => updateNav(item.id, { target: event.target.value })} /></label><label className="checkLabel"><input type="checkbox" checked={item.visible} onChange={event => updateNav(item.id, { visible: event.target.checked })} />Visible</label><label className="checkLabel"><input type="checkbox" checked={item.external} onChange={event => updateNav(item.id, { external: event.target.checked })} />External</label><div className="rowActions"><button onClick={() => { moveNavigationItem(website.id, item.id, 'up'); refresh('Moved up') }}>↑</button><button onClick={() => { moveNavigationItem(website.id, item.id, 'down'); refresh('Moved down') }}>↓</button><button onClick={() => { deleteNavigationItem(website.id, item.id); refresh('Deleted') }}>Delete</button></div></article>)}</section><section className="card enginePanel"><div className="panelHead"><h2>Theme</h2><button onClick={() => updateSection('theme', config.theme)}>Save</button></div><div className="engineForm"><label>Mode<select value={config.theme.mode} onChange={event => updateSection('theme', { mode: event.target.value })}><option>Dark</option><option>Light</option></select></label><label>Primary<input value={config.theme.primary} onChange={event => updateSection('theme', { primary: event.target.value })} /></label><label>Secondary<input value={config.theme.secondary} onChange={event => updateSection('theme', { secondary: event.target.value })} /></label><label>Background<input value={config.theme.background} onChange={event => updateSection('theme', { background: event.target.value })} /></label><label>Font<input value={config.theme.font} onChange={event => updateSection('theme', { font: event.target.value })} /></label><label>Button Style<select value={config.theme.buttonStyle} onChange={event => updateSection('theme', { buttonStyle: event.target.value })}><option>Gradient</option><option>Solid</option><option>Outline</option></select></label></div><div className="themePreview" style={{ background: config.theme.background, color: config.theme.text, borderColor: config.theme.primary }}><b style={{ color: config.theme.primary }}>{website.name}</b><p>{config.globals.announcement}</p><button style={{ background: `linear-gradient(90deg, ${config.theme.primary}, ${config.theme.secondary})` }}>Preview Button</button></div></section><section className="card enginePanel"><div className="panelHead"><h2>Global Sections</h2><button onClick={() => updateSection('globals', config.globals)}>Save</button></div><div className="engineForm single"><label>Announcement<input value={config.globals.announcement} onChange={event => updateSection('globals', { announcement: event.target.value })} /></label><label>Footer Text<input value={config.globals.footerText} onChange={event => updateSection('globals', { footerText: event.target.value })} /></label><label>404 Title<input value={config.globals.notFoundTitle} onChange={event => updateSection('globals', { notFoundTitle: event.target.value })} /></label><label className="checkLabel"><input type="checkbox" checked={config.globals.cookieBanner} onChange={event => updateSection('globals', { cookieBanner: event.target.checked })} />Cookie banner</label><label className="checkLabel"><input type="checkbox" checked={config.globals.maintenanceMode} onChange={event => updateSection('globals', { maintenanceMode: event.target.checked })} />Maintenance mode</label></div></section><section className="card enginePanel"><div className="panelHead"><h2>SEO</h2><button onClick={() => updateSection('seo', config.seo)}>Save</button></div><div className="engineForm single"><label>Site Title<input value={config.seo.siteTitle} onChange={event => updateSection('seo', { siteTitle: event.target.value })} /></label><label>Description<textarea value={config.seo.description} onChange={event => updateSection('seo', { description: event.target.value })} /></label><label>Keywords<input value={config.seo.keywords} onChange={event => updateSection('seo', { keywords: event.target.value })} /></label><label>Robots<select value={config.seo.robots} onChange={event => updateSection('seo', { robots: event.target.value })}><option>index,follow</option><option>noindex,nofollow</option></select></label></div></section><section className="card enginePanel"><div className="panelHead"><h2>Website Config</h2><button onClick={() => updateSection('settings', config.settings)}>Save</button></div><div className="engineForm single"><label>Domain<input value={config.settings.domain || website.domain} onChange={event => updateSection('settings', { domain: event.target.value })} /></label><label>SSL<select value={config.settings.ssl} onChange={event => updateSection('settings', { ssl: event.target.value })}><option>Pending</option><option>Active</option><option>Issue</option></select></label><label>Branch<input value={config.settings.branch} onChange={event => updateSection('settings', { branch: event.target.value })} /></label><label>Publish Method<input value={config.settings.publishMethod} onChange={event => updateSection('settings', { publishMethod: event.target.value })} /></label><label>Analytics ID<input value={config.settings.analyticsId} onChange={event => updateSection('settings', { analyticsId: event.target.value })} /></label></div></section><aside className="card enginePanel"><h2>CMS Output</h2><p>The export combines pages, navigation, theme, globals, SEO and website settings into one structure ready for publishing.</p><div className="engineSummary"><span>{pages.length} pages</span><span>{config.navigation.filter(item=>item.visible).length} nav links</span><span>{config.theme.mode} theme</span><span>{config.seo.robots}</span></div><button onClick={exportConfig}>Copy CMS Export</button></aside></section></Layout>
}
