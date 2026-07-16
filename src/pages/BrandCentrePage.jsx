import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { api } from '../services/api.js'

const ASSET_BASE = import.meta.env.VITE_KSJ_ASSET_URL || 'http://localhost:4174'

const defaults = {
  branding: { primaryLogo: '', favicon: '', socialIcon: '', headerStyle: 'Contained', footerStyle: 'Simple', showAnnouncement: false, showHeaderAction: true },
  theme: { mode: 'Dark', primary: '#157bff', secondary: '#9434e8', background: '#05070d', text: '#ffffff', radius: 18, buttonStyle: 'Gradient', font: 'Inter', spacing: 'Comfortable' },
  globals: {
    announcement: 'Welcome to the official website.',
    headerActionText: 'Join Community',
    headerActionUrl: '',
    footerText: '',
    footerLinks: { trackOrder: true, contact: true, privacy: true, terms: true, support: true },
  },
  brand: { name: '', tagline: '', communityName: '' },
  contact: { supportEmail: '', businessEmail: '' },
  socials: { discord: '' },
}

function assetUrl(asset) {
  if (!asset?.url) return ''
  return asset.url.startsWith('http') ? asset.url : `${ASSET_BASE}${asset.url}`
}

function ownerId(website, account) {
  return website?.owner || account?.id || website?.id || 'unassigned'
}

function normalise(content = {}, website = {}) {
  return {
    branding: { ...defaults.branding, ...(content.branding || {}) },
    theme: { ...defaults.theme, ...(content.engine?.theme || content.theme || {}) },
    globals: {
      ...defaults.globals,
      ...(content.engine?.globals || content.globals || {}),
      footerLinks: { ...defaults.globals.footerLinks, ...(content.engine?.globals?.footerLinks || content.globals?.footerLinks || {}) },
    },
    brand: { ...defaults.brand, name: website.name || '', ...(content.brand || {}) },
    contact: { ...defaults.contact, ...(content.contact || {}) },
    socials: { ...defaults.socials, ...(content.socials || {}) },
    navigation: content.engine?.navigation || content.navigation || [],
  }
}

function readableText(background = '#05070d') {
  const hex = background.replace('#', '')
  if (hex.length !== 6) return '#ffffff'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff'
}

export function BrandCentrePage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const availableWebsites = client ? websites.filter(site => account?.websiteIds?.includes(site.id)) : websites
  const [websiteId, setWebsiteId] = useState(assignedWebsite?.id || availableWebsites[0]?.id || '')
  const website = websites.find(site => site.id === websiteId) || assignedWebsite
  const owner = ownerId(website, account)
  const canManage = account?.role === 'owner' || account?.canManageMedia
  const canRequestUpdates = account?.role === 'owner' || account?.canRequestUpdates
  const [content, setContent] = useState({})
  const [model, setModel] = useState(() => normalise({}, website))
  const [assets, setAssets] = useState([])
  const [notice, setNotice] = useState('Loading')
  const [dragSlot, setDragSlot] = useState('')

  const imageAssets = useMemo(() => assets.filter(asset => asset.type?.startsWith('image/')), [assets])
  const visibleNavigation = useMemo(() => [...model.navigation].filter(item => item.visible !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)), [model.navigation])

  async function load(nextWebsiteId = websiteId) {
    if (!nextWebsiteId) return setNotice('No website assigned')
    const target = websites.find(site => site.id === nextWebsiteId) || assignedWebsite
    setWebsiteId(nextWebsiteId)
    setNotice('Loading')
    try {
      const [nextContent, nextAssets] = await Promise.all([
        api.getContent(nextWebsiteId),
        api.assets(ownerId(target, account), nextWebsiteId).catch(() => []),
      ])
      setContent(nextContent)
      setModel(normalise(nextContent, target))
      setAssets(nextAssets)
      setNotice(canManage ? 'Ready' : 'Preview only')
    } catch (error) {
      setNotice(error.message || 'Branding unavailable')
    }
  }

  useEffect(() => { if (websiteId) load(websiteId) }, [websiteId])

  async function save(nextModel, message = 'Global website settings saved') {
    if (!canManage) return setNotice('Brand permission required')
    const nextContent = {
      ...content,
      brand: nextModel.brand,
      contact: nextModel.contact,
      socials: nextModel.socials,
      branding: nextModel.branding,
      engine: {
        ...(content.engine || {}),
        theme: nextModel.theme,
        globals: nextModel.globals,
        navigation: nextModel.navigation,
      },
    }
    setModel(nextModel)
    setContent(nextContent)
    setNotice('Saving')
    try {
      const saved = await api.saveContent(websiteId, nextContent)
      setContent(saved)
      setModel(normalise(saved, website))
      setNotice(message)
    } catch (error) {
      setNotice(error.message || 'Save failed')
    }
  }

  function update(section, changes, message) {
    save({ ...model, [section]: { ...model[section], ...changes } }, message)
  }

  function updateFooterLink(key, checked) {
    update('globals', { footerLinks: { ...model.globals.footerLinks, [key]: checked } }, 'Footer links updated')
  }

  function updateNavigation(id, changes) {
    save({ ...model, navigation: model.navigation.map(item => item.id === id ? { ...item, ...changes } : item) }, 'Navigation updated')
  }

  function moveNavigation(id, direction) {
    const items = [...model.navigation].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    const index = items.findIndex(item => item.id === id)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return
    const [item] = items.splice(index, 1)
    items.splice(nextIndex, 0, item)
    save({ ...model, navigation: items.map((entry, order) => ({ ...entry, order: order + 1 })) }, 'Navigation reordered')
  }

  async function upload(slotId, file) {
    if (!file || !websiteId || !canManage) return
    setNotice(`Uploading ${slotId}`)
    try {
      const asset = await api.uploadAsset(owner, websiteId, slotId, file)
      setAssets(current => [asset, ...current.filter(item => item.id !== asset.id)])
      await update('branding', { [slotId]: assetUrl(asset) }, `${file.name} uploaded`)
    } catch (error) {
      setNotice(error.message || 'Upload failed')
    }
  }

  function chooseAsset(slotId, assetId) {
    const asset = imageAssets.find(item => item.id === assetId)
    if (asset) update('branding', { [slotId]: assetUrl(asset) })
  }

  async function submitForApproval() {
    if (!canRequestUpdates) return setNotice('Approval request permission required')
    try {
      await api.createPublishRequest({ websiteId: website.id, websiteName: website.name, repository: website.repository, title: 'Header, footer and branding update', createdBy: account?.displayName || account?.name, contentPath: `server-data/content/${website.id}.json` })
      setNotice('Global website changes submitted for approval')
    } catch (error) {
      setNotice(error.message || 'Approval request failed')
    }
  }

  if (!canManage) return <Layout client={client} title="Branding"><section className="moduleHero card"><div><span>Branding</span><h2>Brand access restricted</h2><p>Your account cannot currently change global website branding.</p></div><button>{notice}</button></section></Layout>

  const previewText = model.theme.text || readableText(model.theme.background)
  const actionUrl = model.globals.headerActionUrl || model.socials.discord

  return (
    <Layout client={client} title="Branding">
      <section className="moduleHero card visualBrandHero"><div><span>Global Website Management</span><h2>{website?.name || 'Assigned Website'}</h2><p>Manage the shared header, navigation, footer, logos and visual brand used across every page.</p></div><div className="visualBrandActions">{!client && availableWebsites.length > 1 && <select value={websiteId} onChange={event => load(event.target.value)}>{availableWebsites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select>}{canRequestUpdates && <button onClick={submitForApproval}>Submit for Approval</button>}<button>{notice}</button></div></section>

      <section className="visualBrandGrid">
        <aside className="card visualBrandControls">
          <section><div className="panelHead"><h2>Logos & Icons</h2><span>Global assets</span></div>{[['primaryLogo', 'Header Logo'], ['favicon', 'Favicon'], ['socialIcon', 'Social / Share Image']].map(([slotId, label]) => <article className={dragSlot === slotId ? 'brandDropZone dragging' : 'brandDropZone'} key={slotId} onDragOver={event => { event.preventDefault(); setDragSlot(slotId) }} onDragLeave={() => setDragSlot('')} onDrop={event => { event.preventDefault(); setDragSlot(''); upload(slotId, event.dataTransfer.files?.[0]) }}><div className="brandDropPreview">{model.branding[slotId] ? <img src={model.branding[slotId]} alt={label} /> : <span>No image</span>}</div><div><b>{label}</b><small>Upload or choose an existing image.</small></div><label className="brandUploadButton">Upload<input type="file" accept="image/*,.ico" onChange={event => upload(slotId, event.target.files?.[0])} /></label><select value="" onChange={event => chooseAsset(slotId, event.target.value)}><option value="">Use media library</option>{imageAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></article>)}</section>

          <section><div className="panelHead"><h2>Header Identity</h2><span>Shown on every page</span></div><label>Website Name<input value={model.brand.name} onChange={event => update('brand', { name: event.target.value })} /></label><label>Tagline<input value={model.brand.tagline} onChange={event => update('brand', { tagline: event.target.value })} /></label><label>Community Name<input value={model.brand.communityName} onChange={event => update('brand', { communityName: event.target.value })} /></label><label>Header Style<select value={model.branding.headerStyle} onChange={event => update('branding', { headerStyle: event.target.value })}><option>Contained</option><option>Full Width</option><option>Minimal</option></select></label><label>Action Button Text<input value={model.globals.headerActionText} onChange={event => update('globals', { headerActionText: event.target.value })} /></label><label>Action Button URL<input value={model.globals.headerActionUrl} placeholder={model.socials.discord || 'https://'} onChange={event => update('globals', { headerActionUrl: event.target.value })} /></label><label className="formCheck"><input type="checkbox" checked={model.branding.showHeaderAction !== false} onChange={event => update('branding', { showHeaderAction: event.target.checked })} /> Show header action button</label><label>Discord URL<input value={model.socials.discord} onChange={event => update('socials', { discord: event.target.value })} /></label></section>

          <section><div className="panelHead"><h2>Announcement</h2><span>Optional</span></div><label>Announcement Text<input value={model.globals.announcement} onChange={event => update('globals', { announcement: event.target.value })} /></label><label className="formCheck"><input type="checkbox" checked={model.branding.showAnnouncement === true} onChange={event => update('branding', { showAnnouncement: event.target.checked })} /> Show announcement bar</label></section>

          <section><div className="panelHead"><h2>Footer</h2><span>Shared globally</span></div><label>Footer Style<select value={model.branding.footerStyle} onChange={event => update('branding', { footerStyle: event.target.value })}><option>Simple</option><option>Columns</option><option>Minimal</option></select></label><label>Footer Text<input value={model.globals.footerText} placeholder="© Year Website. All rights reserved." onChange={event => update('globals', { footerText: event.target.value })} /></label><label>Support Email<input type="email" value={model.contact.supportEmail} onChange={event => update('contact', { supportEmail: event.target.value })} /></label><div className="brandFieldGrid">{Object.entries({ trackOrder: 'Track Order', contact: 'Contact', privacy: 'Privacy', terms: 'Terms', support: 'Support Email' }).map(([key, label]) => <label className="formCheck" key={key}><input type="checkbox" checked={model.globals.footerLinks[key] !== false} onChange={event => updateFooterLink(key, event.target.checked)} /> {label}</label>)}</div><label>Protected Platform Credit<input value="Website by KSJ Digital" disabled /></label></section>

          <section><div className="panelHead"><h2>Navigation</h2><span>Header links</span></div><div className="brandNavList">{[...model.navigation].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map(item => <article key={item.id}><label>Label<input value={item.label} onChange={event => updateNavigation(item.id, { label: event.target.value })} /></label><label className="formCheck"><input type="checkbox" checked={item.visible !== false} onChange={event => updateNavigation(item.id, { visible: event.target.checked })} /> Visible</label><div><button onClick={() => moveNavigation(item.id, 'up')}>↑</button><button onClick={() => moveNavigation(item.id, 'down')}>↓</button></div></article>)}{!model.navigation.length && <p>No navigation items have been configured yet.</p>}</div></section>

          <section><div className="panelHead"><h2>Colours & Type</h2><span>Website theme</span></div><div className="brandFieldGrid"><label>Primary Colour<input type="color" value={model.theme.primary} onChange={event => update('theme', { primary: event.target.value })} /></label><label>Secondary Colour<input type="color" value={model.theme.secondary} onChange={event => update('theme', { secondary: event.target.value })} /></label><label>Background<input type="color" value={model.theme.background} onChange={event => update('theme', { background: event.target.value })} /></label><label>Text Colour<input type="color" value={model.theme.text} onChange={event => update('theme', { text: event.target.value })} /></label><label>Font<select value={model.theme.font} onChange={event => update('theme', { font: event.target.value })}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Trebuchet MS</option><option>Courier New</option></select></label><label>Corner Roundness<input type="range" min="0" max="32" value={model.theme.radius} onChange={event => update('theme', { radius: Number(event.target.value) })} /></label></div></section>
        </aside>

        <section className="card visualBrandPreviewPanel"><div className="panelHead"><h2>Global Region Preview</h2><span>{model.theme.mode}</span></div><div className={`brandWebsitePreview ${model.branding.headerStyle.toLowerCase().replaceAll(' ', '-')}`} style={{ '--brand-primary': model.theme.primary, '--brand-secondary': model.theme.secondary, '--brand-background': model.theme.background, '--brand-text': previewText, '--brand-radius': `${model.theme.radius}px`, '--brand-font': model.theme.font }}>{model.branding.showAnnouncement && <div className="brandAnnouncement">{model.globals.announcement}</div>}<header><div className="brandPreviewLogo">{model.branding.primaryLogo ? <img src={model.branding.primaryLogo} alt={model.brand.name || website?.name} /> : <b>{(model.brand.name || website?.name || 'SITE').slice(0, 3)}</b>}<span><strong>{model.brand.name || website?.name}</strong><small>{model.brand.tagline}</small></span></div><nav>{visibleNavigation.map(item => <span key={item.id}>{item.label}</span>)}</nav>{model.branding.showHeaderAction !== false && <button>{model.globals.headerActionText || 'Join Community'}</button>}</header><main><span>Page body</span><h1>Managed separately in Website Editor</h1><p>The header and footer remain consistent across every page.</p></main><footer className={model.branding.footerStyle.toLowerCase()}><div><strong>{model.brand.name || website?.name}</strong><small>{model.brand.tagline}</small><p>{model.globals.footerText || `© ${new Date().getFullYear()} ${model.brand.name || website?.name}. All rights reserved.`}</p></div><nav>{Object.entries(model.globals.footerLinks).filter(([, visible]) => visible !== false).map(([key]) => <span key={key}>{key.replace(/([A-Z])/g, ' $1')}</span>)}</nav><b>Website by KSJ Digital</b></footer></div></section>
      </section>
    </Layout>
  )
}
