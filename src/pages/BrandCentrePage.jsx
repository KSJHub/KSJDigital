import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { api } from '../services/api.js'

const acceptedBrandFormats = [
  'SVG',
  'PNG',
  'WEBP',
  'JPG',
  'JPEG',
  'ICO',
  'GIF',
  'MP4',
  'WEBM',
  'PDF',
  'ZIP',
  'WOFF',
  'WOFF2',
  'TTF',
  'OTF',
]

const brandSlots = [
  { id: 'primaryLogo', label: 'Primary Logo', formats: 'SVG, PNG, WebP, JPG' },
  { id: 'darkLogo', label: 'Dark Logo', formats: 'SVG, PNG, WebP, JPG' },
  { id: 'lightLogo', label: 'Light Logo', formats: 'SVG, PNG, WebP, JPG' },
  { id: 'favicon', label: 'Favicon', formats: 'ICO, PNG, SVG' },
  { id: 'socialIcon', label: 'Social Icon', formats: 'PNG, JPG, WebP' },
  { id: 'discordIcon', label: 'Discord Icon', formats: 'PNG, JPG, WebP, GIF' },
  { id: 'banner', label: 'Website Banner', formats: 'PNG, JPG, WebP, MP4, WebM' },
  { id: 'font', label: 'Brand Font', formats: 'WOFF, WOFF2, TTF, OTF' },
  { id: 'document', label: 'Brand Document', formats: 'PDF, ZIP' },
]

const USER_STORAGE_LIMIT = 2 * 1024 * 1024 * 1024

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function storagePercent(bytes = 0) {
  return Math.min(100, Math.round((bytes / USER_STORAGE_LIMIT) * 100))
}

function assetUrl(asset) {
  if (!asset?.url) return ''
  return asset.url.startsWith('http') ? asset.url : `${import.meta.env.VITE_KSJ_ASSET_URL || 'http://localhost:4174'}${asset.url}`
}

function Preview({ asset }) {
  if (!asset) return <div className="assetEmpty">No file</div>
  const url = assetUrl(asset)
  if (asset.type?.startsWith('image/')) return <img src={url} alt={asset.name} />
  if (asset.type?.startsWith('video/')) return <video src={url} muted controls />
  return <div className="assetFile">{asset.name?.split('.').pop()?.toUpperCase() || 'FILE'}</div>
}

function ownerId(website, account) {
  return website?.owner || account?.id || website?.id || 'default'
}

export function BrandCentrePage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const clientWebsite = findClientWebsite(websites, account)
  const initialWebsiteId = client ? clientWebsite?.id || '' : 'system'
  const [websiteId, setWebsiteId] = useState(initialWebsiteId)
  const [assetList, setAssetList] = useState([])
  const [used, setUsed] = useState(0)
  const [notice, setNotice] = useState('Loading')
  const selectedWebsite = websiteId === 'system' ? null : websites.find(site => site.id === websiteId)
  const selectedOwner = ownerId(selectedWebsite || clientWebsite, account)
  const assets = useMemo(() => Object.fromEntries(assetList.map(asset => [asset.slotId, asset])), [assetList])

  function ownerFor(nextWebsiteId) {
    if (nextWebsiteId === 'system') return account?.id || 'system'
    const target = websites.find(site => site.id === nextWebsiteId) || clientWebsite
    return ownerId(target, account)
  }

  async function reload(nextWebsiteId = websiteId) {
    if (!nextWebsiteId) {
      setAssetList([])
      setUsed(0)
      setNotice('Waiting for assigned website')
      return
    }

    const nextOwner = ownerFor(nextWebsiteId)
    setWebsiteId(nextWebsiteId)

    try {
      const [list, storage] = await Promise.all([
        api.assets(nextOwner, nextWebsiteId),
        api.storage(nextOwner),
      ])
      setAssetList(list)
      setUsed(storage.used || 0)
      setNotice('Server synced')
    } catch (error) {
      setAssetList([])
      setNotice(error.message || 'Brand API unavailable')
    }
  }

  useEffect(() => {
    reload(client ? clientWebsite?.id || '' : 'system')
  }, [client, clientWebsite?.id, websites.length, account?.id])

  async function upload(slotId, file) {
    if (!file || !websiteId) return
    const targetOwner = ownerFor(websiteId)
    setNotice('Uploading')

    try {
      const asset = await api.uploadAsset(targetOwner, websiteId, slotId, file)
      await reload(websiteId)
      setNotice(`${asset.name} saved`)
    } catch (error) {
      setNotice(error.message || 'Upload failed')
    }
  }

  const selectedName =
    websiteId === 'system'
      ? 'KSJ Digital System'
      : websites.find(site => site.id === websiteId)?.name || 'Assigned Website'

  return (
    <Layout client={client} title="Branding">
      <section className="moduleHero card">
        <div>
          <span>Brand Centre</span>
          <h2>{selectedName}</h2>
          <p>
            Manage logos, favicons, banners, icons, videos, PDFs, ZIP files and fonts with a 2GB
            limit per user.
          </p>
        </div>
        <button>{notice}</button>
      </section>
      <section className="brandStorage card">
        <div>
          <b>Storage Used</b>
          <span>
            {formatBytes(used)} / {formatBytes(USER_STORAGE_LIMIT)}
          </span>
        </div>
        <div className="storageBar">
          <i style={{ width: `${storagePercent(used)}%` }} />
        </div>
      </section>
      <section className="brandManagerGrid">
        <aside className="card brandPicker">
          <h2>Brand Kit</h2>
          {!client && (
            <button
              className={websiteId === 'system' ? 'active' : ''}
              onClick={() => reload('system')}
            >
              KSJ Digital System<small>Portal branding</small>
            </button>
          )}
          {(client ? websites.filter(site => account?.websiteIds?.includes(site.id)) : websites).map(site => (
            <button
              className={websiteId === site.id ? 'active' : ''}
              key={site.id}
              onClick={() => reload(site.id)}
            >
              <b>{site.name}</b>
              <small>{site.domain}</small>
            </button>
          ))}
        </aside>
        <section className="card brandAssets">
          <div className="panelHead">
            <h2>Assets</h2>
            <button>{acceptedBrandFormats.length} formats</button>
          </div>
          <div className="brandSlotGrid">
            {brandSlots.map(slot => (
              <article className="brandSlot" key={slot.id}>
                <div className="brandPreview">
                  <Preview asset={assets[slot.id]} />
                </div>
                <div>
                  <b>{slot.label}</b>
                  <small>{slot.formats}</small>
                  {assets[slot.id] && (
                    <small>
                      {assets[slot.id].name} · {formatBytes(assets[slot.id].size)} · v
                      {assets[slot.id].version}
                    </small>
                  )}
                </div>
                <label>
                  Upload
                  <input type="file" onChange={event => upload(slot.id, event.target.files?.[0])} disabled={!websiteId} />
                </label>
                {assets[slot.id] && <button disabled>Remove pending API</button>}
              </article>
            ))}
          </div>
        </section>
        <aside className="card brandRules">
          <h2>Supported Files</h2>
          {acceptedBrandFormats.map(format => (
            <span key={format}>{format}</span>
          ))}
          <p>Storage is managed by the KSJ Digital API.</p>
          <small>Current owner: {selectedOwner}</small>
        </aside>
      </section>
    </Layout>
  )
}
