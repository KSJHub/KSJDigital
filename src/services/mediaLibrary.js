const MEDIA_KEY = 'ksjDigitalMediaLibrary'

const defaultFolders = ['Website', 'Brand', 'Social', 'Documents']

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  return value
}

function key(websiteId = 'twotonetaj') {
  return `${MEDIA_KEY}:${websiteId}`
}

export function getMediaLibrary(websiteId) {
  return read(key(websiteId), {
    folders: defaultFolders,
    assets: [],
    usage: {},
  })
}

export function saveMediaLibrary(websiteId, data) {
  return write(key(websiteId), data)
}

export function addFolder(websiteId, name = 'New Folder') {
  const library = getMediaLibrary(websiteId)

  if (library.folders.includes(name)) {
    return library
  }

  return saveMediaLibrary(websiteId, {
    ...library,
    folders: [...library.folders, name],
  })
}

export function removeFolder(websiteId, name) {
  const library = getMediaLibrary(websiteId)

  return saveMediaLibrary(websiteId, {
    ...library,
    folders: library.folders.filter(folder => folder !== name),
    assets: library.assets.map(asset =>
      asset.folder === name ? { ...asset, folder: 'Website' } : asset,
    ),
  })
}

export function createMediaAsset(file, folder = 'Website') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      resolve({
        id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        type: file.type || 'Unknown',
        size: file.size,
        folder,
        tags: [],
        version: 1,
        url: reader.result,
        createdAt: new Date().toLocaleString(),
        updatedAt: new Date().toLocaleString(),
        usedOn: [],
        history: [],
      })
    }

    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function addMediaAsset(websiteId, asset) {
  const library = getMediaLibrary(websiteId)

  return saveMediaLibrary(websiteId, {
    ...library,
    assets: [asset, ...library.assets],
  })
}

export function updateMediaAsset(websiteId, assetId, changes) {
  const library = getMediaLibrary(websiteId)

  return saveMediaLibrary(websiteId, {
    ...library,
    assets: library.assets.map(asset =>
      asset.id === assetId
        ? { ...asset, ...changes, updatedAt: new Date().toLocaleString() }
        : asset,
    ),
  })
}

export function replaceMediaAsset(websiteId, assetId, nextAsset) {
  const library = getMediaLibrary(websiteId)

  return saveMediaLibrary(websiteId, {
    ...library,
    assets: library.assets.map(asset =>
      asset.id === assetId
        ? {
            ...asset,
            name: nextAsset.name,
            type: nextAsset.type,
            size: nextAsset.size,
            url: nextAsset.url,
            version: asset.version + 1,
            updatedAt: new Date().toLocaleString(),
            history: [
              {
                name: asset.name,
                size: asset.size,
                type: asset.type,
                version: asset.version,
                updatedAt: asset.updatedAt,
              },
              ...(asset.history || []),
            ],
          }
        : asset,
    ),
  })
}

export function deleteMediaAsset(websiteId, assetId) {
  const library = getMediaLibrary(websiteId)

  return saveMediaLibrary(websiteId, {
    ...library,
    assets: library.assets.filter(asset => asset.id !== assetId),
  })
}

export function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
