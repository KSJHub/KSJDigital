import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

const ASSET_BASE = import.meta.env.VITE_KSJ_ASSET_URL || 'http://localhost:4174'

function ownerId(website, account) {
  return website?.owner || account?.id || website?.id || 'unassigned'
}

function assetUrl(asset) {
  if (!asset?.url) return ''
  return asset.url.startsWith('http') ? asset.url : `${ASSET_BASE}${asset.url}`
}

function listFromText(value = '') {
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))]
}

function compactOrderTag(value = '') {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

function automaticOrderTag(product = {}) {
  if (product.orderTag?.trim()) return compactOrderTag(product.orderTag)
  if (product.sku?.trim()) return compactOrderTag(product.sku)
  if (product.type?.trim()) return compactOrderTag(product.type)
  return compactOrderTag(product.category || product.name || 'ITEM') || 'ITEM'
}

function productDefaults(product = {}) {
  const checkoutMode = product.checkout?.mode || (product.checkout?.provider && !['stripe', 'paypal'].includes(String(product.checkout.provider).toLowerCase()) ? 'external' : 'managed')
  return {
    id: product.id || `product-${Date.now()}`,
    name: product.name || 'New Product',
    category: product.category || 'Apparel',
    type: product.type || 'Product',
    description: product.description || 'Add a product description.',
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
    shippingNote: product.shippingNote || 'Shipping and delivery details are shown during checkout.',
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
      mode: checkoutMode,
      provider: checkoutMode === 'external' ? 'Custom' : '',
      url: product.checkout?.url || '',
      label: product.checkout?.label || 'Buy Now',
    },
    createdAt: product.createdAt || new Date().toISOString().slice(0, 10),
  }
}

function defaultMerch(websiteName = 'Your Store') {
  return {
    title: `${websiteName} Merch`,
    eyebrow: 'Official Store',
    subtitle: `Official products from ${websiteName}.`,
    products: [],
  }
}

function normaliseMerch(content = {}, websiteName = 'Your Store') {
  const fallback = defaultMerch(websiteName)
  return {
    ...fallback,
    ...(content.merch || {}),
    products: (content.merch?.products || []).map(productDefaults),
  }
}

function productWarnings(product, commerce = {}) {
  if (!product) return []
  const warnings = []
  if (!product.name?.trim()) warnings.push('Add a product name')
  if (!product.description?.trim()) warnings.push('Add a description')
  if (Number(product.priceGBP) <= 0) warnings.push('Add a price')
  if (!product.image?.url?.trim()) warnings.push('Add a product image')
  if (product.fulfilmentOptions?.madeToOrder && !product.fulfilmentOptions?.leadTimeMessage?.trim()) warnings.push('Add a production timeframe')
  if (product.checkout?.mode === 'external' && product.checkout?.enabled && !/^https:\/\//i.test(product.checkout?.url || '')) warnings.push('Add a secure external checkout URL')
  if (product.checkout?.mode === 'managed' && product.checkout?.enabled && !commerce.stripeEnabled && !commerce.paypalEnabled) warnings.push('Enable Stripe or PayPal in store settings')
  if (product.inventory?.trackStock && !product.fulfilmentOptions?.madeToOrder && product.inventory.quantity <= 0) warnings.push('Product has no ready stock')
  return warnings
}

function availabilityStatus(value) {
  if (value === 'available') return 'Available'
  if (value === 'sold-out') return 'Sold Out'
  if (value === 'paused') return 'Paused'
  return 'Coming Soon'
}

export function MerchManagerPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const websiteId = website?.id
  const owner = ownerId(website, account)
  const canEdit = account?.role === 'owner' || account?.canEdit
  const canManageMedia = account?.role === 'owner' || account?.canManageMedia
  const canRequestUpdates = account?.role === 'owner' || account?.canRequestUpdates
  const [content, setContent] = useState({ pages: [] })
  const [merch, setMerch] = useState(defaultMerch())
  const [commerce, setCommerce] = useState({ stripeEnabled: false, paypalEnabled: false })
  const [selectedId, setSelectedId] = useState('')
  const [mediaAssets, setMediaAssets] = useState([])
  const [notice, setNotice] = useState('Loading')
  const [draggedId, setDraggedId] = useState('')
  const [imageDragging, setImageDragging] = useState(false)

  const selected = merch.products.find(product => product.id === selectedId) || merch.products[0]
  const warnings = productWarnings(selected, commerce)
  const imageAssets = useMemo(() => mediaAssets.filter(asset => asset.type?.startsWith('image/')), [mediaAssets])
  const enabledProviders = [commerce.stripeEnabled && 'Stripe', commerce.paypalEnabled && 'PayPal'].filter(Boolean)

  async function loadAssets() {
    if (!canManageMedia || !websiteId) return setMediaAssets([])
    try {
      setMediaAssets(await api.assets(owner, websiteId))
    } catch {
      setMediaAssets([])
    }
  }

  useEffect(() => {
    if (!websiteId) {
      setNotice('Waiting for assigned website')
      return
    }
    let cancelled = false
    Promise.all([api.getContent(websiteId), api.getCommerceSettings(websiteId).catch(() => ({}))])
      .then(([data, settings]) => {
        if (cancelled) return
        const nextMerch = normaliseMerch(data, website?.name)
        setContent(data)
        setMerch(nextMerch)
        setCommerce(settings || {})
        setSelectedId(nextMerch.products[0]?.id || '')
        setNotice(canEdit ? 'Ready' : 'Preview only')
      })
      .catch(error => !cancelled && setNotice(error.message || 'Merch unavailable'))
    loadAssets()
    return () => { cancelled = true }
  }, [canEdit, canManageMedia, owner, website?.name, websiteId])

  async function save(nextMerch, message = 'Saved') {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId) return setNotice('No website assigned')
    const nextContent = { ...content, merch: nextMerch }
    setMerch(nextMerch)
    setContent(nextContent)
    setNotice('Saving')
    try {
      const saved = await api.saveContent(websiteId, nextContent)
      setContent(saved)
      setMerch(normaliseMerch(saved, website?.name))
      setNotice(message)
    } catch (error) {
      setNotice(error.message || 'Save failed')
    }
  }

  function updateStore(changes) {
    save({ ...merch, ...changes }, 'Store details saved')
  }

  function updateProduct(changes) {
    if (!selected) return
    const products = merch.products.map(product => product.id === selected.id
      ? productDefaults({
          ...product,
          ...changes,
          image: changes.image ? { ...product.image, ...changes.image } : product.image,
          checkout: changes.checkout ? { ...product.checkout, ...changes.checkout } : product.checkout,
          variants: changes.variants ? { ...product.variants, ...changes.variants } : product.variants,
          inventory: changes.inventory ? { ...product.inventory, ...changes.inventory } : product.inventory,
          fulfilmentOptions: changes.fulfilmentOptions ? { ...product.fulfilmentOptions, ...changes.fulfilmentOptions } : product.fulfilmentOptions,
        })
      : product)
    save({ ...merch, products }, 'Product saved')
  }

  function addProduct() {
    const product = productDefaults({ name: 'New Product' })
    setSelectedId(product.id)
    save({ ...merch, products: [...merch.products, product] }, 'Product created')
  }

  function deleteProduct() {
    if (!selected) return
    const products = merch.products.filter(product => product.id !== selected.id)
    setSelectedId(products[0]?.id || '')
    save({ ...merch, products }, 'Product deleted')
  }

  function reorderProducts(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return
    const products = [...merch.products]
    const from = products.findIndex(product => product.id === sourceId)
    const to = products.findIndex(product => product.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = products.splice(from, 1)
    products.splice(to, 0, moved)
    save({ ...merch, products }, 'Product order saved')
  }

  async function uploadProductImage(file) {
    if (!file || !selected || !canManageMedia || !canEdit || !websiteId) return
    setNotice('Uploading image')
    try {
      const asset = await api.uploadAsset(owner, websiteId, `merch-${selected.id}`, file)
      const nextImage = { id: asset.id, title: asset.name, url: assetUrl(asset), alt: selected.name }
      const products = merch.products.map(product => product.id === selected.id ? { ...product, image: nextImage } : product)
      await save({ ...merch, products }, 'Image uploaded')
      await loadAssets()
    } catch (error) {
      setNotice(error.message || 'Image upload failed')
    }
  }

  function selectAsset(assetId) {
    const asset = imageAssets.find(item => item.id === assetId)
    if (!asset) return
    updateProduct({ image: { id: asset.id, title: asset.name, url: assetUrl(asset), alt: selected?.name || asset.name } })
  }

  async function submitForApproval() {
    if (!canRequestUpdates) return setNotice('Approval request permission required')
    if (!website?.id) return setNotice('No website assigned')
    try {
      await api.createPublishRequest({
        websiteId: website.id,
        websiteName: website.name,
        repository: website.repository,
        title: 'Merch store update',
        createdBy: account?.name,
        contentPath: `server-data/content/${website.id}.json`,
      })
      setNotice('Merch changes submitted for approval')
    } catch (error) {
      setNotice(error.message || 'Could not submit changes')
    }
  }

  return (
    <Layout client={client} title="Merch">
      <section className="moduleHero card merchHero">
        <div>
          <span>Visual Store Editor</span>
          <h2>{website?.name || 'Assigned Website'} Merch</h2>
          <p>Add products, upload images, manage stock, configure checkout and preview the store without leaving this page.</p>
        </div>
        <div className="merchHeroActions">
          {client && canRequestUpdates && <button onClick={submitForApproval}>Submit for Approval</button>}
          <button>{notice}</button>
        </div>
      </section>

      <section className="card merchStoreBar">
        <label>Store title<input value={merch.title} disabled={!canEdit} onChange={event => updateStore({ title: event.target.value })} /></label>
        <label>Small heading<input value={merch.eyebrow} disabled={!canEdit} onChange={event => updateStore({ eyebrow: event.target.value })} /></label>
        <label>Store description<input value={merch.subtitle} disabled={!canEdit} onChange={event => updateStore({ subtitle: event.target.value })} /></label>
      </section>

      <section className="merchWorkspace">
        <aside className="card merchCatalogue">
          <div className="panelHead"><div><h2>Products</h2><small>Drag cards to reorder</small></div>{canEdit && <button onClick={addProduct}>Add Product</button>}</div>
          <div className="merchProductGrid">
            {merch.products.map(product => {
              const issues = productWarnings(product, commerce)
              return (
                <article
                  key={product.id}
                  className={product.id === selected?.id ? 'merchProductCard active' : 'merchProductCard'}
                  draggable={canEdit}
                  onDragStart={() => setDraggedId(product.id)}
                  onDragOver={event => event.preventDefault()}
                  onDrop={() => { reorderProducts(draggedId, product.id); setDraggedId('') }}
                  onClick={() => setSelectedId(product.id)}
                >
                  <div className="merchCardImage">{product.image?.url ? <img src={product.image.url} alt={product.image.alt || product.name} /> : <span>Drop image</span>}</div>
                  <div><b>{product.name}</b><span>£{Number(product.priceGBP || 0).toFixed(2)}</span></div>
                  <small>{product.status} · {issues.length ? `${issues.length} warning${issues.length === 1 ? '' : 's'}` : 'Ready'}</small>
                </article>
              )
            })}
            {!merch.products.length && <button className="merchEmptyAdd" onClick={addProduct}>＋ Add your first product</button>}
          </div>
        </aside>

        <section className="card merchEditor">
          {selected ? (
            <>
              <div className="panelHead"><div><h2>Edit Product</h2><small>Changes save automatically</small></div>{canEdit && <button onClick={deleteProduct}>Delete</button>}</div>

              <section className="merchEditorSection">
                <h3>Product Basics</h3>
                <div className="merchFields two">
                  <label>Name<input value={selected.name} disabled={!canEdit} onChange={event => updateProduct({ name: event.target.value })} /></label>
                  <label>Price (£)<input type="number" min="0" step="0.01" value={selected.priceGBP} disabled={!canEdit} onChange={event => updateProduct({ priceGBP: Number(event.target.value) })} /></label>
                  <label>Category<select value={selected.category} disabled={!canEdit} onChange={event => updateProduct({ category: event.target.value })}><option>Apparel</option><option>Accessories</option><option>Digital</option><option>Other</option></select></label>
                  <label>Product type<input value={selected.type} disabled={!canEdit} onChange={event => updateProduct({ type: event.target.value })} /></label>
                </div>
                <label>Description<textarea value={selected.description} disabled={!canEdit} onChange={event => updateProduct({ description: event.target.value })} /></label>
                <div className="merchChecks"><label><input type="checkbox" checked={selected.featured} disabled={!canEdit} onChange={event => updateProduct({ featured: event.target.checked })} /> Featured</label><label><input type="checkbox" checked={selected.limited} disabled={!canEdit} onChange={event => updateProduct({ limited: event.target.checked })} /> Limited drop</label><label><input type="checkbox" checked={selected.showInCarousel} disabled={!canEdit} onChange={event => updateProduct({ showInCarousel: event.target.checked })} /> Homepage carousel</label></div>
              </section>

              <section className="merchEditorSection">
                <h3>Product Image</h3>
                <div
                  className={imageDragging ? 'merchDropZone dragging' : 'merchDropZone'}
                  onDragOver={event => { event.preventDefault(); setImageDragging(true) }}
                  onDragLeave={() => setImageDragging(false)}
                  onDrop={event => { event.preventDefault(); setImageDragging(false); uploadProductImage(event.dataTransfer.files?.[0]) }}
                >
                  {selected.image?.url ? <img src={selected.image.url} alt={selected.image.alt || selected.name} /> : <span>Drag and drop a product image here</span>}
                  <label className="merchUploadButton">Choose Image<input type="file" accept="image/*" disabled={!canEdit || !canManageMedia} onChange={event => uploadProductImage(event.target.files?.[0])} /></label>
                </div>
                {canManageMedia && <label>Use an existing image<select value={selected.image?.id || ''} disabled={!canEdit} onChange={event => selectAsset(event.target.value)}><option value="">Choose from media</option>{imageAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>}
              </section>

              <section className="merchEditorSection">
                <h3>Inventory & Options</h3>
                <div className="merchChecks"><label><input type="checkbox" checked={selected.inventory.trackStock} disabled={!canEdit} onChange={event => updateProduct({ inventory: { trackStock: event.target.checked } })} /> Track ready stock</label><label><input type="checkbox" checked={selected.fulfilmentOptions.madeToOrder} disabled={!canEdit} onChange={event => updateProduct({ fulfilmentOptions: { madeToOrder: event.target.checked } })} /> Made to order</label></div>
                <div className="merchFields two">
                  <label>Ready stock<input type="number" min="0" step="1" value={selected.inventory.quantity} disabled={!canEdit || !selected.inventory.trackStock} onChange={event => updateProduct({ inventory: { quantity: Math.max(0, Number(event.target.value)) } })} /></label>
                  <label>Low stock warning<input type="number" min="0" step="1" value={selected.inventory.lowStockThreshold} disabled={!canEdit || !selected.inventory.trackStock} onChange={event => updateProduct({ inventory: { lowStockThreshold: Math.max(0, Number(event.target.value)) } })} /></label>
                  <label>Sizes<input value={selected.variants.sizes.join(', ')} disabled={!canEdit} onChange={event => updateProduct({ variants: { sizes: listFromText(event.target.value) } })} placeholder="S, M, L, XL" /></label>
                  <label>Colours<input value={selected.variants.colours.join(', ')} disabled={!canEdit} onChange={event => updateProduct({ variants: { colours: listFromText(event.target.value) } })} placeholder="Black, White, Blue" /></label>
                </div>
                {selected.fulfilmentOptions.madeToOrder && <label>Production timeframe<textarea value={selected.fulfilmentOptions.leadTimeMessage} disabled={!canEdit} onChange={event => updateProduct({ fulfilmentOptions: { leadTimeMessage: event.target.value } })} placeholder="Please allow 7–10 working days before dispatch." /></label>}
              </section>

              <section className="merchEditorSection">
                <h3>Availability & Checkout</h3>
                <div className="merchFields two">
                  <label>Availability<select value={selected.availability} disabled={!canEdit} onChange={event => updateProduct({ availability: event.target.value, status: availabilityStatus(event.target.value) })}><option value="prelaunch">Coming Soon</option><option value="available">Available</option><option value="sold-out">Sold Out</option><option value="paused">Paused</option></select></label>
                  <label>Checkout type<select value={selected.checkout.mode} disabled={!canEdit} onChange={event => updateProduct({ checkout: { mode: event.target.value, provider: event.target.value === 'external' ? 'Custom' : '', url: event.target.value === 'managed' ? '' : selected.checkout.url } })}><option value="managed">Managed checkout</option><option value="external">External checkout link</option></select></label>
                </div>
                {selected.checkout.mode === 'managed' ? <div className="merchProviderSummary"><b>Website payment methods</b><span>{enabledProviders.length ? enabledProviders.join(' and ') : 'No provider enabled yet'}</span><small>Stripe and PayPal are controlled once in Store Settings, not on each product.</small></div> : <label>External checkout URL<input type="url" value={selected.checkout.url} disabled={!canEdit} onChange={event => updateProduct({ checkout: { url: event.target.value } })} placeholder="https://..." /></label>}
                <div className="merchChecks"><label><input type="checkbox" checked={selected.checkout.enabled} disabled={!canEdit} onChange={event => updateProduct({ checkout: { enabled: event.target.checked } })} /> Checkout enabled</label></div>
              </section>

              <section className="merchEditorSection">
                <h3>Advanced</h3>
                <div className="merchFields two"><label>Order tag<input maxLength="8" value={selected.orderTag} disabled={!canEdit} onChange={event => updateProduct({ orderTag: compactOrderTag(event.target.value) })} placeholder={automaticOrderTag(selected)} /></label><label>Button label<input value={selected.checkout.label} disabled={!canEdit} onChange={event => updateProduct({ checkout: { label: event.target.value } })} /></label></div>
                <label>Shipping note<textarea value={selected.shippingNote} disabled={!canEdit} onChange={event => updateProduct({ shippingNote: event.target.value })} /></label>
                <label>Internal notes<textarea value={selected.internalNotes} disabled={!canEdit} onChange={event => updateProduct({ internalNotes: event.target.value })} placeholder="Only portal users can see this." /></label>
              </section>
            </>
          ) : <div className="emptyState">Select or add a product.</div>}
        </section>

        <aside className="card merchPreviewPanel">
          <div className="panelHead"><div><h2>Live Preview</h2><small>What customers will see</small></div></div>
          {selected ? <article className="merchLiveCard">
            <div className="merchLiveImage">{selected.image?.url ? <img src={selected.image.url} alt={selected.image.alt || selected.name} /> : <span>Image coming soon</span>}</div>
            {selected.featured && <em>Featured</em>}
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
            <strong>£{Number(selected.priceGBP || 0).toFixed(2)}</strong>
            <small>{selected.status}{selected.inventory.trackStock ? ` · ${selected.inventory.quantity} ready` : ''}{selected.fulfilmentOptions.madeToOrder ? ' · Made to order' : ''}</small>
            {selected.variants.sizes.length > 0 && <div className="merchOptionPreview">{selected.variants.sizes.map(size => <span key={size}>{size}</span>)}</div>}
            {selected.variants.colours.length > 0 && <div className="merchOptionPreview">{selected.variants.colours.map(colour => <span key={colour}>{colour}</span>)}</div>}
            <button disabled={!selected.checkout.enabled || selected.availability !== 'available'}>{selected.checkout.label || 'Buy Now'}</button>
          </article> : <p>No product selected.</p>}
          {selected && <section className={warnings.length ? 'merchWarnings' : 'merchWarnings ready'}><h3>{warnings.length ? 'Before publishing' : 'Ready to publish'}</h3>{warnings.length ? warnings.map(item => <p key={item}>• {item}</p>) : <p>No product warnings.</p>}<small>Warnings do not block you from saving or enabling checkout.</small></section>}
        </aside>
      </section>
    </Layout>
  )
}
