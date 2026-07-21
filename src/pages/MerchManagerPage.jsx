import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

const ASSET_BASE = import.meta.env.VITE_KSJ_ASSET_URL || 'http://localhost:4174'
const TABS = ['Basics', 'Inventory', 'Media', 'Checkout', 'Advanced']

function assetUrl(asset) {
  if (!asset?.url) return ''
  return asset.url.startsWith('http') ? asset.url : `${ASSET_BASE}${asset.url}`
}

function listFromText(value = '') {
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))]
}

function compactTag(value = '') {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

function productDefaults(product = {}) {
  const external = product.checkout?.mode === 'external' || (product.checkout?.provider && !['stripe', 'paypal'].includes(String(product.checkout.provider).toLowerCase()))
  return {
    id: product.id || `product-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: product.name || 'New Product',
    category: product.category || 'Apparel',
    type: product.type || 'Product',
    description: product.description || '',
    priceGBP: Math.max(0, Number(product.priceGBP || 0)),
    image: {
      id: product.image?.id || '',
      title: product.image?.title || 'Product image',
      url: product.image?.url || '',
      alt: product.image?.alt || product.name || 'Product image',
    },
    availability: product.availability || 'prelaunch',
    status: product.status || 'Coming Soon',
    featured: product.featured === true,
    limited: product.limited === true,
    showInCarousel: product.showInCarousel === true,
    orderTag: product.orderTag || '',
    shippingNote: product.shippingNote || '',
    internalNotes: product.internalNotes || '',
    variants: {
      sizes: Array.isArray(product.variants?.sizes) ? product.variants.sizes : [],
      colours: Array.isArray(product.variants?.colours) ? product.variants.colours : [],
    },
    inventory: {
      trackStock: product.inventory?.trackStock === true,
      quantity: Math.max(0, Number(product.inventory?.quantity || 0)),
      lowStockThreshold: Math.max(0, Number(product.inventory?.lowStockThreshold ?? 2)),
    },
    fulfilmentOptions: {
      madeToOrder: product.fulfilmentOptions?.madeToOrder === true,
      leadTimeMessage: product.fulfilmentOptions?.leadTimeMessage || '',
    },
    checkout: {
      enabled: product.checkout?.enabled === true,
      mode: external ? 'external' : 'managed',
      provider: external ? 'Custom' : '',
      url: product.checkout?.url || '',
      label: product.checkout?.label || 'Buy Now',
    },
    createdAt: product.createdAt || new Date().toISOString().slice(0, 10),
  }
}

function normaliseMerch(content = {}, websiteName = 'Your Store') {
  return {
    title: content.merch?.title || `${websiteName} Merch`,
    eyebrow: content.merch?.eyebrow || 'Official Store',
    subtitle: content.merch?.subtitle || `Official products from ${websiteName}.`,
    products: (content.merch?.products || []).map(productDefaults),
  }
}

function availabilityStatus(value) {
  if (value === 'available') return 'Available'
  if (value === 'sold-out') return 'Sold Out'
  if (value === 'paused') return 'Paused'
  return 'Coming Soon'
}

function productWarnings(product, commerce = {}) {
  if (!product) return []
  const warnings = []
  if (!product.name.trim()) warnings.push('Add a product name')
  if (!product.description.trim()) warnings.push('Add a description')
  if (Number(product.priceGBP) <= 0) warnings.push('Add a price')
  if (!product.image.url.trim()) warnings.push('Add a product image')
  if (product.fulfilmentOptions.madeToOrder && !product.fulfilmentOptions.leadTimeMessage.trim()) warnings.push('Add a production timeframe')
  if (product.checkout.mode === 'external' && product.checkout.enabled && !/^https:\/\//i.test(product.checkout.url)) warnings.push('Add a secure external checkout URL')
  if (product.checkout.mode === 'managed' && product.checkout.enabled && !commerce.stripeEnabled && !commerce.paypalEnabled) warnings.push('Enable Stripe or PayPal in Store Settings')
  if (product.inventory.trackStock && !product.fulfilmentOptions.madeToOrder && product.inventory.quantity <= 0) warnings.push('Product has no ready stock')
  return warnings
}

export function MerchManagerPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const platformOwner = account?.role === 'owner'
  const [websiteId, setWebsiteId] = useState('')
  const website = platformOwner ? websites.find(site => site.id === websiteId) || websites[0] : assignedWebsite
  const owner = website?.owner || account?.id || website?.id || 'unassigned'
  const canEdit = platformOwner || account?.canEdit
  const canManageMedia = platformOwner || account?.canManageMedia
  const canRequestUpdates = platformOwner || account?.canRequestUpdates
  const [content, setContent] = useState({ pages: [] })
  const [merch, setMerch] = useState({ title: '', eyebrow: '', subtitle: '', products: [] })
  const [commerce, setCommerce] = useState({ stripeEnabled: false, paypalEnabled: false })
  const [assets, setAssets] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [tab, setTab] = useState('Basics')
  const [notice, setNotice] = useState('Loading')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [draggedId, setDraggedId] = useState('')
  const [imageDragging, setImageDragging] = useState(false)

  const selected = merch.products.find(product => product.id === selectedId) || merch.products[0]
  const warnings = productWarnings(selected, commerce)
  const imageAssets = useMemo(() => assets.filter(asset => asset.type?.startsWith('image/')), [assets])
  const providers = [commerce.stripeEnabled && 'Stripe', commerce.paypalEnabled && 'PayPal'].filter(Boolean)

  useEffect(() => {
    if (!websiteId && website?.id) setWebsiteId(website.id)
  }, [website?.id, websiteId])

  useEffect(() => {
    if (!website?.id) return
    let cancelled = false
    setNotice('Loading store')
    Promise.all([
      api.getContent(website.id),
      api.getCommerceSettings(website.id).catch(() => ({})),
      canManageMedia ? api.assets(owner, website.id).catch(() => []) : Promise.resolve([]),
    ]).then(([nextContent, nextCommerce, nextAssets]) => {
      if (cancelled) return
      const nextMerch = normaliseMerch(nextContent, website.name)
      setContent(nextContent)
      setMerch(nextMerch)
      setCommerce(nextCommerce || {})
      setAssets(nextAssets)
      setSelectedId(nextMerch.products[0]?.id || '')
      setTab('Basics')
      setSubmitted(false)
      setNotice(canEdit ? 'Ready' : 'Preview only')
    }).catch(error => !cancelled && setNotice(error.message || 'Store unavailable'))
    return () => { cancelled = true }
  }, [canEdit, canManageMedia, owner, website?.id, website?.name])

  async function persist(nextMerch, message = 'Saved') {
    if (!canEdit || !website?.id || saving) return
    const nextContent = { ...content, merch: nextMerch }
    setMerch(nextMerch)
    setContent(nextContent)
    setSaving(true)
    setSubmitted(false)
    setNotice('Saving…')
    try {
      const saved = await api.saveContent(website.id, nextContent)
      setContent(saved)
      setMerch(normaliseMerch(saved, website.name))
      setNotice(`✓ ${message}`)
    } catch (error) {
      setNotice(error.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function editStore(changes) {
    setMerch(current => ({ ...current, ...changes }))
    setSubmitted(false)
  }

  function editProduct(changes) {
    if (!selected) return
    setMerch(current => ({
      ...current,
      products: current.products.map(product => product.id === selected.id ? productDefaults({
        ...product,
        ...changes,
        image: changes.image ? { ...product.image, ...changes.image } : product.image,
        checkout: changes.checkout ? { ...product.checkout, ...changes.checkout } : product.checkout,
        variants: changes.variants ? { ...product.variants, ...changes.variants } : product.variants,
        inventory: changes.inventory ? { ...product.inventory, ...changes.inventory } : product.inventory,
        fulfilmentOptions: changes.fulfilmentOptions ? { ...product.fulfilmentOptions, ...changes.fulfilmentOptions } : product.fulfilmentOptions,
      }) : product),
    }))
    setSubmitted(false)
  }

  function addProduct() {
    const product = productDefaults()
    const next = { ...merch, products: [...merch.products, product] }
    setSelectedId(product.id)
    setTab('Basics')
    persist(next, 'Product created')
  }

  function duplicateProduct() {
    if (!selected) return
    const copy = productDefaults({ ...selected, id: '', name: `${selected.name} Copy`, createdAt: new Date().toISOString().slice(0, 10) })
    const next = { ...merch, products: [...merch.products, copy] }
    setSelectedId(copy.id)
    persist(next, 'Product duplicated')
  }

  function deleteProduct() {
    if (!selected || !window.confirm(`Delete ${selected.name}?`)) return
    const products = merch.products.filter(product => product.id !== selected.id)
    setSelectedId(products[0]?.id || '')
    persist({ ...merch, products }, 'Product deleted')
  }

  function reorderProducts(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return
    const products = [...merch.products]
    const from = products.findIndex(product => product.id === sourceId)
    const to = products.findIndex(product => product.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = products.splice(from, 1)
    products.splice(to, 0, moved)
    persist({ ...merch, products }, 'Product order saved')
  }

  async function uploadImage(file) {
    if (!file || !selected || !canManageMedia || !canEdit || !website?.id) return
    setNotice('Uploading image…')
    try {
      const asset = await api.uploadAsset(owner, website.id, `merch-${selected.id}`, file)
      const nextImage = { id: asset.id, title: asset.name, url: assetUrl(asset), alt: selected.name }
      const next = { ...merch, products: merch.products.map(product => product.id === selected.id ? { ...product, image: nextImage } : product) }
      setAssets(current => [asset, ...current.filter(item => item.id !== asset.id)])
      await persist(next, 'Image uploaded')
    } catch (error) {
      setNotice(error.message || 'Image upload failed')
    }
  }

  function chooseAsset(assetId) {
    const asset = imageAssets.find(item => item.id === assetId)
    if (!asset) return
    editProduct({ image: { id: asset.id, title: asset.name, url: assetUrl(asset), alt: selected?.name || asset.name } })
  }

  async function submitForApproval() {
    if (!canRequestUpdates || !website?.id || submitting || submitted) return
    setSubmitting(true)
    setNotice('Submitting exact draft…')
    try {
      const result = await api.createPublishRequest({
        websiteId: website.id,
        websiteName: website.name,
        repository: website.repository,
        title: 'Merch store update',
        createdBy: account?.displayName || account?.name,
        contentPath: `server-data/content/${website.id}.json`,
      })
      setSubmitted(true)
      setNotice(result?.duplicate ? 'Already waiting for review' : '✓ Merch submitted for approval')
    } catch (error) {
      setNotice(error.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout client={client} title="Merch">
      <section className="moduleHero card merchHero merchHeroV2">
        <div><span>Visual Store Manager</span><h2>{website?.name || 'Assigned Website'} Merch</h2><p>Products, images, inventory, checkout and customer preview all live on this one page.</p></div>
        <div className="merchHeroActions">
          {platformOwner && websites.length > 1 && <select value={website?.id || ''} onChange={event => setWebsiteId(event.target.value)}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select>}
          {canRequestUpdates && <button onClick={submitForApproval} disabled={submitting || submitted}>{submitting ? 'Submitting…' : submitted ? 'Submitted' : 'Submit for Approval'}</button>}
          <span>{notice}</span>
        </div>
      </section>

      <section className="card merchStoreBar">
        <label>Store title<input value={merch.title} disabled={!canEdit} onChange={event => editStore({ title: event.target.value })} onBlur={() => persist(merch, 'Store title saved')} /></label>
        <label>Small heading<input value={merch.eyebrow} disabled={!canEdit} onChange={event => editStore({ eyebrow: event.target.value })} onBlur={() => persist(merch, 'Store heading saved')} /></label>
        <label>Store description<input value={merch.subtitle} disabled={!canEdit} onChange={event => editStore({ subtitle: event.target.value })} onBlur={() => persist(merch, 'Store description saved')} /></label>
      </section>

      <section className="merchWorkspace merchWorkspaceV2">
        <aside className="card merchCatalogue">
          <div className="panelHead"><div><h2>Products</h2><small>Drag to reorder</small></div>{canEdit && <button onClick={addProduct}>＋ Add</button>}</div>
          <div className="merchProductGrid">{merch.products.map(product => {
            const issues = productWarnings(product, commerce)
            return <article key={product.id} className={product.id === selected?.id ? 'merchProductCard active' : 'merchProductCard'} draggable={canEdit} onDragStart={() => setDraggedId(product.id)} onDragOver={event => event.preventDefault()} onDrop={() => { reorderProducts(draggedId, product.id); setDraggedId('') }} onClick={() => { setSelectedId(product.id); setTab('Basics') }}><div className="merchCardImage">{product.image.url ? <img src={product.image.url} alt={product.image.alt || product.name} /> : <span>No image</span>}</div><div><b>{product.name}</b><span>£{product.priceGBP.toFixed(2)}</span></div><small>{product.status} · {issues.length ? `${issues.length} warning${issues.length === 1 ? '' : 's'}` : 'Ready'}</small></article>
          })}{!merch.products.length && <button className="merchEmptyAdd" onClick={addProduct}>＋ Add your first product</button>}</div>
        </aside>

        <section className="card merchEditor merchEditorV2">
          {selected ? <>
            <div className="panelHead"><div><h2>{selected.name}</h2><small>Preview updates immediately</small></div><div className="merchProductActions">{canEdit && <button onClick={duplicateProduct}>Duplicate</button>}{canEdit && <button className="danger" onClick={deleteProduct}>Delete</button>}</div></div>
            <nav className="merchTabs" aria-label="Product editor sections">{TABS.map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>

            {tab === 'Basics' && <section className="merchEditorSection"><h3>Product Basics</h3><div className="merchFields two"><label>Name<input value={selected.name} disabled={!canEdit} onChange={event => editProduct({ name: event.target.value })} /></label><label>Price (£)<input type="number" min="0" step="0.01" value={selected.priceGBP} disabled={!canEdit} onChange={event => editProduct({ priceGBP: Number(event.target.value) })} /></label><label>Category<select value={selected.category} disabled={!canEdit} onChange={event => editProduct({ category: event.target.value })}><option>Apparel</option><option>Accessories</option><option>Digital</option><option>Other</option></select></label><label>Product type<input value={selected.type} disabled={!canEdit} onChange={event => editProduct({ type: event.target.value })} /></label></div><label>Description<textarea value={selected.description} disabled={!canEdit} onChange={event => editProduct({ description: event.target.value })} /></label><div className="merchChecks"><label><input type="checkbox" checked={selected.featured} disabled={!canEdit} onChange={event => editProduct({ featured: event.target.checked })} /> Featured</label><label><input type="checkbox" checked={selected.limited} disabled={!canEdit} onChange={event => editProduct({ limited: event.target.checked })} /> Limited drop</label><label><input type="checkbox" checked={selected.showInCarousel} disabled={!canEdit} onChange={event => editProduct({ showInCarousel: event.target.checked })} /> Homepage carousel</label></div><button className="merchSaveSection" onClick={() => persist(merch, 'Product basics saved')} disabled={saving}>Save Basics</button></section>}

            {tab === 'Inventory' && <section className="merchEditorSection"><h3>Inventory & Options</h3><div className="merchChecks"><label><input type="checkbox" checked={selected.inventory.trackStock} disabled={!canEdit} onChange={event => editProduct({ inventory: { trackStock: event.target.checked } })} /> Ready stock</label><label><input type="checkbox" checked={selected.fulfilmentOptions.madeToOrder} disabled={!canEdit} onChange={event => editProduct({ fulfilmentOptions: { madeToOrder: event.target.checked } })} /> Made to order</label></div><div className="merchFields two"><label>Ready quantity<input type="number" min="0" value={selected.inventory.quantity} disabled={!canEdit || !selected.inventory.trackStock} onChange={event => editProduct({ inventory: { quantity: Math.max(0, Number(event.target.value)) } })} /></label><label>Low stock warning<input type="number" min="0" value={selected.inventory.lowStockThreshold} disabled={!canEdit || !selected.inventory.trackStock} onChange={event => editProduct({ inventory: { lowStockThreshold: Math.max(0, Number(event.target.value)) } })} /></label><label>Sizes<input value={selected.variants.sizes.join(', ')} disabled={!canEdit} onChange={event => editProduct({ variants: { sizes: listFromText(event.target.value) } })} placeholder="S, M, L, XL" /></label><label>Colours<input value={selected.variants.colours.join(', ')} disabled={!canEdit} onChange={event => editProduct({ variants: { colours: listFromText(event.target.value) } })} placeholder="Black, White, Blue" /></label></div>{selected.fulfilmentOptions.madeToOrder && <label>Production timeframe<textarea value={selected.fulfilmentOptions.leadTimeMessage} disabled={!canEdit} onChange={event => editProduct({ fulfilmentOptions: { leadTimeMessage: event.target.value } })} /></label>}<button className="merchSaveSection" onClick={() => persist(merch, 'Inventory saved')} disabled={saving}>Save Inventory</button></section>}

            {tab === 'Media' && <section className="merchEditorSection"><h3>Product Image</h3><div className={imageDragging ? 'merchDropZone dragging' : 'merchDropZone'} onDragOver={event => { event.preventDefault(); setImageDragging(true) }} onDragLeave={() => setImageDragging(false)} onDrop={event => { event.preventDefault(); setImageDragging(false); uploadImage(event.dataTransfer.files?.[0]) }}>{selected.image.url ? <img src={selected.image.url} alt={selected.image.alt || selected.name} /> : <span>Drag and drop a product image here</span>}<label className="merchUploadButton">Choose Image<input type="file" accept="image/*" disabled={!canEdit || !canManageMedia} onChange={event => uploadImage(event.target.files?.[0])} /></label></div>{canManageMedia && <label>Use media library<select value={selected.image.id || ''} disabled={!canEdit} onChange={event => chooseAsset(event.target.value)}><option value="">Choose from media</option>{imageAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>}<label>Image alt text<input value={selected.image.alt} disabled={!canEdit} onChange={event => editProduct({ image: { alt: event.target.value } })} /></label><button className="merchSaveSection" onClick={() => persist(merch, 'Product media saved')} disabled={saving}>Save Media</button></section>}

            {tab === 'Checkout' && <section className="merchEditorSection"><h3>Availability & Checkout</h3><div className="merchFields two"><label>Availability<select value={selected.availability} disabled={!canEdit} onChange={event => editProduct({ availability: event.target.value, status: availabilityStatus(event.target.value) })}><option value="prelaunch">Coming Soon</option><option value="available">Available</option><option value="sold-out">Sold Out</option><option value="paused">Paused</option></select></label><label>Checkout type<select value={selected.checkout.mode} disabled={!canEdit} onChange={event => editProduct({ checkout: { mode: event.target.value, provider: event.target.value === 'external' ? 'Custom' : '', url: event.target.value === 'managed' ? '' : selected.checkout.url } })}><option value="managed">Managed checkout</option><option value="external">External checkout link</option></select></label></div>{selected.checkout.mode === 'managed' ? <div className="merchProviderSummary"><b>Website payment methods</b><span>{providers.length ? providers.join(' and ') : 'No provider enabled yet'}</span><small>Stripe and PayPal are controlled once in Store Settings.</small></div> : <label>External checkout URL<input type="url" value={selected.checkout.url} disabled={!canEdit} onChange={event => editProduct({ checkout: { url: event.target.value } })} placeholder="https://..." /></label>}<div className="merchChecks"><label><input type="checkbox" checked={selected.checkout.enabled} disabled={!canEdit} onChange={event => editProduct({ checkout: { enabled: event.target.checked } })} /> Checkout enabled</label></div><label>Button label<input value={selected.checkout.label} disabled={!canEdit} onChange={event => editProduct({ checkout: { label: event.target.value } })} /></label><button className="merchSaveSection" onClick={() => persist(merch, 'Checkout saved')} disabled={saving}>Save Checkout</button></section>}

            {tab === 'Advanced' && <section className="merchEditorSection"><h3>Advanced</h3><div className="merchFields two"><label>Order tag<input maxLength="8" value={selected.orderTag} disabled={!canEdit} onChange={event => editProduct({ orderTag: compactTag(event.target.value) })} placeholder={compactTag(selected.type || selected.category || selected.name) || 'ITEM'} /></label><label>Current status<input value={selected.status} disabled /></label></div><label>Shipping note<textarea value={selected.shippingNote} disabled={!canEdit} onChange={event => editProduct({ shippingNote: event.target.value })} /></label><label>Internal notes<textarea value={selected.internalNotes} disabled={!canEdit} onChange={event => editProduct({ internalNotes: event.target.value })} placeholder="Only portal users can see this." /></label><button className="merchSaveSection" onClick={() => persist(merch, 'Advanced settings saved')} disabled={saving}>Save Advanced</button></section>}
          </> : <div className="emptyState">Select or add a product.</div>}
        </section>

        <aside className="card merchPreviewPanel"><div className="panelHead"><div><h2>Customer Preview</h2><small>Updates as you type</small></div></div>{selected ? <article className="merchLiveCard"><div className="merchLiveImage">{selected.image.url ? <img src={selected.image.url} alt={selected.image.alt || selected.name} /> : <span>Image coming soon</span>}</div>{selected.featured && <em>Featured</em>}<h3>{selected.name}</h3><p>{selected.description}</p><strong>£{selected.priceGBP.toFixed(2)}</strong><small>{selected.status}{selected.inventory.trackStock ? ` · ${selected.inventory.quantity} ready` : ''}{selected.fulfilmentOptions.madeToOrder ? ' · Made to order' : ''}</small>{selected.variants.sizes.length > 0 && <div className="merchOptionPreview">{selected.variants.sizes.map(size => <span key={size}>{size}</span>)}</div>}{selected.variants.colours.length > 0 && <div className="merchOptionPreview">{selected.variants.colours.map(colour => <span key={colour}>{colour}</span>)}</div>}<button disabled={!selected.checkout.enabled || selected.availability !== 'available'}>{selected.checkout.label || 'Buy Now'}</button></article> : <p>No product selected.</p>}{selected && <section className={warnings.length ? 'merchWarnings' : 'merchWarnings ready'}><h3>{warnings.length ? 'Before publishing' : 'Ready to publish'}</h3>{warnings.length ? warnings.map(item => <p key={item}>• {item}</p>) : <p>No product warnings.</p>}<small>Warnings never block saving.</small></section>}</aside>
      </section>
    </Layout>
  )
}
