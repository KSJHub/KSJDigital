import { addWebsite, getWebsites, saveWebsite, starterWebsites } from './websites.js'

const CONTENT_KEY = 'ksjDigitalContent'
const REQUEST_KEY = 'ksjDigitalRequests'
const CLIENT_KEY = 'ksjDigitalClients'
const ACCOUNT_LOG_KEY = 'ksjDigitalAccountLog'
const SESSION_KEY = 'ksjDigitalSession'

export const defaultWebsites = starterWebsites

export const defaultClients = [
  {
    id: 'taj',
    name: 'Taj',
    email: 'taj@twotonetaj.com',
    role: 'Client',
    websiteIds: ['twotonetaj'],
    websiteName: 'TwoToneTaj',
    status: 'Active',
    access: 'Website editor',
    canEdit: true,
    canRequestUpdates: true,
    canManageMedia: true,
    canViewSupport: true,
  },
  {
    id: 'morgan',
    name: 'Morgan',
    email: 'ksj@ksjdigital.co.uk',
    role: 'Owner',
    websiteIds: ['twotonetaj', 'ksjdiamondgaming', 'goliath'],
    websiteName: 'All websites',
    status: 'Active',
    access: 'Full owner access',
    canEdit: true,
    canRequestUpdates: true,
    canManageMedia: true,
    canViewSupport: true,
  },
  {
    id: 'goliath-admin',
    name: 'Goliath Admin',
    email: 'admin@goliath.gg',
    role: 'Client',
    websiteIds: ['goliath'],
    websiteName: 'Goliath',
    status: 'Draft',
    access: 'Website editor',
    canEdit: true,
    canRequestUpdates: true,
    canManageMedia: true,
    canViewSupport: true,
  },
]

export const editableFields = [
  ['Hero Title', 'TwoToneTaj'],
  ['Subtitle', 'Average gamer. Legendary vibes.'],
  ['Intro Text', 'Good laughs, good people and good times.'],
  ['Button Text', 'Join The Squad'],
]

export const defaultPages = ['Homepage', 'About', 'Community', 'Merch', 'Contact', 'Privacy', 'Terms']
export const defaultMedia = [
  'hero-banner.png',
  'taj-avatar.webp',
  'community-card.jpg',
  'merch-preview.png',
  'logo-transparent.webp',
  'stream-overlay.png',
  'discord-banner.jpg',
  'thumbnail-pack.zip',
]
export const defaultTickets = [
  ['TwoToneTaj', 'Homepage banner change', 'High'],
  ['KSJ Diamond Gaming', 'Launch page wording', 'Medium'],
  ['Goliath', 'Discord widget issue', 'Low'],
]

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
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function logAction(message) {
  const log = read(ACCOUNT_LOG_KEY, [])
  write(ACCOUNT_LOG_KEY, [{ message, time: new Date().toLocaleString() }, ...log].slice(0, 12))
}

function currentSession() {
  return read(SESSION_KEY, null)
}

function websiteNameList(ids = []) {
  const websites = getOwnerWebsites()

  if (ids.includes('all')) return 'All websites'

  return (
    ids
      .map(id => websites.find(site => site.id === id)?.name)
      .filter(Boolean)
      .join(', ') || 'No website assigned'
  )
}

function normaliseClient(client) {
  const match = defaultClients.find(item => item.id === client.id || item.name === client.name)
  const merged = { ...match, ...client }

  return { ...merged, websiteName: websiteNameList(merged.websiteIds || []) }
}

export function getClientWebsite() {
  const session = currentSession()
  const websites = getOwnerWebsites()
  const siteId = session?.websiteId || session?.websiteIds?.[0] || 'twotonetaj'

  return websites.find(site => site.id === siteId) || websites[0]
}

export function getOwnerWebsites() {
  return getWebsites()
}

export function createWebsite(values) {
  return addWebsite({
    id: idFrom(values.name || 'new-website'),
    logo: values.name?.slice(0, 2).toUpperCase(),
    pageCount: 1,
    mediaCount: 0,
    seo: 0,
    performance: 0,
    ...values,
  })
}

export function updateWebsite(id, values) {
  return saveWebsite(id, values)
}

export function getClients() {
  const stored = read(CLIENT_KEY, defaultClients)
  const merged = [...stored]

  defaultClients.forEach(defaultClient => {
    if (!merged.some(client => client.id === defaultClient.id)) merged.push(defaultClient)
  })

  return merged.map(normaliseClient)
}

export function createClient(values) {
  const client = {
    id: idFrom(values.name || values.email),
    status: 'Draft',
    role: 'Client',
    access: 'Website editor',
    canEdit: true,
    canRequestUpdates: true,
    canManageMedia: true,
    canViewSupport: true,
    websiteIds: [],
    ...values,
  }

  logAction(`Client added: ${client.name}`)
  return write(CLIENT_KEY, [...getClients(), client])
}

export function updateClient(id, changes) {
  const updated = getClients().map(client =>
    client.id === id
      ? { ...client, ...changes, websiteName: websiteNameList(changes.websiteIds || client.websiteIds || []) }
      : client,
  )

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
  const code = `ksj-${Math.random().toString(36).slice(2, 8)}`
  updateClient(clientId, { accessCode: code })
  logAction(`Access reset prepared for ${clientId}`)
  return code
}

export function prepareClientEmail(client) {
  logAction(`Access email prepared for ${client.name}`)
  return `Hello ${client.name}, your KSJ Digital access has been updated. Email: ${client.email}`
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
  const request = ['Homepage update', getClientWebsite().name, 'Waiting Review']
  write(REQUEST_KEY, { request, values, createdAt: new Date().toLocaleString() })
  return request
}

export function getUpdateRequests() {
  const fallback = [
    ['Homepage update', 'TwoToneTaj', 'Waiting Review'],
    ['About wording', 'TwoToneTaj', 'Draft'],
    ['Community text', 'TwoToneTaj', 'Approved'],
  ]
  const saved = read(REQUEST_KEY, null)
  return saved?.request ? [saved.request, ...fallback.slice(1)] : fallback
}
