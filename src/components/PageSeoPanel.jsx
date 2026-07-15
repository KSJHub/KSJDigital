import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

const TITLE_LIMIT = 60
const DESCRIPTION_LIMIT = 160

function resolvedImage(asset) {
  return asset?.resolvedUrl || asset?.url || ''
}

function routePath(page) {
  if (page.path) return page.path
  if (!page.slug) return '/'
  return `/${String(page.slug).replace(/^\/+/, '')}`
}

function customRegistryEntries(pages = []) {
  return pages.map((page, index) => ({
    id: page.id || `custom-${page.slug || index}`,
    customPageId: page.id,
    slug: page.slug || '',
    path: routePath(page),
    label: page.label || page.title || 'Custom Page',
    type: 'custom',
    layoutKey: 'dynamic',
    visible: page.visible !== false,
    navigable: page.visible !== false,
    editable: true,
    order: 1000 + index,
  }))
}

function mergeRegistry(content = {}, fallbackPages = []) {
  const engine = content.engine || {}
  const customPages = Array.isArray(engine.pages) ? engine.pages : fallbackPages
  const registry = Array.isArray(engine.pageRegistry) ? engine.pageRegistry : []
  const registeredCustomIds = new Set(registry.map(page => page.customPageId || (page.type === 'custom' ? page.id : null)).filter(Boolean))
  const additions = customRegistryEntries(customPages).filter(page => !registeredCustomIds.has(page.customPageId))
  return [...registry, ...additions].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
}

function fallbackCopy(content, page) {
  const customPages = content.engine?.pages || []
  const custom = page.customPageId
    ? customPages.find(item => item.id === page.customPageId)
    : page.type === 'custom'
      ? customPages.find(item => item.id === page.id || item.slug === page.slug)
      : null

  if (custom) return {
    title: custom.title || custom.label || page.label,
    description: custom.intro || '',
  }

  const source = page.layoutKey ? content[page.layoutKey] : null
  if (page.id === 'home') return {
    title: content.home?.heroTitle || content.brand?.name || page.label,
    description: content.home?.heroText || content.brand?.shortTagline || content.brand?.tagline || '',
  }
  if (page.id === 'merch') return {
    title: content.merch?.heading || content.home?.merchTitle || page.label,
    description: content.merch?.description || content.home?.merchText || '',
  }
  return {
    title: source?.title || page.label,
    description: source?.intro || source?.description || '',
  }
}

export function PageSeoPanel({
  pages = [],
  selectedPageId,
  onSelectPage,
  imageAssets = [],
  website,
  canManagePages,
}) {
  const [content, setContent] = useState(null)
  const [localSelectedId, setLocalSelectedId] = useState(selectedPageId || '')
  const [status, setStatus] = useState('Loading pages…')
  const [saving, setSaving] = useState(false)

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
    }).catch(error => !cancelled && setStatus(error.message || 'Page SEO unavailable'))
    return () => { cancelled = true }
  }, [website?.id])

  useEffect(() => {
    if (!selectedPageId) return
    setLocalSelectedId(selectedPageId)
  }, [selectedPageId])

  const registry = useMemo(() => mergeRegistry(content || {}, pages), [content, pages])
  const page = registry.find(item => item.id === localSelectedId) || registry[0]

  if (!page) {
    return (
      <section className="card settingsGroup pageSeoGroup">
        <div className="panelHead"><h2>Page SEO & Sharing</h2><span>{status}</span></div>
        <p className="pageManagerHelp">This website has no public pages registered yet. Add pages to its page registry or create a custom page.</p>
      </section>
    )
  }

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

  function choosePage(id) {
    setLocalSelectedId(id)
    onSelectPage?.(id)
  }

  function editLocal(changes) {
    setContent(current => {
      if (!current) return current
      const next = structuredClone(current)
      next.engine ||= {}
      if (page.type === 'custom' && customPageIndex >= 0) {
        next.engine.pages ||= []
        next.engine.pages[customPageIndex] = {
          ...next.engine.pages[customPageIndex],
          seo: { ...(next.engine.pages[customPageIndex].seo || {}), ...changes },
        }
      } else {
        next.engine.pageSeo ||= {}
        next.engine.pageSeo[page.id] = { ...(next.engine.pageSeo[page.id] || {}), ...changes }
      }
      return next
    })
  }

  async function save(changes, message) {
    if (!canManagePages || saving || !content || !website?.id) return
    const next = structuredClone(content)
    next.engine ||= {}
    if (page.type === 'custom' && customPageIndex >= 0) {
      next.engine.pages ||= []
      next.engine.pages[customPageIndex] = {
        ...next.engine.pages[customPageIndex],
        seo: { ...(next.engine.pages[customPageIndex].seo || {}), ...changes },
      }
    } else {
      next.engine.pageSeo ||= {}
      next.engine.pageSeo[page.id] = { ...(next.engine.pageSeo[page.id] || {}), ...changes }
    }

    setContent(next)
    setSaving(true)
    setStatus('Saving…')
    try {
      const saved = await api.saveContent(website.id, next)
      setContent(saved)
      setStatus(`✓ ${message}`)
    } catch (error) {
      setStatus(error.message || 'SEO save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`card settingsGroup pageSeoGroup ${canManagePages ? '' : 'permissionLocked'}`}>
      <div className="panelHead">
        <div><h2>Page SEO & Sharing</h2><p>Generated from this website’s own page registry, including layout and custom pages.</p></div>
        <span>{canManagePages ? status : '🔒 Locked by KSJ Digital'}</span>
      </div>

      <label>Choose page
        <select value={page.id} disabled={!canManagePages || saving} onChange={event => choosePage(event.target.value)}>
          {registry.map(item => <option key={item.id} value={item.id}>{item.label || item.id} · {routePath(item)} · {item.type === 'custom' ? 'Custom' : 'Layout'}</option>)}
        </select>
      </label>

      <div className="pageRegistrySummary">
        <span><b>{page.type === 'custom' ? 'Custom page' : 'Repository layout'}</b><small>{routePath(page)}</small></span>
        <span><b>{page.navigable === false ? 'Not in main navigation' : 'Navigation eligible'}</b><small>{page.visible === false ? 'Page hidden' : 'Page visible'}</small></span>
        <span><b>{page.layoutKey || 'dynamic'}</b><small>Layout key</small></span>
      </div>

      <div className="seoEditorGrid">
        <div className="seoFields">
          <label>Search title
            <input
              disabled={!canManagePages || saving}
              value={title}
              maxLength={90}
              placeholder={fallback.title || page.label}
              onChange={event => editLocal({ title: event.target.value })}
              onBlur={() => save({ title }, 'SEO title saved')}
            />
            <small className={title.length > TITLE_LIMIT ? 'seoCount warning' : 'seoCount'}>{title.length}/{TITLE_LIMIT} recommended characters</small>
          </label>

          <label>Search description
            <textarea
              disabled={!canManagePages || saving}
              value={description}
              maxLength={240}
              rows="4"
              placeholder={fallback.description || 'Describe this page.'}
              onChange={event => editLocal({ description: event.target.value })}
              onBlur={() => save({ description }, 'SEO description saved')}
            />
            <small className={description.length > DESCRIPTION_LIMIT ? 'seoCount warning' : 'seoCount'}>{description.length}/{DESCRIPTION_LIMIT} recommended characters</small>
          </label>

          <label>Social sharing image
            <select disabled={!canManagePages || saving} value={seo.image || ''} onChange={event => save({ image: event.target.value }, 'Social image saved')}>
              <option value="">Use website default social image</option>
              {imageAssets.map(asset => <option key={asset.id || asset.url} value={resolvedImage(asset)}>{asset.name || asset.slotId || 'Image asset'}</option>)}
            </select>
          </label>

          <label>Or paste image URL
            <input
              disabled={!canManagePages || saving}
              value={seo.image || ''}
              placeholder="https://…"
              onChange={event => editLocal({ image: event.target.value })}
              onBlur={() => save({ image: seo.image || '' }, 'Social image saved')}
            />
          </label>

          <label className="formCheck seoNoIndex">
            <input type="checkbox" disabled={!canManagePages || saving} checked={seo.noIndex === true} onChange={event => save({ noIndex: event.target.checked }, 'Search visibility saved')} />
            Hide this page from search engines
          </label>
          <small className="pageManagerHelp">Search visibility is separate from page and navigation visibility.</small>
        </div>

        <div className="seoPreviews">
          <article className="searchPreview">
            <span>{pageUrl}</span>
            <h3>{previewTitle} | {website?.name || 'Website'}</h3>
            <p>{previewDescription}</p>
          </article>

          <article className="socialPreview">
            <div className="socialPreviewImage">{previewImage ? <img src={previewImage} alt="Social sharing preview" /> : <span>Website default image</span>}</div>
            <div><small>{domain || 'example.com'}</small><h3>{previewTitle}</h3><p>{previewDescription}</p></div>
          </article>

          <div className={`indexStatus ${seo.noIndex ? 'blocked' : ''}`}>
            <b>{seo.noIndex ? 'Not indexed' : 'Searchable'}</b>
            <span>{seo.noIndex ? 'Search engines are instructed not to list this page.' : 'Search engines may include this page after it is published and crawled.'}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
