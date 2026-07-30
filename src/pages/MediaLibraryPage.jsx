import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { getAccountFromPath } from '../services/auth.js'
import { api } from '../services/api.js'

const mediaFolders = ['All', 'Website', 'Brand', 'Social', 'Documents']

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function normaliseAsset(asset = {}) {
  return {
    ...asset,
    name: asset.name || asset.originalName || asset.filename || 'Unnamed asset',
    type: asset.type || asset.mimeType || '',
    version: Number(asset.version) || 1,
  }
}

function FilePreview({ asset }) {
  const url = asset.url?.startsWith('http') ? asset.url : `${import.meta.env.VITE_KSJ_ASSET_URL || 'http://localhost:4174'}${asset.url || ''}`

  if (asset.type?.startsWith('image/')) return <img src={url} alt={asset.name} />
  if (asset.type?.startsWith('video/')) return <video src={url} muted controls />
  return <b>{asset.name?.split('.').pop()?.toUpperCase() || 'FILE'}</b>
}

function ownerId(website, account) {
  return website?.owner || account?.id || website?.id || 'unassigned'
}

export function MediaLibraryPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('')
  const website = account?.role === 'owner'
    ? websites.find(site => site.id === selectedWebsiteId) || websites[0] || null
    : assignedWebsite
  const websiteId = website?.id
  const owner = ownerId(website, account)
  const canManageMedia = account?.role === 'owner' || account?.canManageMedia
  const [assets, setAssets] = useState([])
  const [folder, setFolder] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState(canManageMedia ? 'Loading' : 'Media permission required')
  const selected = assets.find(asset => asset.id === selectedId)

  useEffect(() => {
    if (account?.role === 'owner' && !selectedWebsiteId && websites[0]?.id) setSelectedWebsiteId(websites[0].id)
  }, [account?.role, selectedWebsiteId, websites])

  async function loadAssets(message = 'Ready') {
    if (!canManageMedia) {
      setAssets([])
      setSelectedId('')
      setNotice('Media permission required')
      return
    }

    if (!websiteId) {
      setAssets([])
      setSelectedId('')
      setNotice('Waiting for assigned website')
      return
    }

    try {
      const records = (await api.assets(owner, websiteId)).map(normaliseAsset)
      setAssets(records)
      setSelectedId(current => records.some(asset => asset.id === current) ? current : '')
      setNotice(message)
    } catch (error) {
      setAssets([])
      setSelectedId('')
      setNotice(error.message || 'Media API unavailable')
    }
  }

  useEffect(() => {
    loadAssets('Server synced')
  }, [canManageMedia, owner, websiteId])

  async function upload(files) {
    if (!canManageMedia) return setNotice('Media permission required')
    if (!websiteId) return

    const list = Array.from(files || [])
    if (!list.length) return
    const slot = folder === 'All' ? 'website' : folder.toLowerCase()
    setNotice(`Uploading ${list.length} file${list.length === 1 ? '' : 's'}`)

    try {
      for (const file of list) {
        await api.uploadAsset(owner, websiteId, slot, file)
      }
      await loadAssets(`${list.length} file${list.length === 1 ? '' : 's'} uploaded`)
    } catch (error) {
      setNotice(error.message || 'Upload failed')
    }
  }

  async function replace(file) {
    if (!canManageMedia) return setNotice('Media permission required')
    if (!file || !selected || !websiteId) return
    setNotice('Replacing asset')

    try {
      await api.uploadAsset(owner, websiteId, selected.slotId || 'website', file)
      await loadAssets('Replacement uploaded as new version')
    } catch (error) {
      setNotice(error.message || 'Replace failed')
    }
  }

  const visibleAssets = useMemo(
    () =>
      assets.filter(asset => {
        const assetFolder = asset.slotId || 'website'
        const folderMatch = folder === 'All' || assetFolder.toLowerCase() === folder.toLowerCase()
        const searchMatch =
          !search ||
          `${asset.name} ${assetFolder}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())
        return folderMatch && searchMatch
      }),
    [assets, folder, search],
  )

  const storage = assets.reduce((total, asset) => total + (asset.size || 0), 0)

  if (!canManageMedia) {
    return (
      <Layout client={client} title="Media">
        <section className="moduleHero card">
          <div>
            <span>Media Library</span>
            <h2>Media access restricted</h2>
            <p>Your account does not currently have permission to manage media for this website.</p>
          </div>
          <button type="button" disabled aria-live="polite">{notice}</button>
        </section>
      </Layout>
    )
  }

  return (
    <Layout client={client} title="Media">
      <section className="moduleHero card">
        <div>
          <span>Media Library</span>
          <h2>{website?.name || 'Assigned Website'} Assets</h2>
          <p>Upload, organise, replace and track media used across the website.</p>
        </div>
        <button type="button" disabled aria-live="polite">{notice}</button>
      </section>

      {account?.role === 'owner' && websites.length > 1 && <section className="card formSettings">
        <label>Website<select value={websiteId || ''} onChange={event => { setSelectedWebsiteId(event.target.value); setSelectedId(''); setFolder('All'); setSearch('') }}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      </section>}

      <section className="mediaLibraryGrid">
        <aside className="card mediaFolders">
          <div className="panelHead">
            <h2>Folders</h2>
            <button disabled>API</button>
          </div>
          {mediaFolders.map(item => (
            <button
              className={folder === item ? 'active' : ''}
              key={item}
              onClick={() => { setFolder(item); setSelectedId('') }}
            >
              {item} Assets
              <small>
                {item === 'All'
                  ? assets.length
                  : assets.filter(asset => (asset.slotId || '').toLowerCase() === item.toLowerCase()).length}{' '}
                files
              </small>
            </button>
          ))}
          <div className="mediaStorage">
            <b>Storage</b>
            <span>{formatFileSize(storage)}</span>
          </div>
        </aside>
        <section className="card mediaAssetsPanel">
          <div className="mediaToolbar">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search assets or folders"
              aria-label="Search media assets"
            />
            <label>
              Upload
              <input type="file" multiple onChange={event => upload(event.target.files)} disabled={!websiteId} />
            </label>
          </div>
          <div
            className="mediaDrop"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault()
              upload(event.dataTransfer.files)
            }}
          >
            Drop files here or use Upload
          </div>
          <div className="realMediaGrid">
            {visibleAssets.length ? (
              visibleAssets.map(asset => (
                <article
                  className={asset.id === selectedId ? 'active' : ''}
                  key={asset.id}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <div className="mediaPreview">
                    <FilePreview asset={asset} />
                  </div>
                  <b>{asset.name}</b>
                  <small>
                    {asset.slotId || 'Website'} · {formatFileSize(asset.size)} · v{asset.version}
                  </small>
                  <p>{asset.updatedAt || 'No update date'}</p>
                </article>
              ))
            ) : (
              <p className="emptyState">{search || folder !== 'All' ? 'No media matches the current filters.' : 'No media has been uploaded yet.'}</p>
            )}
          </div>
        </section>
        <aside className="card mediaInspector">
          <h2>Asset Details</h2>
          {selected ? (
            <>
              <div className="inspectorPreview">
                <FilePreview asset={selected} />
              </div>
              <label>
                Name
                <input value={selected.name || ''} disabled />
              </label>
              <label>
                Folder
                <input value={selected.slotId || 'website'} disabled />
              </label>
              <div className="usageList">
                <b>Asset URL</b>
                <span>{selected.url}</span>
              </div>
              <div className="assetActions">
                <label>
                  Replace
                  <input type="file" onChange={event => replace(event.target.files?.[0])} />
                </label>
                <button disabled title="Asset deletion is not available for uploaded manifest assets yet">Delete unavailable</button>
              </div>
              <div className="versionList">
                <b>Version</b>
                <span>v{selected.version || 1}</span>
              </div>
            </>
          ) : (
            <p>Select an asset to view details.</p>
          )}
        </aside>
      </section>
    </Layout>
  )
}
