const CONTENT_KEY = 'ksjDigitalContent'
const REQUEST_KEY = 'ksjDigitalRequests'
const WEBSITE_KEY = 'ksjDigitalWebsites'
const CLIENT_KEY = 'ksjDigitalClients'

export const defaultWebsites = [
  { id: 'twotonetaj', name: 'TwoToneTaj', domain: 'twotonetaj.com', status: 'Live', pageCount: 7, mediaCount: 8, owner: 'Taj', logo: 'TAJ', plan: 'Premium', seo: 94, performance: 98 },
  { id: 'ksjdiamondgaming', name: 'KSJ Diamond Gaming', domain: 'ksjdiamondgaming.com', status: 'Coming Soon', pageCount: 5, mediaCount: 3, owner: 'Morgan', logo: 'KD', plan: 'Launch', seo: 82, performance: 91 },
  { id: 'goliath', name: 'Goliath', domain: 'goliath.gg', status: 'In Development', pageCount: 4, mediaCount: 3, owner: 'Goliath Admin', logo: 'G', plan: 'Build', seo: 77, performance: 88 },
]

export const defaultClients = [
  { id: 'taj', name: 'Taj', websiteId: 'twotonetaj', websiteName: 'TwoToneTaj', status: 'Active', access: 'Website editor' },
  { id: 'morgan', name: 'Morgan', websiteId: 'ksjdiamondgaming', websiteName: 'KSJ Diamond Gaming', status: 'Preparing', access: 'Owner managed' },
  { id: 'goliath-admin', name: 'Goliath Admin', websiteId: 'goliath', websiteName: 'Goliath', status: 'Draft', access: 'Website editor' },
]

export const editableFields = [
  ['Hero Title', 'TwoToneTaj'],
  ['Subtitle', 'Average gamer. Legendary vibes.'],
  ['Intro Text', 'Good laughs, good people and good times.'],
  ['Button Text', 'Join The Squad'],
]

export const ownerStats = [
  ['Websites', '3', 'Managed client websites'],
  ['Clients', '3', 'Active client accounts'],
  ['Updates', '3', 'Waiting for review'],
  ['Support', '2', 'Open tickets'],
]

export const clientStats = [
  ['Website', 'Live', 'Current status'],
  ['Pages', '7', 'Editable pages'],
  ['Media', '8', 'Website assets'],
  ['Updates', 'Protected', 'KSJ approval required'],
]

export const defaultPages = ['Homepage', 'About', 'Community', 'Merch', 'Contact', 'Privacy', 'Terms']
export const defaultMedia = ['hero-banner.png', 'taj-avatar.webp', 'community-card.jpg', 'merch-preview.png', 'logo-transparent.webp', 'stream-overlay.png', 'discord-banner.jpg', 'thumbnail-pack.zip']
export const defaultTickets = [['TwoToneTaj', 'Homepage banner change', 'High'], ['KSJ Diamond Gaming', 'Launch page wording', 'Medium'], ['Goliath', 'Discord widget issue', 'Low']]

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

export function getClientWebsite() {
  return getOwnerWebsites()[0]
}

export function getOwnerWebsites() {
  return read(WEBSITE_KEY, defaultWebsites)
}

export function createWebsite(values) {
  const website = { id: values.name.toLowerCase().replaceAll(' ', '-'), logo: values.name.slice(0, 2).toUpperCase(), pageCount: 1, mediaCount: 0, seo: 0, performance: 0, ...values }
  return write(WEBSITE_KEY, [...getOwnerWebsites(), website])
}

export function getClients() {
  return read(CLIENT_KEY, defaultClients)
}

export function createClient(values) {
  const client = { id: values.name.toLowerCase().replaceAll(' ', '-'), status: 'Draft', access: 'Website editor', ...values }
  return write(CLIENT_KEY, [...getClients(), client])
}

export function getWebsitePages() {
  return defaultPages
}

export function getMediaItems() {
  return defaultMedia
}

export function getTickets() {
  return defaultTickets
}

export function getContent() {
  const defaults = Object.fromEntries(editableFields)
  return read(CONTENT_KEY, defaults)
}

export function saveContent(values) {
  write(CONTENT_KEY, values)
  return { status: 'Saved', updatedAt: new Date().toLocaleString() }
}

export function requestUpdate(values) {
  const request = ['Homepage update', 'TwoToneTaj', 'Waiting Review']
  write(REQUEST_KEY, { request, values, createdAt: new Date().toLocaleString() })
  return request
}

export function getUpdateRequests() {
  const fallback = [['Homepage update', 'TwoToneTaj', 'Waiting Review'], ['About wording', 'TwoToneTaj', 'Draft'], ['Community text', 'TwoToneTaj', 'Approved']]
  const saved = read(REQUEST_KEY, null)
  return saved?.request ? [saved.request, ...fallback.slice(1)] : fallback
}
