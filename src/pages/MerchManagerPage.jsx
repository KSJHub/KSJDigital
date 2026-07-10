import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

const ASSET_BASE = import.meta.env.VITE_KSJ_ASSET_URL || 'http://localhost:4174'
const MANAGED_PROVIDERS = ['stripe', 'paypal']

const starterProducts = [
  ['product_hoodie_001', 'TwoToneTaj Signature Hoodie', 'Apparel', 'Hoodie', 34.99, true],
  ['product_tshirt_001', 'TwoToneTaj Logo T-Shirt', 'Apparel', 'T-Shirt', 19.99, false],
  ['product_cap_001', 'TwoToneTaj Dragon Cap', 'Apparel', 'Cap', 16.99, false],
  ['product_mug_001', 'TwoToneTaj Mug', 'Accessories', 'Mug', 9.99, true],
  ['product_mousemat_001', 'TwoToneTaj Mouse Mat', 'Accessories', 'Mouse Mat', 12.99, false],
  ['product_tote_001', 'TwoToneTaj Tote Bag', 'Accessories', 'Tote Bag', 14.99, false],
  ['product_stickers_001', 'TwoToneTaj Sticker Pack', 'Accessories', 'Sticker Pack', 4.99, false],
  ['product_wallpaper_001', 'TwoToneTaj Wallpaper Pack', 'Digital', 'Digital Download', 4.99, false],
].map(([id, name, category, type, priceGBP, featured], index) => ({
  id,
  name,
  category,
  type,
  description: `${name} from the official TwoToneTaj merch collection.`,
  tags: featured ? ['Featured', 'Coming Soon'] : ['Coming Soon'],
  priceGBP,
  image: { id: `media-${id}`, title: `${name} product image`, url: '', alt: name },
  fallbackImage: category.toLowerCase(),
  status: 'Coming Soon',
  availability: 'prelaunch',
  fulfilment: category === 'Digital' ? 'digital' : 'physical',
  shippingNote:
    category === 'Digital'
      ? 'Digital delivery details are shown by the checkout provider.'
      : 'Shipping cost and delivery estimate are shown by the checkout provider.',
  checkout: { enabled: false, provider: '', url: '', label: 'Buy Now' },
  featured,
  limited: false,
  showInCarousel: index < 5 || id === 'product_stickers_001',
  createdAt: '2026-06-07',
}))

const defaultMerch = {
  title: 'Official TwoToneTaj Merch',
  eyebrow: 'Official TajSquad Gear',
  subtitle:
    'Official creator apparel, accessories and digital drops for the TajSquad. Products open a secure external checkout when available.',
  products: starterProducts,
}

function normaliseMerch(content = {}) {
  return {
    ...defaultMerch,
    ...(content.merch || {}),
    products: content.merch?.products?.length ? content.merch.products : starterProducts,
  }
}

function newProduct() {
  const id = `product-${Date.now()}`
  return {
    id,
    name: 'New Product',
    category: 'Apparel',
    type: 'Product',
    description: 'Add the product description.',
    tags: ['Coming Soon'],
    priceGBP: 0,
    image: { id: `media-${id}`, title: 'Product image', url: '', alt: 'New Product' },
    fallbackImage: 'apparel',
    status: 'Coming Soon',
    availability: 'prelaunch',
    fulfilment: 'physical',
    shippingNote: 'Shipping and delivery details are shown by the checkout provider.',
    checkout: { enabled: false, provider: '', url: '', label: 'Buy Now' },
    featured: false,
    limited: false,
    showInCarousel: false,
    createdAt: new Date().toISOString().slice(0, 10),
  }
}

function ownerId(website, account) {
  return website?.owner || account?.id || website?.id || 'unassigned'
}

function assetUrl(asset) {
  if (!asset?.url) return ''
  return asset.url.startsWith('http') ? asset.url : `${ASSET_BASE}${asset.url}`
}

function isManagedProvider(provider = '') {
  return MANAGED_PROVIDERS.includes(provider.trim().toLowerCase())
}

function productErrors(product) {
  if (!product) return ['No product selected']
  const errors = []
  if (!product.name?.trim()) errors.push('Product name is required')
  if (!product.description?.trim()) errors.push('Description is required')
  if (Number(product.priceGBP) <= 0) errors.push('Price must be greater than £0')
  if (!product.image?.url?.trim()) errors.push('Product image is required')
  if (!product.shippingNote?.trim()) errors.push('Shipping or delivery note is required')
  if (product.checkout?.enabled) {
    if (product.availability !== 'available') errors.push('Checkout requires Available status')
    if (!product.checkout?.provider?.trim()) errors.push('Checkout provider is required')
    if (!isManagedProvider(product.checkout?.provider)) {
      if (!product.checkout?.url?.trim()) errors.push('Checkout URL is required for custom providers')
      if (!/^https:\/\//i.test(product.checkout?.url || '')) errors.push('Checkout URL must use HTTPS')
    }
  }
  return errors
}

export function MerchManagerPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const websiteId = website?.id
  const owner = ownerId(website, account)
  const canEdit = account?.role === 'owner' || account?.canEdit
  const canManageMedia = account?.role === 'owner' || account?.canManageMedia
  const [content, setContent] = useState({ pages: [] })
  const [merch, setMerch] = useState(defaultMerch)
  const [selectedId, setSelectedId] = useState(starterProducts[0].id)
  const [mediaAssets, setMediaAssets] = useState([])
  const [notice, setNotice] = useState('Loading')
  const selected = merch.products.find(product => product.id === selectedId) || merch.products[0]
  const errors = productErrors(selected)
  const managedProvider = isManagedProvider(selected?.checkout?.provider)
  const imageAssets = useMemo(
    () => mediaAssets.filter(asset => asset.type?.startsWith('image/')),
    [mediaAssets],
  )

  async function loadAssets() {
    if (!canManageMedia || !websiteId) return setMediaAssets([])
    try {
      setMediaAssets(await api.assets(owner, websiteId))
    } catch {
      setMediaAssets([])
    }
  }

  useEffect(() => {
    if (!websiteId) return setNotice('Waiting for assigned website')
    let cancelled = false

    api
      .getContent(websiteId)
      .then(data => {
        if (cancelled) return
        const nextMerch = normaliseMerch(data)
        setContent(data)
        setMerch(nextMerch)
        setSelectedId(nextMerch.products[0]?.id || '')
        setNotice(canEdit ? 'Ready' : 'Preview only')
      })
      .catch(error => !cancelled && setNotice(error.message || 'Merch unavailable'))

    loadAssets()
    return () => {
      cancelled = true
    }
  }, [canEdit, canManageMedia, owner, websiteId])

  async function save(nextMerch, message = 'Merch saved') {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId) return setNotice('No website assigned')
    const nextContent = { ...content, merch: nextMerch }
    setMerch(nextMerch)
    setContent(nextContent)
    setNotice('Saving')
    try {
      const saved = await api.saveContent(websiteId, nextContent)
      setContent(saved)
      setMerch(normaliseMerch(saved))
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
    if (changes.checkout?.enabled) {
      const candidate = {
        ...selected,
        ...changes,
        checkout: { ...selected.checkout, ...changes.checkout },
      }
      const blocking = productErrors(candidate)
      if (blocking.length) {
        setNotice(`Checkout blocked: ${blocking[0]}`)
        return
      }
    }

    const products = merch.products.map(product =>
      product.id === selected.id
        ? {
            ...product,
            ...changes,
            image: changes.image ? { ...product.image, ...changes.image } : product.image,
            checkout: changes.checkout ? { ...product.checkout, ...changes.checkout } : product.checkout,
          }
        : product,
    )
    save({ ...merch, products }, 'Product saved')
  }

  function updateProvider(provider) {
    updateProduct({
      checkout: {
        provider,
        url: isManagedProvider(provider) ? '' : selected.checkout?.url || '',
      },
    })
  }

  function selectAsset(assetId) {
    const asset = imageAssets.find(item => item.id === assetId)
    if (!asset) return
    updateProduct({
      image: {
        id: asset.id,
        title: asset.name,
        url: assetUrl(asset),
        alt: selected?.name || asset.name,
      },
    })
  }

  async function uploadProductImage(file) {
    if (!file || !selected || !canManageMedia || !canEdit || !websiteId) return
    setNotice('Uploading product image')
    try {
      const asset = await api.uploadAsset(owner, websiteId, `merch-${selected.id}`, file)
      await loadAssets()
      const nextImage = { id: asset.id, title: asset.name, url: assetUrl(asset), alt: selected.name }
      const products = merch.products.map(product =>
        product.id === selected.id ? { ...product, image: nextImage } : product,
      )
      await save({ ...merch, products }, 'Product image uploaded')
    } catch (error) {
      setNotice(error.message || 'Image upload failed')
    }
  }

  function addProduct() {
    const product = newProduct()
    setSelectedId(product.id)
    save({ ...merch, products: [...merch.products, product] }, 'Product created')
  }

  function deleteProduct() {
    if (!selected) return
    const products = merch.products.filter(product => product.id !== selected.id)
    setSelectedId(products[0]?.id || '')
    save({ ...merch, products }, 'Product deleted')
  }

  return (
    <Layout client={client} title="Merch">
      <section className="moduleHero card">
        <div>
          <span>Merch Manager</span>
          <h2>{website?.name || 'Assigned Website'} Store</h2>
          <p>Manage the storefront catalogue, product images, availability and secure checkout providers.</p>
        </div>
        <button>{notice}</button>
      </section>

      <section className="formsGrid">
        <aside className="card formList">
          <div className="panelHead">
            <h2>Products</h2>
            {canEdit && <button onClick={addProduct}>Add</button>}
          </div>
          {merch.products.map(product => {
            const ready = productErrors(product).length === 0
            return (
              <button
                className={product.id === selectedId ? 'active' : ''}
                key={product.id}
                onClick={() => setSelectedId(product.id)}
              >
                <b>{product.name}</b>
                <small>
                  {product.category} · £{Number(product.priceGBP || 0).toFixed(2)} · {ready ? 'Ready' : 'Needs work'}
                </small>
              </button>
            )
          })}
        </aside>

        <section className="card formEditor">
          <div className="panelHead">
            <h2>Store Details</h2>
            <span>{merch.products.length} products</span>
          </div>
          <div className="formSettings">
            <label>Store Title<input value={merch.title} disabled={!canEdit} onChange={event => updateStore({ title: event.target.value })} /></label>
            <label>Eyebrow<input value={merch.eyebrow} disabled={!canEdit} onChange={event => updateStore({ eyebrow: event.target.value })} /></label>
            <label>Subtitle<textarea value={merch.subtitle} disabled={!canEdit} onChange={event => updateStore({ subtitle: event.target.value })} /></label>
          </div>

          {selected && (
            <>
              <div className="panelHead">
                <h2>Product Details</h2>
                {canEdit && <button onClick={deleteProduct}>Delete</button>}
              </div>

              <section className="card publishBox">
                <h3>{errors.length ? 'Product needs attention' : 'Product ready'}</h3>
                {errors.length ? errors.map(error => <p key={error}>• {error}</p>) : <p>All required product and checkout fields are valid.</p>}
              </section>

              <div className="formSettings">
                <label>Name<input value={selected.name} disabled={!canEdit} onChange={event => updateProduct({ name: event.target.value })} /></label>
                <label>Type<input value={selected.type} disabled={!canEdit} onChange={event => updateProduct({ type: event.target.value })} /></label>
                <label>Category<select value={selected.category} disabled={!canEdit} onChange={event => updateProduct({ category: event.target.value })}><option>Apparel</option><option>Accessories</option><option>Digital</option></select></label>
                <label>Price GBP<input type="number" min="0" step="0.01" value={selected.priceGBP} disabled={!canEdit} onChange={event => updateProduct({ priceGBP: Number(event.target.value) })} /></label>
                <label>Description<textarea value={selected.description} disabled={!canEdit} onChange={event => updateProduct({ description: event.target.value })} /></label>
                {canManageMedia && (
                  <>
                    <label>Upload Product Image<input type="file" accept="image/*" disabled={!canEdit} onChange={event => uploadProductImage(event.target.files?.[0])} /></label>
                    <label>Media Library Image<select value={selected.image?.id || ''} disabled={!canEdit} onChange={event => selectAsset(event.target.value)}><option value="">Choose uploaded image</option>{imageAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name} · {asset.slotId}</option>)}</select></label>
                  </>
                )}
                <label>Image URL<input value={selected.image?.url || ''} disabled={!canEdit} onChange={event => updateProduct({ image: { url: event.target.value, alt: selected.name } })} /></label>
                <label>Availability<select value={selected.availability} disabled={!canEdit} onChange={event => updateProduct({ availability: event.target.value, status: event.target.value === 'available' ? 'Available' : event.target.value === 'sold-out' ? 'Sold Out' : 'Coming Soon' })}><option value="prelaunch">Coming Soon</option><option value="available">Available</option><option value="sold-out">Sold Out</option><option value="paused">Paused</option></select></label>
                <label>Shipping / Delivery Note<textarea value={selected.shippingNote} disabled={!canEdit} onChange={event => updateProduct({ shippingNote: event.target.value })} /></label>
                <label>Checkout Provider<select value={selected.checkout?.provider || ''} disabled={!canEdit} onChange={event => updateProvider(event.target.value)}><option value="">Choose provider</option><option value="Stripe">Stripe</option><option value="PayPal">PayPal</option><option value="Custom">Custom checkout link</option></select></label>
                {managedProvider ? (
                  <section className="card publishBox">
                    <h3>{selected.checkout.provider} managed checkout</h3>
                    <p>KSJ Digital generates the secure checkout URL automatically. No payment link needs to be pasted here.</p>
                  </section>
                ) : (
                  <label>Custom Checkout URL<input type="url" value={selected.checkout?.url || ''} disabled={!canEdit} onChange={event => updateProduct({ checkout: { url: event.target.value } })} /></label>
                )}
                <label className="formCheck"><input type="checkbox" checked={selected.checkout?.enabled || false} disabled={!canEdit} onChange={event => updateProduct({ checkout: { enabled: event.target.checked } })} /> Checkout enabled</label>
                <label className="formCheck"><input type="checkbox" checked={selected.featured || false} disabled={!canEdit} onChange={event => updateProduct({ featured: event.target.checked })} /> Featured</label>
                <label className="formCheck"><input type="checkbox" checked={selected.limited || false} disabled={!canEdit} onChange={event => updateProduct({ limited: event.target.checked })} /> Limited drop</label>
                <label className="formCheck"><input type="checkbox" checked={selected.showInCarousel || false} disabled={!canEdit} onChange={event => updateProduct({ showInCarousel: event.target.checked })} /> Featured carousel</label>
              </div>
            </>
          )}
        </section>

        <aside className="card formPreview">
          <h2>Store Preview</h2>
          {selected ? (
            <article className="brandSlot">
              <div className="brandPreview">
                {selected.image?.url ? <img src={selected.image.url} alt={selected.image.alt || selected.name} /> : <div className="assetEmpty">Image coming soon</div>}
              </div>
              <h3>{selected.name}</h3>
              <p>{selected.description}</p>
              <strong>£{Number(selected.priceGBP || 0).toFixed(2)}</strong>
              <small>{selected.status}</small>
              <button disabled={!selected.checkout?.enabled || selected.availability !== 'available'}>{selected.checkout?.label || 'Buy Now'}</button>
            </article>
          ) : (
            <p>No product selected.</p>
          )}
        </aside>
      </section>
    </Layout>
  )
}
