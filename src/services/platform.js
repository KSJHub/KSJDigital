import { clients, mediaItems, pages, tickets, websites } from './mockData.js'

const CONTENT_KEY = 'ksjDigitalContent'
const REQUEST_KEY = 'ksjDigitalRequests'

export const editableFields = [
  ['Hero Title', 'TwoToneTaj'],
  ['Subtitle', 'Average gamer. Legendary vibes.'],
  ['Intro Text', 'Good laughs, good people and good times.'],
  ['Button Text', 'Join The Squad'],
]

export function getClientWebsite() {
  return websites[0]
}

export function getOwnerWebsites() {
  return websites
}

export function getClients() {
  return clients
}

export function getWebsitePages() {
  return pages
}

export function getMediaItems() {
  return mediaItems
}

export function getTickets() {
  return tickets
}

export function getContent() {
  const defaults = Object.fromEntries(editableFields)
  try {
    const saved = JSON.parse(localStorage.getItem(CONTENT_KEY) || 'null')
    return saved || defaults
  } catch {
    return defaults
  }
}

export function saveContent(values) {
  localStorage.setItem(CONTENT_KEY, JSON.stringify(values))
  return { status: 'Saved', updatedAt: new Date().toLocaleString() }
}

export function requestUpdate(values) {
  const request = ['Homepage update', 'TwoToneTaj', 'Waiting Review']
  localStorage.setItem(REQUEST_KEY, JSON.stringify({ request, values, createdAt: new Date().toLocaleString() }))
  return request
}

export function getUpdateRequests() {
  const fallback = [
    ['Homepage update', 'TwoToneTaj', 'Waiting Review'],
    ['About wording', 'TwoToneTaj', 'Draft'],
    ['Community text', 'TwoToneTaj', 'Approved'],
  ]
  try {
    const saved = JSON.parse(localStorage.getItem(REQUEST_KEY) || 'null')
    return saved?.request ? [saved.request, ...fallback.slice(1)] : fallback
  } catch {
    return fallback
  }
}
