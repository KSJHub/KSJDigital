import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

const TITLE_LIMIT = 60
const DESCRIPTION_LIMIT = 160

function resolvedImage(asset) { return asset?.resolvedUrl || asset?.url || '' }
function routePath(page) { if (page.path) return page.path; if (!page.slug) return '/'; return `/${String(page.slug).replace(/^\/+/, '')}` }
function slugify(value = '') { return String(value).toLowerCase().trim().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }
function makeId(prefix = 'page') { return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

function customRegistryEntries(pages = []) {
  return pages.map((page, index) => ({ id: page.id || `custom-${page.slug || index}`, customPageId: page.id, slug: page.slug || '', path: routePath(page), label: page.label || page.title || 'Custom Page', type: 'custom', layoutKey: 'dynamic', visible: page.visible !== false, navigable: page.navigable !== false && page.visible !== false, editable: true, order: 1000 + index }))
}

function mergeRegistry(content = {}, fallbackPages = []) {
  const engine = content.engine || {}
  const customPages = Array.isArray(engine.pages) ? engine.pages : fallbackPages
  const registry = Array.isArray(engine.pageRegistry) ? engine.pageRegistry : []
  const registeredCustomIds = new Set(registry.map(page => page.customPageId || (page.type === 'custom' ? page.id : null)).filter(Boolean))
  return [...registry, ...customRegistryEntries(customPages).filter(page => !registeredCustomIds.has(page.customPageId))].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
}

function fallbackCopy(content, page) {
  const customPages = content.engine?.pages || []
  const custom = page.customPageId ? customPages.find(item => item.id === page.customPageId) : page.type === 'custom' ? customPages.find(item => item.id === page.id || item.slug === page.slug) : null
  if (custom) return { title: custom.title || custom.label || page.label, description: custom.intro || '' }
  const source = page.layoutKey ? content[page.layoutKey] : null
  if (page.id === 'home') return { title: content.home?.heroTitle || content.brand?.name || page.label, description: content.home?.heroText || content.brand?.shortTagline || content.brand?.tagline || '' }
  if (page.id === 'merch') return { title: content.merch?.heading || content.home?.merchTitle || page.label, description: content.merch?.description || content.home?.merchText || '' }
  return { title: source?.title || page.label, description: source?.intro || source?.description || '' }
}

function uniqueSlug(label, registry) {
  const base = slugify(label) || 'new-page'
  const used = new Set(registry.map(page => String(page.slug || '').toLowerCase()))
  let slug = base
  let suffix = 2
  while (used.has(slug)) slug = `${base}-${suffix++}`
  return slug
}

function registryNavigation(registry, existing = []) {
  const external = existing.filter(item => item.external === true)
  const managed = registry.filter(page => page.navigable !== false).map((page, index) => ({
    id: page.navigationId || page.id,
    pageId: page.customPageId,
    customPage: page.type === 'custom',
    label: page.label,
    target: routePath(page),
    visible: page.visible !== false,
    external: false,
    order: index + 1,
  }))
  return [...managed, ...external.map((item, index) => ({ ...item, order: managed.length + index + 1 }))]
}

export function PageSeoPanel({ pages = [], selectedPageId, onSelectPage, imageAssets = [], website, canManagePages }) {
  const [content, setContent] = useState(null)
  const [localSelectedId, setLocalSelectedId] = useState(selectedPageId || '')
  const [status, setStatus] = useState('Loading pages…')
  const [saving, setSaving] = useState(false)
  const [newPageName, setNewPageName] = useState('')

  useEffect(() => {
    if (!website?.id) return
    let cancelled = false
    setStatus('Loading pages…')
    api.getContent(website.id).then(nextContent => {
      if (cancelled) return
      const registry = mergeRegistry(nextContent, pages)
      setContent(nextContent)
      setLocalSelectedId(current => registry.some(page => page.id === current) ? current : (registry[0]?.id || ''))
      setStatus('Ready')
    }).catch(error => !cancelled && setStatus(error.message || 'Page management unavailable'))
    return () => { cancelled = true }
  }, [website?.id])

  useEffect(() => { if (selectedPageId) setLocalSelectedId(selectedPageId) }, [selectedPageId])

  const registry = useMemo(() => mergeRegistry(content || {}, pages), [content, pages])
  const page = registry.find(item => item.id === localSelectedId) || registry[0]

  async function persist(next, message) {
    if (!canManagePages || saving || !website?.id) return false
    setContent(next)
    setSaving(true)
    setStatus('Saving…')
    try {
      const saved = await api.saveContent(website.id, next)
      setContent(saved)
      setStatus(`✓ ${message}`)
      return true
    } catch (error) {
      setStatus(error.message || 'Save failed')
      return false
    } finally { setSaving(false) }
  }

  function withRegistry(nextRegistry, source = content) {
    const next = structuredClone(source || {})
    next.engine ||= {}
    next.engine.pageRegistry = nextRegistry.map((entry, index) => ({ ...entry, order: index + 1 }))
    next.engine.navigation = registryNavigation(next.engine.pageRegistry, next.engine.navigation || next.navigation || [])
    return next
  }

  function updateRegistryPage(pageId, changes, message) {
    const nextRegistry = registry.map(entry => entry.id === pageId ? { ...entry, ...changes } : entry)
    const next = withRegistry(nextRegistry)
    if (changes.label !== undefined || changes.visible !== undefined || changes.navigable !== undefined) {
      next.engine.pages = (next.engine.pages || []).map(custom => custom.id === (pageId === page?.id ? page?.customPageId : nextRegistry.find(item => item.id === pageId)?.customPageId) ? { ...custom, ...(changes.label !== undefined ? { label: changes.label } : {}), ...(changes.visible !== undefined ? { visible: changes.visible } : {}), ...(changes.navigable !== undefined ? { navigable: changes.navigable } : {}) } : custom)
    }
    persist(next, message)
  }

  function movePage(pageId, direction) {
    const items = [...registry]
    const index = items.findIndex(entry => entry.id === pageId)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= items.length) return
    const [entry] = items.splice(index, 1)
    items.splice(target, 0, entry)
    persist(withRegistry(items), 'Page order saved')
  }

  async function createPage() {
    const label = newPageName.trim()
    if (!label || !content) return
    const slug = uniqueSlug(label, registry)
    const id = makeId()
    const customPage = { id, slug, label, title: label, eyebrow: 'New Page', intro: 'Add an introduction, then build this page with managed sections.', visible: true, navigable: true, seo: { title: '', description: '', image: '', noIndex: false } }
    const entry = { id, customPageId: id, slug, path: `/${slug}`, label, type: 'custom', layoutKey: 'dynamic', visible: true, navigable: true, editable: true, order: registry.length + 1 }
    const next = structuredClone(content)
    next.engine ||= {}
    next.engine.pages = [...(next.engine.pages || []), customPage]
    next.engine.pageBlocks ||= {}
    next.engine.pageBlocks[slug] ||= []
    const nextRegistry = [...registry, entry]
    next.engine.pageRegistry = nextRegistry.map((item, index) => ({ ...item, order: index + 1 }))
    next.engine.navigation = registryNavigation(next.engine.pageRegistry, next.engine.navigation || [])
    if (await persist(next, 'New page created')) { setNewPageName(''); setLocalSelectedId(id); onSelectPage?.(id) }
  }

  function renameCustomSlug(entry, value) {
    const slug = slugify(value)
    if (!slug || registry.some(item => item.id !== entry.id && item.slug === slug)) { setStatus('That page URL is unavailable'); return }
    const next = structuredClone(content)
    next.engine ||= {}
    const oldSlug = entry.slug
    next.engine.pages = (next.engine.pages || []).map(custom => custom.id === entry.customPageId ? { ...custom, slug } : custom)
    next.engine.pageRegistry = registry.map(item => item.id === entry.id ? { ...item, slug, path: `/${slug}` } : item)
    next.engine.pageBlocks ||= {}
    if (oldSlug !== slug && next.engine.pageBlocks[oldSlug]) { next.engine.pageBlocks[slug] = next.engine.pageBlocks[oldSlug]; delete next.engine.pageBlocks[oldSlug] }
    next.engine.navigation = registryNavigation(next.engine.pageRegistry, next.engine.navigation || [])
    persist(next, 'Page URL saved')
  }

  async function duplicatePage(entry) {
    const source = (content.engine?.pages || []).find(item => item.id === entry.customPageId)
    if (!source) return
    const id = makeId()
    const label = `${source.label || source.title || entry.label} Copy`
    const slug = uniqueSlug(label, registry)
    const copy = { ...structuredClone(source), id, slug, label, title: label, visible: false, navigable: false, seo: { ...(source.seo || {}), title: '', noIndex: true } }
    const copyEntry = { ...entry, id, customPageId: id, slug, path: `/${slug}`, label, visible: false, navigable: false, order: registry.length + 1 }
    const next = structuredClone(content)
    next.engine.pages = [...(next.engine.pages || []), copy]
    next.engine.pageBlocks ||= {}
    next.engine.pageBlocks[slug] = structuredClone(next.engine.pageBlocks[source.slug] || []).map(block => ({ ...block, id: makeId('block') }))
    next.engine.pageRegistry = [...registry, copyEntry].map((item, index) => ({ ...item, order: index + 1 }))
    next.engine.navigation = registryNavigation(next.engine.pageRegistry, next.engine.navigation || [])
    if (await persist(next, 'Page duplicated as hidden draft')) { setLocalSelectedId(id); onSelectPage?.(id) }
  }

  function deletePage(entry) {
    if (entry.type !== 'custom' || !window.confirm(`Delete “${entry.label}” and all sections on that page?`)) return
    const next = structuredClone(content)
    next.engine.pages = (next.engine.pages || []).filter(item => item.id !== entry.customPageId)
    next.engine.pageRegistry = registry.filter(item => item.id !== entry.id).map((item, index) => ({ ...item, order: index + 1 }))
    next.engine.pageBlocks ||= {}
    delete next.engine.pageBlocks[entry.slug]
    next.engine.navigation = registryNavigation(next.engine.pageRegistry, next.engine.navigation || [])
    persist(next, 'Page deleted').then(saved => { if (saved) setLocalSelectedId(next.engine.pageRegistry[0]?.id || '') })
  }

  if (!page) return <section className="card settingsGroup pageSeoGroup"><div className="panelHead"><h2>Pages, Navigation & SEO</h2><span>{status}</span></div><div className="newPageRow"><label>New page name<input value={newPageName} onChange={event => setNewPageName(event.target.value)} /></label><button onClick={createPage}>＋ Create Page</button></div></section>

  const customPages = content?.engine?.pages || []
  const customPageIndex = customPages.findIndex(item => item.id === (page.customPageId || page.id))
  const customPage = customPageIndex >= 0 ? customPages[customPageIndex] : null
  const registrySeo = content?.engine?.pageSeo?.[page.id] || {}
  const seo = page.type === 'custom' && customPage ? (customPage.seo || {}) : registrySeo
  const fallback = fallbackCopy(content || {}, page)
  const title = seo.title || ''
  const description = seo.description || ''
  const previewTitle = title.trim() || fallback.title || page.label || 'Untitled Page'
  const previewDescription = description.trim() || fallback.description || 'Add a page description for search results and social sharing.'
  const previewImage = seo.image || ''
  const domain = String(website?.domain || '').replace(/\/$/, '')
  const pageUrl = `${domain || 'https://example.com'}${routePath(page)}`

  function choosePage(id) { setLocalSelectedId(id); onSelectPage?.(id) }
  function editSeo(changes) { setContent(current => { const next = structuredClone(current); next.engine ||= {}; if (page.type === 'custom' && customPageIndex >= 0) next.engine.pages[customPageIndex] = { ...next.engine.pages[customPageIndex], seo: { ...(next.engine.pages[customPageIndex].seo || {}), ...changes } }; else { next.engine.pageSeo ||= {}; next.engine.pageSeo[page.id] = { ...(next.engine.pageSeo[page.id] || {}), ...changes } }; return next }) }
  function saveSeo(changes, message) { const next = structuredClone(content); next.engine ||= {}; if (page.type === 'custom' && customPageIndex >= 0) next.engine.pages[customPageIndex] = { ...next.engine.pages[customPageIndex], seo: { ...(next.engine.pages[customPageIndex].seo || {}), ...changes } }; else { next.engine.pageSeo ||= {}; next.engine.pageSeo[page.id] = { ...(next.engine.pageSeo[page.id] || {}), ...changes } }; persist(next, message) }

  return (
    <section className={`card settingsGroup pageSeoGroup registryManagerGroup ${canManagePages ? '' : 'permissionLocked'}`}>
      <div className="panelHead"><div><h2>Pages, Navigation & SEO</h2><p>One registry-driven manager for this website’s repository layouts and custom pages.</p></div><span>{canManagePages ? status : '🔒 Locked by KSJ Digital'}</span></div>
      <div className="newPageRow"><label>New custom page<input disabled={!canManagePages || saving} value={newPageName} onChange={event => setNewPageName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') createPage() }} placeholder="Sponsors, Services, Booking…" /></label><button disabled={!canManagePages || saving || !newPageName.trim()} onClick={createPage}>＋ Create Page</button></div>

      <div className="registryPageList">{registry.map(entry => <article key={entry.id} className={entry.id === page.id ? 'active' : ''} onClick={() => choosePage(entry.id)}><div><b>{entry.label}</b><small>{routePath(entry)} · {entry.type === 'custom' ? 'Custom page' : 'Repository layout'}</small></div><label onClick={event => event.stopPropagation()}><input type="checkbox" disabled={!canManagePages || saving} checked={entry.visible !== false} onChange={event => updateRegistryPage(entry.id, { visible: event.target.checked }, 'Page visibility saved')} />Visible</label><label onClick={event => event.stopPropagation()}><input type="checkbox" disabled={!canManagePages || saving} checked={entry.navigable !== false} onChange={event => updateRegistryPage(entry.id, { navigable: event.target.checked }, 'Navigation setting saved')} />Navigation</label><div className="navigationActions" onClick={event => event.stopPropagation()}><button disabled={!canManagePages || saving} onClick={() => movePage(entry.id, 'up')}>↑</button><button disabled={!canManagePages || saving} onClick={() => movePage(entry.id, 'down')}>↓</button>{entry.type === 'custom' && <button disabled={!canManagePages || saving} onClick={() => duplicatePage(entry)}>⧉</button>}{entry.type === 'custom' && <button className="danger" disabled={!canManagePages || saving} onClick={() => deletePage(entry)}>×</button>}</div></article>)}</div>

      <div className="registryPageEditor">
        <div className="settingsFields twoColumns"><label>Page label<input disabled={!canManagePages || saving} value={page.label || ''} onChange={event => setContent(current => { const next = structuredClone(current); next.engine.pageRegistry = mergeRegistry(next, pages).map(entry => entry.id === page.id ? { ...entry, label: event.target.value } : entry); return next })} onBlur={event => updateRegistryPage(page.id, { label: event.target.value }, 'Page label saved')} /></label><label>Page route<div className="slugInput"><span>/</span><input disabled={page.type !== 'custom' || !canManagePages || saving} defaultValue={String(page.slug || '')} onBlur={event => page.type === 'custom' && renameCustomSlug(page, event.target.value)} /></div><small>{page.type === 'custom' ? 'Custom page URL.' : 'Route is controlled by the website repository.'}</small></label></div>
        <div className="pageRegistrySummary"><span><b>{page.type === 'custom' ? 'Custom page' : 'Repository layout'}</b><small>{routePath(page)}</small></span><span><b>{page.navigable === false ? 'Not in navigation' : 'Navigation enabled'}</b><small>{page.visible === false ? 'Page hidden' : 'Page visible'}</small></span><span><b>{page.layoutKey || 'dynamic'}</b><small>Layout key</small></span></div>
      </div>

      <div className="seoEditorGrid"><div className="seoFields"><h3>Search & Sharing</h3><label>Search title<input disabled={!canManagePages || saving} value={title} maxLength={90} placeholder={fallback.title || page.label} onChange={event => editSeo({ title: event.target.value })} onBlur={() => saveSeo({ title }, 'SEO title saved')} /><small className={title.length > TITLE_LIMIT ? 'seoCount warning' : 'seoCount'}>{title.length}/{TITLE_LIMIT} recommended characters</small></label><label>Search description<textarea disabled={!canManagePages || saving} value={description} maxLength={240} rows="4" placeholder={fallback.description || 'Describe this page.'} onChange={event => editSeo({ description: event.target.value })} onBlur={() => saveSeo({ description }, 'SEO description saved')} /><small className={description.length > DESCRIPTION_LIMIT ? 'seoCount warning' : 'seoCount'}>{description.length}/{DESCRIPTION_LIMIT} recommended characters</small></label><label>Social sharing image<select disabled={!canManagePages || saving} value={seo.image || ''} onChange={event => saveSeo({ image: event.target.value }, 'Social image saved')}><option value="">Use website default social image</option>{imageAssets.map(asset => <option key={asset.id || asset.url} value={resolvedImage(asset)}>{asset.name || asset.slotId || 'Image asset'}</option>)}</select></label><label>Or paste image URL<input disabled={!canManagePages || saving} value={seo.image || ''} placeholder="https://…" onChange={event => editSeo({ image: event.target.value })} onBlur={() => saveSeo({ image: seo.image || '' }, 'Social image saved')} /></label><label className="formCheck seoNoIndex"><input type="checkbox" disabled={!canManagePages || saving} checked={seo.noIndex === true} onChange={event => saveSeo({ noIndex: event.target.checked }, 'Search visibility saved')} />Hide this page from search engines</label></div><div className="seoPreviews"><article className="searchPreview"><span>{pageUrl}</span><h3>{previewTitle} | {website?.name || 'Website'}</h3><p>{previewDescription}</p></article><article className="socialPreview"><div className="socialPreviewImage">{previewImage ? <img src={previewImage} alt="Social sharing preview" /> : <span>Website default image</span>}</div><div><small>{domain || 'example.com'}</small><h3>{previewTitle}</h3><p>{previewDescription}</p></div></article><div className={`indexStatus ${seo.noIndex ? 'blocked' : ''}`}><b>{seo.noIndex ? 'Not indexed' : 'Searchable'}</b><span>{seo.noIndex ? 'Search engines are instructed not to list this page.' : 'Search engines may include this page after it is published and crawled.'}</span></div></div></div>
    </section>
  )
}
