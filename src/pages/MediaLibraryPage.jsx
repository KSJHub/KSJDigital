import { useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import {
  addFolder,
  addMediaAsset,
  createMediaAsset,
  deleteMediaAsset,
  formatFileSize,
  getMediaLibrary,
  removeFolder,
  replaceMediaAsset,
  updateMediaAsset,
} from '../services/mediaLibrary.js'
import { getClientWebsite } from '../services/platform.js'

function FilePreview({ asset }) {
  if (asset.type?.startsWith('image/')) return <img src={asset.url} alt={asset.name} />
  if (asset.type?.startsWith('video/')) return <video src={asset.url} muted controls />
  return <b>{asset.name.split('.').pop()?.toUpperCase()}</b>
}

export function MediaLibraryPage({ client = false }) {
  const website = getClientWebsite()
  const [library, setLibrary] = useState(getMediaLibrary(website.id))
  const [folder, setFolder] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('Ready')
  const selected = library.assets.find(asset => asset.id === selectedId)

  function refresh(message = 'Saved') {
    setLibrary(getMediaLibrary(website.id))
    setNotice(message)
  }

  async function upload(files) {
    const list = Array.from(files || [])
    for (const file of list) {
      const asset = await createMediaAsset(file, folder === 'All' ? 'Website' : folder)
      addMediaAsset(website.id, asset)
    }
    refresh(`${list.length} file(s) uploaded`)
  }

  async function replace(file) {
    if (!file || !selected) return
    const nextAsset = await createMediaAsset(file, selected.folder)
    replaceMediaAsset(website.id, selected.id, nextAsset)
    refresh('Asset replaced')
  }

  function addTag(value) {
    if (!selected || !value.trim()) return
    const tags = [...new Set([...(selected.tags || []), value.trim()])]
    updateMediaAsset(website.id, selected.id, { tags })
    refresh('Tag added')
  }

  const visibleAssets = useMemo(
    () =>
      library.assets.filter(asset => {
        const folderMatch = folder === 'All' || asset.folder === folder
        const searchMatch =
          !search ||
          `${asset.name} ${asset.folder} ${(asset.tags || []).join(' ')}`
            .toLowerCase()
            .includes(search.toLowerCase())
        return folderMatch && searchMatch
      }),
    [library.assets, folder, search],
  )

  const storage = library.assets.reduce((total, asset) => total + asset.size, 0)

  return (
    <Layout client={client} title="Media">
      <section className="moduleHero card">
        <div>
          <span>Media Library</span>
          <h2>{website.name} Assets</h2>
          <p>Upload, organise, tag, replace and track media used across the website.</p>
        </div>
        <button>{notice}</button>
      </section>
      <section className="mediaLibraryGrid">
        <aside className="card mediaFolders">
          <div className="panelHead">
            <h2>Folders</h2>
            <button
              onClick={() => {
                addFolder(website.id)
                refresh('Folder added')
              }}
            >
              Add
            </button>
          </div>
          <button className={folder === 'All' ? 'active' : ''} onClick={() => setFolder('All')}>
            All Assets<small>{library.assets.length} files</small>
          </button>
          {library.folders.map(item => (
            <button
              className={folder === item ? 'active' : ''}
              key={item}
              onClick={() => setFolder(item)}
            >
              {item}
              <small>{library.assets.filter(asset => asset.folder === item).length} files</small>
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
              placeholder="Search assets, folders or tags"
            />
            <label>
              Upload
              <input type="file" multiple onChange={event => upload(event.target.files)} />
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
                    {asset.folder} · {formatFileSize(asset.size)} · v{asset.version}
                  </small>
                  <p>{(asset.tags || []).join(', ') || 'No tags'}</p>
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
                <input
                  value={selected.name}
                  onChange={event => {
                    updateMediaAsset(website.id, selected.id, { name: event.target.value })
                    refresh('Name updated')
                  }}
                />
              </label>
              <label>
                Folder
                <select
                  value={selected.folder}
                  onChange={event => {
                    updateMediaAsset(website.id, selected.id, { folder: event.target.value })
                    refresh('Folder updated')
                  }}
                >
                  {library.folders.map(item => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Add Tag
                <input
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      addTag(event.currentTarget.value)
                      event.currentTarget.value = ''
                    }
                  }}
                  placeholder="Press Enter"
                />
              </label>
              <div className="usageList">
                <b>Used On</b>
                {selected.usedOn?.length ? (
                  selected.usedOn.map(item => <span key={item}>{item}</span>)
                ) : (
                  <span>Not used yet</span>
                )}
              </div>
              <div className="assetActions">
                <label>
                  Replace
                  <input type="file" onChange={event => replace(event.target.files?.[0])} />
                </label>
                <button
                  onClick={() => {
                    deleteMediaAsset(website.id, selected.id)
                    setSelectedId('')
                    refresh('Asset deleted')
                  }}
                >
                  Delete
                </button>
              </div>
              <div className="versionList">
                <b>Version History</b>
                {selected.history?.length ? (
                  selected.history.map(item => (
                    <span key={`${item.name}-${item.version}`}>
                      v{item.version} · {item.name}
                    </span>
                  ))
                ) : (
                  <span>No previous versions</span>
                )}
              </div>
            </>
          ) : (
            <p>Select an asset to edit details.</p>
          )}
        </aside>
      </section>
    </Layout>
  )
}
