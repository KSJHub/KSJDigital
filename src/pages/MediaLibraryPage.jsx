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
  const website = findClientWebsite(websites, account)
  const websiteId = website?.id
  const owner = ownerId(website, account)
  const [assets, setAssets] = useState([])
  const [folder, setFolder] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('Loading')
  const selected = assets.find(asset => asset.id === selectedId)

  async function loadAssets(message = 'Ready') {
    if (!websiteId) {
      setAssets([])
      setNotice('Waiting for assigned website')
      return
    }

    try {
      const records = await api.assets(owner, websiteId)
      setAssets(records)
      setNotice(message)
    } catch (error) {
      setAssets([])
      setNotice(error.message || 'Media API unavailable')
    }
  }

  useEffect(() => {
    loadAssets('Server synced')
  }, [owner, websiteId])

  async function upload(files) {
    if (!websiteId) return

    const list = Array.from(files || [])
    const slot = folder === 'All' ? 'website' : folder.toLowerCase()
    setNotice('Uploading')

    try {
      for (const file of list) {
        await api.uploadAsset(owner, websiteId, slot, file)
      }
      await loadAssets(`${list.length} file(s) uploaded`)
    } catch (error) {
      setNotice(error.message || 'Upload failed')
    }
  }

  async function replace(file) {
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
            .includes(search.toLowerCase())
        return folderMatch && searchMatch
      }),
    [assets, folder, search],
  )

  const storage = assets.reduce((total, asset) => total + (asset.size || 0), 0)

  return (
    <Layout client={client} title="Media">
      <section className="moduleHero card">
        <div>
          <span>Media Library</span>
          <h2>{website?.name || 'Assigned Website'} Assets</h2>
          <p>Upload, organise, replace and track media used across the website.</p>
        </div>
        <button>{notice}</button>
      </section>
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
              onClick={() => setFolder(item)}
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
              <p>No media found.</p>
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
                <button disabled>Delete pending API</button>
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
