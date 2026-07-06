const CONTENT_KEY = 'ksjDigitalContent'
const REQUEST_KEY = 'ksjDigitalRequests'
const WEBSITE_KEY = 'ksjDigitalWebsites'
const CLIENT_KEY = 'ksjDigitalClients'
const ACCOUNT_LOG_KEY = 'ksjDigitalAccountLog'

export const defaultWebsites = [
  { id: 'twotonetaj', name: 'TwoToneTaj', domain: 'twotonetaj.com', status: 'Live', pageCount: 7, mediaCount: 8, owner: 'Taj', logo: 'TAJ', plan: 'Premium', seo: 94, performance: 98 },
  { id: 'ksjdiamondgaming', name: 'KSJ Diamond Gaming', domain: 'ksjdiamondgaming.com', status: 'Coming Soon', pageCount: 5, mediaCount: 3, owner: 'Morgan', logo: 'KD', plan: 'Launch', seo: 82, performance: 91 },
  { id: 'goliath', name: 'Goliath', domain: 'goliath.gg', status: 'In Development', pageCount: 4, mediaCount: 3, owner: 'Goliath Admin', logo: 'G', plan: 'Build', seo: 77, performance: 88 },
]

export const defaultClients = [
  { id: 'taj', name: 'Taj', email: 'taj@twotonetaj.com', password: 'taj123', role: 'Client', websiteIds: ['twotonetaj'], websiteName: 'TwoToneTaj', status: 'Active', access: 'Website editor', canEdit: true, canRequestUpdates: true, canManageMedia: true, canViewSupport: true },
  { id: 'morgan', name: 'Morgan', email: 'ksj@ksjdigital.co.uk', password: 'ksj123', role: 'Owner', websiteIds: ['twotonetaj', 'ksjdiamondgaming', 'goliath'], websiteName: 'All websites', status: 'Active', access: 'Full owner access', canEdit: true, canRequestUpdates: true, canManageMedia: true, canViewSupport: true },
  { id: 'goliath-admin', name: 'Goliath Admin', email: 'admin@goliath.gg', password: 'goliath123', role: 'Client', websiteIds: ['goliath'], websiteName: 'Goliath', status: 'Draft', access: 'Website editor', canEdit: true, canRequestUpdates: true, canManageMedia: true, canViewSupport: true },
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

function idFrom(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function logAction(message) {
  const log = read(ACCOUNT_LOG_KEY, [])
  write(ACCOUNT_LOG_KEY, [{ message, time: new Date().toLocaleString() }, ...log].slice(0, 12))
}

function websiteNameList(ids = []) {
  const websites = getOwnerWebsites()
  if (ids.includes('all')) return 'All websites'
  return ids.map(id => websites.find(site => site.id === id)?.name).filter(Boolean).join(', ') || 'No website assigned'
}

export function getClientWebsite() {
  return getOwnerWebsites()[0]
}

export function getOwnerWebsites() {
  return read(WEBSITE_KEY, defaultWebsites)
}

export function createWebsite(values) {
  const website = { id: idFrom(values.name), logo: values.name.slice(0, 2).toUpperCase(), pageCount: 1, mediaCount: 0, seo: 0, performance: 0, ...values }
  logAction(`Website created: ${website.name}`)
  return write(WEBSITE_KEY, [...getOwnerWebsites(), website])
}

export function getClients() {
  return read(CLIENT_KEY, defaultClients).map(client => ({ ...client, websiteName: websiteNameList(client.websiteIds || []) }))
}

export function createClient(values) {
  const client = { id: idFrom(values.name || values.email), status: 'Draft', role: 'Client', access: 'Website editor', canEdit: true, canRequestUpdates: true, canManageMedia: true, canViewSupport: true, websiteIds: [], ...values }
  logAction(`Client added: ${client.name}`)
  return write(CLIENT_KEY, [...getClients(), client])
}

export function updateClient(id, changes) {
  const updated = getClients().map(client => client.id === id ? { ...client, ...changes, websiteName: websiteNameList(changes.websiteIds || client.websiteIds || []) } : client)
  logAction(`Client updated: ${changes.name || id}`)
  return write(CLIENT_KEY, updated)
}

export function deleteClient(id) {
  const client = getClients().find(item => item.id === id)
  logAction(`Client deleted: ${client?.name || id}`)
  return write(CLIENT_KEY, getClients().filter(item => item.id !== id))
}

export function assignWebsiteToClient(clientId, websiteId) {
  const client = getClients().find(item => item.id === clientId)
  const ids = new Set(client?.websiteIds || [])
  ids.add(websiteId)
  return updateClient(clientId, { websiteIds: [...ids] })
}

export function removeWebsiteFromClient(clientId, websiteId) {
  const client = getClients().find(item => item.id === clientId)
  return updateClient(clientId, { websiteIds: (client?.websiteIds || []).filter(id => id !== websiteId) })
}

export function resetClientPassword(clientId) {
  const password = `ksj-${Math.random().toString(36).slice(2, 8)}`
  updateClient(clientId, { password })
  logAction(`Password reset prepared for ${clientId}`)
  return password
}

export function prepareClientEmail(client) {
  logAction(`Access email prepared for ${client.name}`)
  return `Hello ${client.name}, your KSJ Digital access has been updated. Email: ${client.email} Password: ${client.password}`
}

export function getAccountLog() {
  return read(ACCOUNT_LOG_KEY, [])
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
