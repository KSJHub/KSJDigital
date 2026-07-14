import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { api } from '../services/api.js'

const ASSET_BASE = import.meta.env.VITE_KSJ_ASSET_URL || 'http://localhost:4174'

const defaultBranding = {
  primaryLogo: '',
  favicon: '',
  socialIcon: '',
  headerStyle: 'Contained',
  footerStyle: 'Simple',
  showAnnouncement: true,
}

const defaultTheme = {
  mode: 'Dark',
  primary: '#157bff',
  secondary: '#9434e8',
  background: '#05070d',
  text: '#ffffff',
  radius: 18,
  buttonStyle: 'Gradient',
  font: 'Inter',
  spacing: 'Comfortable',
}

const defaultGlobals = {
  announcement: 'Welcome to the official website.',
  footerText: 'Powered by KSJ Digital',
}

function assetUrl(asset) {
  if (!asset?.url) return ''
  return asset.url.startsWith('http') ? asset.url : `${ASSET_BASE}${asset.url}`
}

function ownerId(website, account) {
  return website?.owner || account?.id || website?.id || 'unassigned'
}

function normaliseBrand(content = {}) {
  return {
    branding: { ...defaultBranding, ...(content.branding || {}) },
    theme: { ...defaultTheme, ...(content.engine?.theme || content.theme || {}) },
    globals: { ...defaultGlobals, ...(content.engine?.globals || content.globals || {}) },
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
  const availableWebsites = client
    ? websites.filter(site => account?.websiteIds?.includes(site.id))
    : websites
  const [websiteId, setWebsiteId] = useState(assignedWebsite?.id || availableWebsites[0]?.id || '')
  const website = websites.find(site => site.id === websiteId) || assignedWebsite
  const owner = ownerId(website, account)
  const canManage = account?.role === 'owner' || account?.canManageMedia
  const canRequestUpdates = account?.role === 'owner' || account?.canRequestUpdates
  const [content, setContent] = useState({ pages: [] })
  const [brand, setBrand] = useState(normaliseBrand())
  const [assets, setAssets] = useState([])
  const [notice, setNotice] = useState('Loading')
  const [dragSlot, setDragSlot] = useState('')

  const imageAssets = useMemo(
    () => assets.filter(asset => asset.type?.startsWith('image/')),
    [assets],
  )

  async function load(nextWebsiteId = websiteId) {
    if (!nextWebsiteId) return setNotice('No website assigned')
    setWebsiteId(nextWebsiteId)
    setNotice('Loading')

    try {
      const target = websites.find(site => site.id === nextWebsiteId) || assignedWebsite
      const targetOwner = ownerId(target, account)
      const [nextContent, nextAssets] = await Promise.all([
        api.getContent(nextWebsiteId),
        api.assets(targetOwner, nextWebsiteId).catch(() => []),
      ])
      setContent(nextContent)
      setBrand(normaliseBrand(nextContent))
      setAssets(nextAssets)
      setNotice(canManage ? 'Ready' : 'Preview only')
    } catch (error) {
      setNotice(error.message || 'Branding unavailable')
    }
  }

  useEffect(() => {
    if (websiteId) load(websiteId)
  }, [websiteId])

  async function save(nextBrand, message = 'Branding saved') {
    if (!canManage) return setNotice('Brand permission required')
    if (!websiteId) return setNotice('No website assigned')

    const nextContent = {
      ...content,
      branding: nextBrand.branding,
      engine: {
        ...(content.engine || {}),
        theme: nextBrand.theme,
        globals: nextBrand.globals,
        navigation: nextBrand.navigation,
      },
    }

    setBrand(nextBrand)
    setContent(nextContent)
    setNotice('Saving')

    try {
      const saved = await api.saveContent(websiteId, nextContent)
      setContent(saved)
      setBrand(normaliseBrand(saved))
      setNotice(message)
    } catch (error) {
      setNotice(error.message || 'Save failed')
    }
  }

  function updateSection(section, changes) {
    save({ ...brand, [section]: { ...brand[section], ...changes } })
  }

  function updateNavigation(id, changes) {
    save({
      ...brand,
      navigation: brand.navigation.map(item => (item.id === id ? { ...item, ...changes } : item)),
    }, 'Navigation updated')
  }

  function moveNavigation(id, direction) {
    const items = [...brand.navigation].sort((a, b) => a.order - b.order)
    const index = items.findIndex(item => item.id === id)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return
    const [item] = items.splice(index, 1)
    items.splice(nextIndex, 0, item)
    save({ ...brand, navigation: items.map((entry, order) => ({ ...entry, order: order + 1 })) }, 'Navigation reordered')
  }

  async function upload(slotId, file) {
    if (!file || !websiteId || !canManage) return
    setNotice(`Uploading ${slotId}`)
    try {
      const asset = await api.uploadAsset(owner, websiteId, slotId, file)
      const url = assetUrl(asset)
      const nextBranding = { ...brand.branding, [slotId]: url }
      const nextBrand = { ...brand, branding: nextBranding }
      setAssets(current => [asset, ...current.filter(item => item.id !== asset.id)])
      await save(nextBrand, `${file.name} uploaded`)
    } catch (error) {
      setNotice(error.message || 'Upload failed')
    }
  }

  function chooseAsset(slotId, assetId) {
    const asset = imageAssets.find(item => item.id === assetId)
    if (!asset) return
    updateSection('branding', { [slotId]: assetUrl(asset) })
  }

  async function submitForApproval() {
    if (!canRequestUpdates) return setNotice('Approval request permission required')
    if (!website?.id) return setNotice('No website assigned')

    try {
      await api.createPublishRequest({
        websiteId: website.id,
        websiteName: website.name,
        repository: website.repository,
        title: 'Branding update request',
        createdBy: account?.name,
        contentPath: `server-data/content/${website.id}.json`,
      })
      setNotice('Branding submitted for approval')
    } catch (error) {
      setNotice(error.message || 'Approval request failed')
    }
  }

  const previewText = brand.theme.text || readableText(brand.theme.background)
  const visibleNavigation = [...brand.navigation]
    .filter(item => item.visible !== false)
    .sort((a, b) => a.order - b.order)

  if (!canManage) {
    return (
      <Layout client={client} title="Branding">
        <section className="moduleHero card">
          <div>
            <span>Branding</span>
            <h2>Brand access restricted</h2>
            <p>Your account can view the website but does not currently have permission to change its branding.</p>
          </div>
          <button>{notice}</button>
        </section>
      </Layout>
    )
  }

  return (
    <Layout client={client} title="Branding">
      <section className="moduleHero card visualBrandHero">
        <div>
          <span>Visual Branding</span>
          <h2>{website?.name || 'Assigned Website'}</h2>
          <p>Manage logos, colours, fonts, navigation, header and footer while seeing the result immediately.</p>
        </div>
        <div className="visualBrandActions">
          {!client && availableWebsites.length > 1 && (
            <select value={websiteId} onChange={event => load(event.target.value)}>
              {availableWebsites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          )}
          {canRequestUpdates && <button onClick={submitForApproval}>Submit for Approval</button>}
          <button>{notice}</button>
        </div>
      </section>

      <section className="visualBrandGrid">
        <aside className="card visualBrandControls">
          <section>
            <div className="panelHead"><h2>Logos & Icons</h2><span>Drag and drop</span></div>
            {[
              ['primaryLogo', 'Primary Logo'],
              ['favicon', 'Favicon'],
              ['socialIcon', 'Social / Share Image'],
            ].map(([slotId, label]) => (
              <article
                className={dragSlot === slotId ? 'brandDropZone dragging' : 'brandDropZone'}
                key={slotId}
                onDragOver={event => { event.preventDefault(); setDragSlot(slotId) }}
                onDragLeave={() => setDragSlot('')}
                onDrop={event => {
                  event.preventDefault()
                  setDragSlot('')
                  upload(slotId, event.dataTransfer.files?.[0])
                }}
              >
                <div className="brandDropPreview">
                  {brand.branding[slotId] ? <img src={brand.branding[slotId]} alt={label} /> : <span>No image</span>}
                </div>
                <div>
                  <b>{label}</b>
                  <small>Drop an image here or choose a file.</small>
                </div>
                <label className="brandUploadButton">Upload<input type="file" accept="image/*,.ico" onChange={event => upload(slotId, event.target.files?.[0])} /></label>
                <select value="" onChange={event => chooseAsset(slotId, event.target.value)}>
                  <option value="">Use media library</option>
                  {imageAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                </select>
              </article>
            ))}
          </section>

          <section>
            <div className="panelHead"><h2>Colours & Type</h2><span>Live preview</span></div>
            <div className="brandFieldGrid">
              <label>Primary Colour<input type="color" value={brand.theme.primary} onChange={event => updateSection('theme', { primary: event.target.value })} /></label>
              <label>Secondary Colour<input type="color" value={brand.theme.secondary} onChange={event => updateSection('theme', { secondary: event.target.value })} /></label>
              <label>Background<input type="color" value={brand.theme.background} onChange={event => updateSection('theme', { background: event.target.value })} /></label>
              <label>Text Colour<input type="color" value={brand.theme.text} onChange={event => updateSection('theme', { text: event.target.value })} /></label>
              <label>Font<select value={brand.theme.font} onChange={event => updateSection('theme', { font: event.target.value })}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Trebuchet MS</option><option>Courier New</option></select></label>
              <label>Button Style<select value={brand.theme.buttonStyle} onChange={event => updateSection('theme', { buttonStyle: event.target.value })}><option>Gradient</option><option>Solid</option><option>Outline</option></select></label>
              <label>Corner Roundness<input type="range" min="0" max="32" value={brand.theme.radius} onChange={event => updateSection('theme', { radius: Number(event.target.value) })} /></label>
              <label>Spacing<select value={brand.theme.spacing} onChange={event => updateSection('theme', { spacing: event.target.value })}><option>Compact</option><option>Comfortable</option><option>Spacious</option></select></label>
            </div>
          </section>

          <section>
            <div className="panelHead"><h2>Header & Footer</h2><span>One place</span></div>
            <label>Header Style<select value={brand.branding.headerStyle} onChange={event => updateSection('branding', { headerStyle: event.target.value })}><option>Contained</option><option>Full Width</option><option>Minimal</option></select></label>
            <label>Footer Style<select value={brand.branding.footerStyle} onChange={event => updateSection('branding', { footerStyle: event.target.value })}><option>Simple</option><option>Columns</option><option>Minimal</option></select></label>
            <label>Announcement<input value={brand.globals.announcement} onChange={event => updateSection('globals', { announcement: event.target.value })} /></label>
            <label className="formCheck"><input type="checkbox" checked={brand.branding.showAnnouncement} onChange={event => updateSection('branding', { showAnnouncement: event.target.checked })} /> Show announcement bar</label>
            <label>Footer Text<input value={brand.globals.footerText} onChange={event => updateSection('globals', { footerText: event.target.value })} /></label>
          </section>

          <section>
            <div className="panelHead"><h2>Navigation</h2><span>Drag order</span></div>
            <div className="brandNavList">
              {[...brand.navigation].sort((a, b) => a.order - b.order).map(item => (
                <article key={item.id}>
                  <label>Label<input value={item.label} onChange={event => updateNavigation(item.id, { label: event.target.value })} /></label>
                  <label className="formCheck"><input type="checkbox" checked={item.visible !== false} onChange={event => updateNavigation(item.id, { visible: event.target.checked })} /> Visible</label>
                  <div><button onClick={() => moveNavigation(item.id, 'up')}>↑</button><button onClick={() => moveNavigation(item.id, 'down')}>↓</button></div>
                </article>
              ))}
              {!brand.navigation.length && <p>No navigation items have been configured yet.</p>}
            </div>
          </section>
        </aside>

        <section className="card visualBrandPreviewPanel">
          <div className="panelHead"><h2>Live Brand Preview</h2><span>{brand.theme.mode}</span></div>
          <div
            className={`brandWebsitePreview ${brand.branding.headerStyle.toLowerCase().replaceAll(' ', '-')}`}
            style={{
              '--brand-primary': brand.theme.primary,
              '--brand-secondary': brand.theme.secondary,
              '--brand-background': brand.theme.background,
              '--brand-text': previewText,
              '--brand-radius': `${brand.theme.radius}px`,
              '--brand-font': brand.theme.font,
            }}
          >
            {brand.branding.showAnnouncement && <div className="brandAnnouncement">{brand.globals.announcement}</div>}
            <header>
              <div className="brandPreviewLogo">
                {brand.branding.primaryLogo ? <img src={brand.branding.primaryLogo} alt={website?.name || 'Website'} /> : <b>{website?.logo || website?.name?.slice(0, 3) || 'SITE'}</b>}
              </div>
              <nav>{visibleNavigation.map(item => <span key={item.id}>{item.label}</span>)}</nav>
            </header>
            <main>
              <span>Official Website</span>
              <h1>{website?.name || 'Your Website'}</h1>
              <p>This preview updates as you edit your brand settings.</p>
              <button className={brand.theme.buttonStyle.toLowerCase()}>Primary Action</button>
            </main>
            <section className="brandPreviewCards">
              <article><b>Brand</b><p>Your colours, spacing and typography appear here.</p></article>
              <article><b>Content</b><p>Your live website content remains managed through the visual editor.</p></article>
              <article><b>Commerce</b><p>Your products use the same approved brand system.</p></article>
            </section>
            <footer className={brand.branding.footerStyle.toLowerCase()}>{brand.globals.footerText}</footer>
          </div>
        </section>
      </section>
    </Layout>
  )
}
