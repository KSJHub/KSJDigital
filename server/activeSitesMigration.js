import fs from 'node:fs/promises'
import path from 'node:path'

const dataDir = path.resolve(process.cwd(), 'server-data')
const activeWebsiteIds = new Set(['ksjdigital', 'twotonetaj'])

const activeWebsites = [
  {
    id: 'ksjdigital',
    name: 'KSJ Digital',
    domain: 'https://ksjdigital.co.uk/',
    status: 'Live',
    pageCount: 0,
    mediaCount: 0,
    owner: 'Morgan',
    logo: 'KSJ',
    orderPrefix: 'KSJ',
    plan: 'Owner',
    seo: 0,
    performance: 0,
    repository: 'KSJHub/KSJDigital',
    notes: 'KSJ Digital owner website',
  },
  {
    id: 'twotonetaj',
    name: 'TwoToneTaj',
    domain: 'https://twotonetaj.ksjdigital.co.uk/',
    status: 'Live',
    pageCount: 7,
    mediaCount: 8,
    owner: 'Taj',
    logo: 'TAJ',
    orderPrefix: 'TAJ',
    plan: 'Premium',
    seo: 94,
    performance: 98,
    repository: 'KSJHub/TwoToneTaj',
    notes: 'Main live client website',
  },
]

async function readJson(file, fallback) {
  try {
    return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  } catch {
    return fallback
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function migrateActiveSites() {
  const websitesFile = path.join(dataDir, 'websites.json')
  const clientsFile = path.join(dataDir, 'clients.json')
  const storedWebsites = await readJson(websitesFile, [])
  const storedClients = await readJson(clientsFile, [])

  const websiteById = new Map(storedWebsites.map(website => [String(website.id || '').toLowerCase(), website]))
  const websites = activeWebsites.map(defaultWebsite => ({
    ...defaultWebsite,
    ...(websiteById.get(defaultWebsite.id) || {}),
    id: defaultWebsite.id,
    orderPrefix: defaultWebsite.orderPrefix,
  }))

  const clients = storedClients
    .filter(client => ['morgan', 'taj'].includes(String(client.id || '').toLowerCase()))
    .map(client => {
      const id = String(client.id || '').toLowerCase()
      const websiteIds = id === 'morgan' ? ['ksjdigital', 'twotonetaj'] : ['twotonetaj']
      return {
        ...client,
        websiteId: id === 'taj' ? 'twotonetaj' : undefined,
        websiteIds,
      }
    })

  await writeJson(websitesFile, websites)
  await writeJson(clientsFile, clients)

  const recordFiles = [
    'publish-requests.json',
    'publish-history.json',
    'support-tickets.json',
    'orders.json',
    'order-events.json',
    'order-notifications.json',
    'stock-reservations.json',
    'checkout-baskets.json',
  ]

  for (const filename of recordFiles) {
    const file = path.join(dataDir, filename)
    const records = await readJson(file, null)
    if (!Array.isArray(records)) continue
    const filtered = records.filter(record => {
      const websiteId = String(record.websiteId || '').toLowerCase()
      return !websiteId || activeWebsiteIds.has(websiteId)
    })
    if (filtered.length !== records.length) await writeJson(file, filtered)
  }
}
