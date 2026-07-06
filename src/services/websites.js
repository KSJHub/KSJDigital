const WEBSITE_KEY = 'ksjDigitalWebsites'
const CLIENT_KEY = 'ksjDigitalClients'
const ACCOUNT_LOG_KEY = 'ksjDigitalAccountLog'

export const starterWebsites = [
  { id: 'twotonetaj', name: 'TwoToneTaj', domain: 'twotonetaj.com', status: 'Live', pageCount: 7, mediaCount: 8, owner: 'Taj', logo: 'TAJ', plan: 'Premium', seo: 94, performance: 98, repository: 'KSJHub/TwoToneTaj', notes: 'Main live client website' },
  { id: 'ksjdiamondgaming', name: 'KSJ Diamond Gaming', domain: 'ksjdiamondgaming.com', status: 'Coming Soon', pageCount: 5, mediaCount: 3, owner: 'Morgan', logo: 'KD', plan: 'Launch', seo: 82, performance: 91, repository: 'KSJHub/KSJDiamondGaming', notes: 'Personal gaming identity' },
  { id: 'goliath', name: 'Goliath', domain: 'goliath.gg', status: 'In Development', pageCount: 4, mediaCount: 3, owner: 'Goliath Admin', logo: 'G', plan: 'Build', seo: 77, performance: 88, repository: 'KSJHub/Goliath', notes: 'Dashboard project' },
]

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback } catch { return fallback }
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

export function getWebsites() {
  const stored = read(WEBSITE_KEY, starterWebsites)
  const merged = [...stored]
  starterWebsites.forEach(site => { if (!merged.some(item => item.id === site.id)) merged.push(site) })
  return merged
}

export function addWebsite(values) {
  const website = {
    id: idFrom(values.name || 'new-website'),
    name: values.name || 'New Website',
    domain: values.domain || 'example.com',
    status: values.status || 'Draft',
    pageCount: Number(values.pageCount || 1),
    mediaCount: Number(values.mediaCount || 0),
    owner: values.owner || 'Unassigned',
    logo: (values.name || 'NW').slice(0, 2).toUpperCase(),
    plan: values.plan || 'Build',
    seo: Number(values.seo || 0),
    performance: Number(values.performance || 0),
    repository: values.repository || '',
    notes: values.notes || '',
  }
  logAction(`Website added: ${website.name}`)
  return write(WEBSITE_KEY, [...getWebsites(), website])
}

export function saveWebsite(id, values) {
  const updated = getWebsites().map(site => site.id === id ? { ...site, ...values, logo: (values.name || site.name).slice(0, 2).toUpperCase() } : site)
  logAction(`Website updated: ${values.name || id}`)
  return write(WEBSITE_KEY, updated)
}

export function removeWebsite(id) {
  const site = getWebsites().find(item => item.id === id)
  const websites = write(WEBSITE_KEY, getWebsites().filter(item => item.id !== id))
  const clients = read(CLIENT_KEY, []).map(client => ({ ...client, websiteIds: (client.websiteIds || []).filter(siteId => siteId !== id) }))
  if (clients.length) write(CLIENT_KEY, clients)
  logAction(`Website removed: ${site?.name || id}`)
  return websites
}
