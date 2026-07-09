import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { acceptedBrandFormats, brandSlots } from '../services/brandAssets.js'
import { formatBytes, storagePercent, USER_STORAGE_LIMIT } from '../services/assetStorage.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { api } from '../services/api.js'

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
  const owner = ownerId(selectedWebsite || clientWebsite, account)
  const assets = useMemo(() => Object.fromEntries(assetList.map(asset => [asset.slotId, asset])), [assetList])

  async function reload(nextWebsiteId = websiteId) {
    if (!nextWebsiteId) {
      setAssetList([])
      setUsed(0)
      setNotice('Waiting for assigned website')
      return
    }

    setWebsiteId(nextWebsiteId)

    try {
      const [list, storage] = await Promise.all([
        api.assets(owner, nextWebsiteId),
        api.storage(owner),
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
  }, [client, clientWebsite?.id, owner])

  async function upload(slotId, file) {
    if (!file || !websiteId) return
    setNotice('Uploading')

    try {
      const asset = await api.uploadAsset(owner, websiteId, slotId, file)
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
        </aside>
      </section>
    </Layout>
  )
}
