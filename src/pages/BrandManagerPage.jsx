import { useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { acceptedBrandFormats, brandSlots, fileToAsset, formatSize, getBrandAssets, getSystemBrand, removeBrandAsset, saveBrandAsset, saveSystemBrand } from '../services/brandAssets.js'
import { getClientWebsite, getOwnerWebsites } from '../services/platform.js'

function AssetPreview({ asset }) {
  if (!asset) return <div className="assetEmpty">No file</div>
  if (asset.type?.startsWith('image/')) return <img src={asset.dataUrl} alt={asset.name} />
  return <div className="assetFile">{asset.name.split('.').pop()?.toUpperCase()}</div>
}

export function BrandManagerPage({ client = false }) {
  const websites = getOwnerWebsites()
  const defaultWebsite = client ? getClientWebsite().id : 'system'
  const [websiteId, setWebsiteId] = useState(defaultWebsite)
  const [assets, setAssets] = useState(getBrandAssets(defaultWebsite))
  const [systemBrand, setSystemBrand] = useState(getSystemBrand())
  const [notice, setNotice] = useState('Ready')

  function reload(id = websiteId) {
    setWebsiteId(id)
    setAssets(getBrandAssets(id))
  }

  async function upload(slotId, file) {
    if (!file) return
    const asset = await fileToAsset(file)
    saveBrandAsset(websiteId, slotId, asset)
    if (websiteId === 'system' && slotId === 'primaryLogo' && asset.type.startsWith('image/')) {
      saveSystemBrand({ logo: asset.dataUrl })
      setSystemBrand(getSystemBrand())
    }
    reload()
    setNotice(`${asset.name} saved`)
  }

  function remove(slotId) {
    removeBrandAsset(websiteId, slotId)
    reload()
    setNotice('Asset removed')
  }

  function saveColours() {
    saveSystemBrand(systemBrand)
    setNotice('System brand saved')
  }

  const selectedName = websiteId === 'system' ? 'KSJ Digital System' : websites.find(site => site.id === websiteId)?.name

  return <Layout client={client} title="Branding"><section className="moduleHero card"><div><span>Brand Manager</span><h2>{selectedName}</h2><p>Upload logos, favicons, banners, icons, fonts and documents. These assets will power the portal and assigned website brand kit.</p></div><button>{notice}</button></section><section className="brandManagerGrid"><aside className="card brandPicker"><h2>Brand Kit</h2>{!client && <button className={websiteId === 'system' ? 'active' : ''} onClick={() => reload('system')}>KSJ Digital System<small>Portal logo, colours and icons</small></button>}{websites.map(site => <button className={websiteId === site.id ? 'active' : ''} key={site.id} onClick={() => reload(site.id)}><b>{site.name}</b><small>{site.domain}</small></button>)}</aside><section className="card brandAssets"><div className="panelHead"><h2>Assets</h2><button>{acceptedBrandFormats.length} formats supported</button></div><div className="brandSlotGrid">{brandSlots.map(slot => <article className="brandSlot" key={slot.id}><div className="brandPreview"><AssetPreview asset={assets[slot.id]} /></div><div><b>{slot.label}</b><small>{slot.formats}</small>{assets[slot.id] && <small>{assets[slot.id].name} · {formatSize(assets[slot.id].size)}</small>}</div><label>Upload<input type="file" onChange={event => upload(slot.id, event.target.files?.[0])} /></label>{assets[slot.id] && <button onClick={() => remove(slot.id)}>Remove</button>}</article>)}</div></section><aside className="card brandRules"><h2>Supported Files</h2>{acceptedBrandFormats.map(format => <span key={format}>{format}</span>)}<p>Executable files are not supported for safety.</p>{websiteId === 'system' && <div className="systemBrandEditor"><h2>System Colours</h2><label>Primary<input value={systemBrand.primary} onChange={event => setSystemBrand({ ...systemBrand, primary: event.target.value })} /></label><label>Accent<input value={systemBrand.accent} onChange={event => setSystemBrand({ ...systemBrand, accent: event.target.value })} /></label><button onClick={saveColours}>Save System Brand</button></div>}</aside></section></Layout>
}
