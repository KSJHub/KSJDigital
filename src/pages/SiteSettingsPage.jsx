import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

const ASSET_BASE = import.meta.env.VITE_KSJ_ASSET_URL || 'http://localhost:4174'

const defaults = {
  brand: {
    name: '',
    tagline: '',
    shortTagline: '',
    communityName: '',
    primaryLogo: '',
    supportCredit: 'Website by KSJ Digital',
  },
  branding: {
    favicon: '',
    socialIcon: '',
    headerStyle: 'Contained',
    footerStyle: 'Simple',
    showAnnouncement: false,
  },
  globals: {
    announcement: '',
    footerText: '',
  },
  theme: {
    primary: '#157bff',
    secondary: '#9434e8',
    background: '#05070d',
    text: '#ffffff',
    radius: 18,
    font: 'Inter',
  },
  socials: {
    discord: '',
    twitch: '',
    youtube: '',
    tiktok: '',
    kick: '',
    instagram: '',
  },
  contact: {
    supportEmail: '',
    businessEmail: '',
  },
  navigation: [],
}

function assetUrl(asset) {
  if (!asset?.url) return ''
  return asset.url.startsWith('http') ? asset.url : `${ASSET_BASE}${asset.url}`
}

function normalise(content = {}, website = {}) {
  return {
    brand: {
      ...defaults.brand,
      name: website.name || '',
      communityName: website.name || '',
      ...(content.brand || {}),
      primaryLogo: content.brand?.primaryLogo || content.branding?.primaryLogo || '',
    },
    branding: { ...defaults.branding, ...(content.branding || {}) },
    globals: { ...defaults.globals, ...(content.engine?.globals || content.globals || {}) },
    theme: { ...defaults.theme, ...(content.engine?.theme || content.theme || {}) },
    socials: { ...defaults.socials, ...(content.socials || {}) },
    contact: { ...defaults.contact, ...(content.contact || {}) },
    navigation: content.engine?.navigation || content.navigation || [],
  }
}

function ownerId(website, account) {
  return website?.owner || account?.id || website?.id || 'unassigned'
}

function sortedNavigation(items = []) {
  return [...items].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
}

export function SiteSettingsPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const [websiteId, setWebsiteId] = useState('')
  const website = websites.find(site => site.id === websiteId) || assignedWebsite || websites[0]
  const [content, setContent] = useState({})
  const [settings, setSettings] = useState(() => normalise({}, website))
  const [assets, setAssets] = useState([])
  const [notice, setNotice] = useState('Loading settings')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const canManage = account?.role === 'owner' || account?.canManageMedia
  const canRequestUpdates = account?.role === 'owner' || account?.canRequestUpdates
  const platformOwner = account?.role === 'owner'

  const imageAssets = useMemo(
    () => assets.filter(asset => asset.type?.startsWith('image/')),
    [assets],
  )

  useEffect(() => {
    if (!websiteId && website?.id) setWebsiteId(website.id)
  }, [website?.id, websiteId])

  useEffect(() => {
    if (!websiteId) return
    let cancelled = false
    setNotice('Loading settings')
    const target = websites.find(site => site.id === websiteId) || website
    Promise.all([
      api.getContent(websiteId),
      api.assets(ownerId(target, account), websiteId).catch(() => []),
    ]).then(([nextContent, nextAssets]) => {
      if (cancelled) return
      setContent(nextContent)
      setSettings(normalise(nextContent, target))
      setAssets(nextAssets)
      setNotice(canManage ? 'Ready' : 'View only')
    }).catch(error => !cancelled && setNotice(error.message || 'Settings unavailable'))
    return () => { cancelled = true }
  }, [account?.id, canManage, websiteId])

  async function persist(nextSettings, message = 'Settings saved') {
    if (!canManage || !websiteId || saving) return
    const nextContent = {
      ...content,
      brand: nextSettings.brand,
      branding: nextSettings.branding,
      socials: nextSettings.socials,
      contact: nextSettings.contact,
      engine: {
        ...(content.engine || {}),
        globals: nextSettings.globals,
        theme: nextSettings.theme,
        navigation: nextSettings.navigation,
      },
    }
    setSettings(nextSettings)
    setContent(nextContent)
    setSaving(true)
    setNotice('Saving…')
    try {
      const saved = await api.saveContent(websiteId, nextContent)
      setContent(saved)
      setSettings(normalise(saved, website))
      setNotice(`✓ ${message}`)
    } catch (error) {
      setNotice(error.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function updateGroup(group, changes, message) {
    persist({ ...settings, [group]: { ...settings[group], ...changes } }, message)
  }

  function updateNavigation(id, changes) {
    persist({
      ...settings,
      navigation: settings.navigation.map(item => item.id === id ? { ...item, ...changes } : item),
    }, 'Navigation saved')
  }

  function moveNavigation(id, direction) {
    const items = sortedNavigation(settings.navigation)
    const index = items.findIndex(item => item.id === id)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return
    const [item] = items.splice(index, 1)
    items.splice(nextIndex, 0, item)
    persist({
      ...settings,
      navigation: items.map((entry, order) => ({ ...entry, order: order + 1 })),
    }, 'Navigation reordered')
  }

  async function upload(slotId, file) {
    if (!file || !canManage || !websiteId) return
    setNotice(`Uploading ${file.name}…`)
    try {
      const asset = await api.uploadAsset(ownerId(website, account), websiteId, slotId, file)
      const url = assetUrl(asset)
      setAssets(current => [asset, ...current.filter(item => item.id !== asset.id)])
      if (slotId === 'primaryLogo') {
        await persist({
          ...settings,
          brand: { ...settings.brand, primaryLogo: url },
          branding: { ...settings.branding, primaryLogo: url },
        }, 'Primary logo uploaded')
      } else {
        await persist({
          ...settings,
          branding: { ...settings.branding, [slotId]: url },
        }, `${slotId} uploaded`)
      }
    } catch (error) {
      setNotice(error.message || 'Upload failed')
    }
  }

  function chooseAsset(slotId, assetId) {
    const asset = imageAssets.find(item => item.id === assetId)
    if (!asset) return
    const url = assetUrl(asset)
    if (slotId === 'primaryLogo') {
      persist({
        ...settings,
        brand: { ...settings.brand, primaryLogo: url },
        branding: { ...settings.branding, primaryLogo: url },
      }, 'Primary logo selected')
    } else {
      updateGroup('branding', { [slotId]: url }, `${slotId} selected`)
    }
  }

  async function submitForApproval() {
    if (!canRequestUpdates || !website?.id || submitting) return
    setSubmitting(true)
    setNotice('Submitting exact draft…')
    try {
      const request = await api.createPublishRequest({
        websiteId: website.id,
        websiteName: website.name,
        repository: website.repository,
        title: 'Site-wide settings update',
        createdBy: account?.displayName || account?.name,
        contentPath: `server-data/content/${website.id}.json`,
      })
      setNotice(request?.duplicate ? 'Already waiting for review' : '✓ Settings submitted for approval')
    } catch (error) {
      setNotice(error.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canManage) {
    return <Layout client={client} title="Site Settings"><section className="moduleHero card"><div><span>Site Settings</span><h2>Access restricted</h2><p>KSJ Digital has not enabled site-wide management for this account.</p></div><button>{notice}</button></section></Layout>
  }

  return (
    <Layout client={client} title="Site Settings">
      <section className="moduleHero card siteSettingsHero">
        <div><span>Site-wide Management</span><h2>{website?.name || 'Assigned Website'}</h2><p>Manage everything outside the editable page body: identity, header, navigation, footer, contact details, social links and global appearance.</p></div>
        <div className="siteSettingsActions">
          {platformOwner && websites.length > 1 && <select value={websiteId} onChange={event => setWebsiteId(event.target.value)}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select>}
          {canRequestUpdates && <button onClick={submitForApproval} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Settings'}</button>}
          <span>{notice}</span>
        </div>
      </section>

      <section className="siteSettingsGrid">
        <div className="siteSettingsControls">
          <section className="card settingsGroup">
            <div className="panelHead"><h2>Website Identity</h2><span>Header & footer</span></div>
            <div className="settingsFields twoColumns">
              <label>Website Name<input value={settings.brand.name} onChange={event => setSettings(current => ({ ...current, brand: { ...current.brand, name: event.target.value } }))} onBlur={() => persist(settings, 'Website name saved')} /></label>
              <label>Community Name<input value={settings.brand.communityName} onChange={event => setSettings(current => ({ ...current, brand: { ...current.brand, communityName: event.target.value } }))} onBlur={() => persist(settings, 'Community name saved')} /></label>
              <label>Tagline<input value={settings.brand.tagline} onChange={event => setSettings(current => ({ ...current, brand: { ...current.brand, tagline: event.target.value } }))} onBlur={() => persist(settings, 'Tagline saved')} /></label>
              <label>Short Tagline<input value={settings.brand.shortTagline} onChange={event => setSettings(current => ({ ...current, brand: { ...current.brand, shortTagline: event.target.value } }))} onBlur={() => persist(settings, 'Short tagline saved')} /></label>
            </div>
            <label className="lockedSetting">KSJ Digital Credit<input value={settings.brand.supportCredit} disabled={!platformOwner} onChange={event => setSettings(current => ({ ...current, brand: { ...current.brand, supportCredit: event.target.value } }))} onBlur={() => platformOwner && persist(settings, 'Platform credit saved')} /><small>{platformOwner ? 'Platform-controlled field.' : '🔒 Controlled by KSJ Digital.'}</small></label>
          </section>

          <section className="card settingsGroup">
            <div className="panelHead"><h2>Logos & Browser Images</h2><span>Upload once</span></div>
            <div className="assetSettingsGrid">
              {[["primaryLogo", "Primary Logo"], ["favicon", "Favicon"], ["socialIcon", "Social Share Image"]].map(([slotId, label]) => {
                const value = slotId === 'primaryLogo' ? settings.brand.primaryLogo : settings.branding[slotId]
                return <article key={slotId} className="assetSetting"><div className="assetSettingPreview">{value ? <img src={value} alt={label} /> : <span>No image</span>}</div><b>{label}</b><label>Upload<input type="file" accept="image/*,.ico" onChange={event => upload(slotId, event.target.files?.[0])} /></label><select value="" onChange={event => chooseAsset(slotId, event.target.value)}><option value="">Use media library</option>{imageAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></article>
              })}
            </div>
          </section>

          <section className="card settingsGroup">
            <div className="panelHead"><h2>Header & Footer</h2><span>Global layout</span></div>
            <div className="settingsFields twoColumns">
              <label>Header Style<select value={settings.branding.headerStyle} onChange={event => updateGroup('branding', { headerStyle: event.target.value }, 'Header style saved')}><option>Contained</option><option>Full Width</option><option>Minimal</option></select></label>
              <label>Footer Style<select value={settings.branding.footerStyle} onChange={event => updateGroup('branding', { footerStyle: event.target.value }, 'Footer style saved')}><option>Simple</option><option>Columns</option><option>Minimal</option></select></label>
              <label>Announcement<input value={settings.globals.announcement} onChange={event => setSettings(current => ({ ...current, globals: { ...current.globals, announcement: event.target.value } }))} onBlur={() => persist(settings, 'Announcement saved')} /></label>
              <label>Footer Text<input value={settings.globals.footerText} onChange={event => setSettings(current => ({ ...current, globals: { ...current.globals, footerText: event.target.value } }))} onBlur={() => persist(settings, 'Footer text saved')} /></label>
            </div>
            <label className="formCheck"><input type="checkbox" checked={settings.branding.showAnnouncement} onChange={event => updateGroup('branding', { showAnnouncement: event.target.checked }, 'Announcement visibility saved')} /> Show announcement bar</label>
          </section>

          <section className="card settingsGroup">
            <div className="panelHead"><h2>Navigation</h2><span>Rename, hide, reorder</span></div>
            <div className="siteNavigationList">{sortedNavigation(settings.navigation).map(item => <article key={item.id}><label>Label<input value={item.label} onChange={event => setSettings(current => ({ ...current, navigation: current.navigation.map(entry => entry.id === item.id ? { ...entry, label: event.target.value } : entry) }))} onBlur={() => persist(settings, 'Navigation label saved')} /></label><label className="formCheck"><input type="checkbox" checked={item.visible !== false} onChange={event => updateNavigation(item.id, { visible: event.target.checked })} /> Visible</label><div><button onClick={() => moveNavigation(item.id, 'up')}>↑</button><button onClick={() => moveNavigation(item.id, 'down')}>↓</button></div></article>)}</div>
          </section>

          <section className="card settingsGroup">
            <div className="panelHead"><h2>Socials & Contact</h2><span>One place</span></div>
            <div className="settingsFields twoColumns">
              {Object.keys(defaults.socials).map(key => <label key={key}>{key[0].toUpperCase() + key.slice(1)}<input value={settings.socials[key]} onChange={event => setSettings(current => ({ ...current, socials: { ...current.socials, [key]: event.target.value } }))} onBlur={() => persist(settings, `${key} link saved`)} /></label>)}
              <label>Support Email<input type="email" value={settings.contact.supportEmail} onChange={event => setSettings(current => ({ ...current, contact: { ...current.contact, supportEmail: event.target.value } }))} onBlur={() => persist(settings, 'Support email saved')} /></label>
              <label>Business Email<input type="email" value={settings.contact.businessEmail} onChange={event => setSettings(current => ({ ...current, contact: { ...current.contact, businessEmail: event.target.value } }))} onBlur={() => persist(settings, 'Business email saved')} /></label>
            </div>
          </section>

          <section className="card settingsGroup">
            <div className="panelHead"><h2>Global Appearance</h2><span>Whole website</span></div>
            <div className="settingsFields threeColumns">
              <label>Primary<input type="color" value={settings.theme.primary} onChange={event => updateGroup('theme', { primary: event.target.value }, 'Primary colour saved')} /></label>
              <label>Secondary<input type="color" value={settings.theme.secondary} onChange={event => updateGroup('theme', { secondary: event.target.value }, 'Secondary colour saved')} /></label>
              <label>Background<input type="color" value={settings.theme.background} onChange={event => updateGroup('theme', { background: event.target.value }, 'Background saved')} /></label>
              <label>Text<input type="color" value={settings.theme.text} onChange={event => updateGroup('theme', { text: event.target.value }, 'Text colour saved')} /></label>
              <label>Font<select value={settings.theme.font} onChange={event => updateGroup('theme', { font: event.target.value }, 'Font saved')}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Trebuchet MS</option></select></label>
              <label>Roundness<input type="range" min="0" max="32" value={settings.theme.radius} onChange={event => updateGroup('theme', { radius: Number(event.target.value) }, 'Corner roundness saved')} /></label>
            </div>
          </section>
        </div>

        <aside className="card siteSettingsPreview">
          <div className="panelHead"><h2>Global Preview</h2><span>Site-wide only</span></div>
          {settings.branding.showAnnouncement && <div className="settingsAnnouncement">{settings.globals.announcement || 'Announcement bar'}</div>}
          <header><div>{settings.brand.primaryLogo ? <img src={settings.brand.primaryLogo} alt="" /> : <b>{website?.logo || 'SITE'}</b>}<span><strong>{settings.brand.name}</strong><small>{settings.brand.tagline}</small></span></div><nav>{sortedNavigation(settings.navigation).filter(item => item.visible !== false).map(item => <span key={item.id}>{item.label}</span>)}</nav></header>
          <main style={{ '--preview-primary': settings.theme.primary, '--preview-secondary': settings.theme.secondary, '--preview-bg': settings.theme.background, '--preview-text': settings.theme.text, '--preview-radius': `${settings.theme.radius}px`, '--preview-font': settings.theme.font }}><small>{settings.brand.shortTagline}</small><h2>{settings.brand.name || website?.name}</h2><p>Page-body content is edited directly inside the visual website editor.</p><button>Primary Action</button></main>
          <footer><span>{settings.globals.footerText || `© ${new Date().getFullYear()} ${settings.brand.name}`}</span><b>{settings.brand.supportCredit}</b></footer>
        </aside>
      </section>
    </Layout>
  )
}
