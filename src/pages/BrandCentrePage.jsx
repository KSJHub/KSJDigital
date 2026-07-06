import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { acceptedBrandFormats, brandSlots } from '../services/brandAssets.js'
import { createAssetUrl, formatBytes, getAssetsForWebsite, getStorageUsed, removeAsset, saveAsset, storagePercent, USER_STORAGE_LIMIT } from '../services/assetStorage.js'
import { getAccountFromPath } from '../services/auth.js'
import { getClientWebsite, getOwnerWebsites } from '../services/platform.js'

function Preview({ asset }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!asset) return setUrl('')
    const next = createAssetUrl(asset)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [asset])
  if (!asset) return <div className="assetEmpty">No file</div>
  if (asset.type?.startsWith('image/')) return <img src={url} alt={asset.name} />
  if (asset.type?.startsWith('video/')) return <video src={url} muted controls />
  return <div className="assetFile">{asset.name.split('.').pop()?.toUpperCase()}</div>
}

export function BrandCentrePage({ client = false }) {
  const account = getAccountFromPath()
  const ownerId = account?.id || 'default'
  const websites = getOwnerWebsites()
  const firstId = client ? getClientWebsite().id : 'system'
  const [websiteId, setWebsiteId] = useState(firstId)
  const [assets, setAssets] = useState({})
  const [used, setUsed] = useState(0)
  const [notice, setNotice] = useState('Ready')

  async function reload(id = websiteId) {
    setWebsiteId(id)
    const list = await getAssetsForWebsite(id)
    setAssets(Object.fromEntries(list.map(asset => [asset.slotId, asset])))
    setUsed(await getStorageUsed(ownerId))
  }

  useEffect(() => { reload(firstId) }, [])

  async function upload(slotId, file) {
    if (!file) return
    try {
      const asset = await saveAsset({ ownerId, websiteId, slotId, file })
      await reload()
      setNotice(`${asset.name} saved`)
    } catch (error) {
      setNotice(error.message)
    }
  }

  async function remove(slotId) {
    await removeAsset(ownerId, websiteId, slotId)
    await reload()
    setNotice('Asset removed')
  }

  const selectedName = websiteId === 'system' ? 'KSJ Digital System' : websites.find(site => site.id === websiteId)?.name

  return <Layout client={client} title="Branding"><section className="moduleHero card"><div><span>Brand Centre</span><h2>{selectedName}</h2><p>Manage logos, favicons, banners, icons, videos, PDFs, ZIP files and fonts with a 2GB limit per user.</p></div><button>{notice}</button></section><section className="brandStorage card"><div><b>Storage Used</b><span>{formatBytes(used)} / {formatBytes(USER_STORAGE_LIMIT)}</span></div><div className="storageBar"><i style={{ width: `${storagePercent(used)}%` }} /></div></section><section className="brandManagerGrid"><aside className="card brandPicker"><h2>Brand Kit</h2>{!client && <button className={websiteId === 'system' ? 'active' : ''} onClick={() => reload('system')}>KSJ Digital System<small>Portal branding</small></button>}{websites.map(site => <button className={websiteId === site.id ? 'active' : ''} key={site.id} onClick={() => reload(site.id)}><b>{site.name}</b><small>{site.domain}</small></button>)}</aside><section className="card brandAssets"><div className="panelHead"><h2>Assets</h2><button>{acceptedBrandFormats.length} formats</button></div><div className="brandSlotGrid">{brandSlots.map(slot => <article className="brandSlot" key={slot.id}><div className="brandPreview"><Preview asset={assets[slot.id]} /></div><div><b>{slot.label}</b><small>{slot.formats}</small>{assets[slot.id] && <small>{assets[slot.id].name} · {formatBytes(assets[slot.id].size)} · v{assets[slot.id].version}</small>}</div><label>Upload<input type="file" onChange={event => upload(slot.id, event.target.files?.[0])} /></label>{assets[slot.id] && <button onClick={() => remove(slot.id)}>Remove</button>}</article>)}</div></section><aside className="card brandRules"><h2>Supported Files</h2>{acceptedBrandFormats.map(format => <span key={format}>{format}</span>)}<p>Storage: IndexedDB now, server/R2 storage next.</p></aside></section></Layout>
}
