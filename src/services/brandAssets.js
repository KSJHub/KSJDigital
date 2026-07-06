const BRAND_KEY = 'ksjDigitalBrandAssets'
const SYSTEM_KEY = 'ksjDigitalSystemBrand'

export const acceptedBrandFormats = ['SVG', 'PNG', 'WEBP', 'JPG', 'JPEG', 'ICO', 'GIF', 'MP4', 'WEBM', 'PDF', 'ZIP', 'WOFF', 'WOFF2', 'TTF', 'OTF']

export const brandSlots = [
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

const defaultSystemBrand = {
  name: 'KSJ Digital',
  primary: '#157bff',
  accent: '#9434e8',
  logo: '/ksj-digital-logo.svg',
}

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback } catch { return fallback }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  return value
}

function keyFor(websiteId) {
  return `${BRAND_KEY}:${websiteId || 'system'}`
}

export function getSystemBrand() {
  return read(SYSTEM_KEY, defaultSystemBrand)
}

export function saveSystemBrand(values) {
  return write(SYSTEM_KEY, { ...getSystemBrand(), ...values })
}

export function getBrandAssets(websiteId = 'system') {
  return read(keyFor(websiteId), {})
}

export function saveBrandAsset(websiteId, slotId, asset) {
  const current = getBrandAssets(websiteId)
  return write(keyFor(websiteId), { ...current, [slotId]: asset })
}

export function removeBrandAsset(websiteId, slotId) {
  const current = getBrandAssets(websiteId)
  delete current[slotId]
  return write(keyFor(websiteId), current)
}

export function fileToAsset(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, type: file.type || 'Unknown', size: file.size, updatedAt: new Date().toLocaleString(), dataUrl: reader.result })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
