import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'server-data')
const errors = []
const warnings = []

async function readJson(file, fallback = null) {
  try {
    const source = await fs.readFile(file, 'utf8')
    return JSON.parse(source)
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    errors.push(`${path.relative(root, file)} is not valid JSON: ${error.message}`)
    return fallback
  }
}

function duplicateIds(records, label) {
  if (!Array.isArray(records)) {
    errors.push(`${label} must be stored as an array`)
    return
  }
  const seen = new Set()
  records.forEach((record, index) => {
    const id = String(record?.id || '').trim()
    if (!id) errors.push(`${label}[${index}] has no id`)
    else if (seen.has(id)) errors.push(`${label} contains duplicate id: ${id}`)
    else seen.add(id)
  })
}

async function walkJson(dir) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'backups') await walkJson(full)
    } else if (entry.name.endsWith('.json')) {
      await readJson(full)
    }
  }
}

await walkJson(dataDir)

const websites = await readJson(path.join(dataDir, 'websites.json'), [])
const clients = await readJson(path.join(dataDir, 'clients.json'), [])
duplicateIds(websites, 'websites.json')
duplicateIds(clients, 'clients.json')

const websiteIds = new Set(Array.isArray(websites) ? websites.map(site => String(site?.id || '')).filter(Boolean) : [])
if (Array.isArray(clients)) {
  clients.forEach(client => {
    const assignments = Array.isArray(client?.websiteIds)
      ? client.websiteIds
      : client?.websiteId
        ? [client.websiteId]
        : []
    assignments.forEach(websiteId => {
      if (!websiteIds.has(String(websiteId))) {
        errors.push(`Account ${client?.id || client?.email || 'unknown'} references missing website ${websiteId}`)
      }
    })
    if (client?.role !== 'owner' && !assignments.length) {
      warnings.push(`Account ${client?.id || client?.email || 'unknown'} has no website assignment`)
    }
  })
}

for (const website of Array.isArray(websites) ? websites : []) {
  const id = String(website?.id || '').trim()
  if (!id) continue
  const draft = await readJson(path.join(dataDir, 'content', `${id}.json`), null)
  const published = await readJson(path.join(dataDir, 'published-content', `${id}.json`), null)
  if (draft && !published) warnings.push(`${id} has draft content but no published snapshot`)
}

const storageSource = await fs.readFile(path.join(root, 'server', 'storage.js'), 'utf8')
for (const required of ['BACKUP_DIR', 'backupExistingJson', 'BACKUP_RETENTION_PER_FILE', 'JSON.parse(await fs.readFile(temporaryFile']) {
  if (!storageSource.includes(required)) errors.push(`storage.js is missing required data-protection marker: ${required}`)
}

warnings.forEach(message => console.warn(`Data integrity warning: ${message}`))
if (errors.length) {
  errors.forEach(message => console.error(`Data integrity error: ${message}`))
  process.exit(1)
}

console.log('Data integrity check passed.')
