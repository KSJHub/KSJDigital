import cors from 'cors'
import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { starterClients, starterWebsites } from './defaults.js'
import { getStarterSiteContent } from './siteContentDefaults.js'
import {
  ASSET_DIR,
  STORAGE_LIMIT_BYTES,
  ensureDir,
  getFolderSize,
  paths,
  readJson,
  safeName,
  writeJson,
} from './storage.js'

const app = express()
const port = Number(process.env.PORT || 4174)
const upload = multer({ storage: multer.memoryStorage() })
const sessions = new Map()
const SESSION_COOKIE = 'ksj_session'

const starterForms = [
  {
    id: 'contact',
    name: 'Contact Form',
    status: 'Active',
    destination: 'support@ksjdigital.co.uk',
    spamProtection: true,
    fields: [
      { id: 'name', label: 'Name', type: 'Text', required: true, placeholder: 'Your name' },
      { id: 'email', label: 'Email', type: 'Email', required: true, placeholder: 'you@example.com' },
      {
        id: 'message',
        label: 'Message',
        type: 'Textarea',
        required: true,
        placeholder: 'How can we help?',
      },
    ],
    submissions: [],
  },
]

const starterTickets = [
  {
    id: 'ticket-welcome',
    websiteId: 'twotonetaj',
    clientName: 'TwoToneTaj',
    subject: 'Welcome to KSJ Digital Support',
    priority: 'Medium',
    status: 'Open',
    message: 'Support requests will appear here once clients start using the portal.',
    replies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '25mb' }))
app.use('/assets', express.static(ASSET_DIR))

function idFrom(value = 'new-record') {
  return safeName(value).replace(/[._]+/g, '-')
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map(cookie => cookie.trim().split('='))
      .filter(parts => parts[0])
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]),
  )
}

function sessionCookie(token, { clear = false } = {}) {
  const maxAge = clear ? 0 : 60 * 60 * 24 * 7
  const value = clear ? '' : encodeURIComponent(token)
  return `${SESSION_COOKIE}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`
}

async function getWebsiteRecords() {
  const stored = await readJson(paths.websites(), null)

  if (!stored) {
    return writeJson(paths.websites(), starterWebsites)
  }

  return stored
}

async function getClientRecords() {
  const stored = await readJson(paths.clients(), null)

  if (!stored) {
    return writeJson(paths.clients(), starterClients)
  }

  return stored
}

async function getFormRecords(websiteId) {
  const stored = await readJson(paths.forms(websiteId), null)

  if (!stored) {
    return writeJson(paths.forms(websiteId), starterForms)
  }

  return stored
}

async function getTicketRecords() {
  const stored = await readJson(paths.tickets(), null)

  if (!stored) {
    return writeJson(paths.tickets(), starterTickets)
  }

  return stored
}

function credentialMatches(account, password = '') {
  const storedCredential = account.password || account.accessCode

  if (!storedCredential) return false
  return storedCredential === password
}

async function buildSession(account) {
  const websites = await getWebsiteRecords()
  const role = account.role?.toLowerCase() === 'owner' ? 'owner' : 'client'
  const websiteIds = role === 'owner' ? websites.map(site => site.id) : account.websiteIds || []
  const websiteAccess =
    role === 'owner'
      ? 'All websites'
      : websiteIds
          .map(id => websites.find(site => site.id === id)?.name)
          .filter(Boolean)
          .join(', ') || 'No website assigned'

  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role,
    label: role === 'owner' ? 'KSJ Digital' : account.websiteName || account.name,
    home: role === 'owner' ? '/owner' : '/client',
    websiteId: websiteIds[0],
    websiteIds,
    websiteAccess,
    canPublish: role === 'owner',
    canManageClients: role === 'owner',
    canEdit: !!account.canEdit,
    canManageMedia: !!account.canManageMedia,
    canRequestUpdates: !!account.canRequestUpdates,
    canViewSupport: !!account.canViewSupport,
  }
}

function getSessionFromRequest(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token) return null
  return sessions.get(token) || null
}

function canAccessWebsite(session, websiteId) {
  if (!session || !websiteId) return false
  if (session.role === 'owner') return true
  return (session.websiteIds || []).map(safeName).includes(safeName(websiteId))
}

function requireOwner(req, res) {
  if (req.session?.role === 'owner') return true
  res.status(403).json({ error: 'Owner access required' })
  return false
}

function requireWebsiteAccess(req, res, websiteId) {
  if (canAccessWebsite(req.session, websiteId)) return true
  res.status(403).json({ error: 'Website access denied' })
  return false
}

function filterBySessionWebsites(session, records = [], key = 'websiteId') {
  if (session?.role === 'owner') return records
  const allowed = new Set((session?.websiteIds || []).map(safeName))
  return records.filter(item => allowed.has(safeName(item[key])))
}

async function getSiteContentRecord(websiteId) {
  const defaultContent = getStarterSiteContent(safeName(websiteId))
  const stored = await readJson(paths.content(websiteId), null)

  return stored ? { ...defaultContent, ...stored } : defaultContent
}

function updateFormList(forms, formId, updater) {
  return forms.map(form => (form.id === formId ? updater(form) : form))
}

function updateTicketList(tickets, ticketId, updater) {
  return tickets.map(ticket => (ticket.id === ticketId ? updater(ticket) : ticket))
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'KSJ Digital API' })
})

app.post('/api/login', async (req, res) => {
  const email = req.body?.email?.trim().toLowerCase()
  const password = req.body?.password || ''
  const clients = await getClientRecords()
  const account = clients.find(
    client =>
      client.email?.toLowerCase() === email &&
      credentialMatches(client, password) &&
      client.status !== 'Suspended',
  )

  if (!account) {
    return res.status(401).json({ error: 'Email or password is incorrect.' })
  }

  const session = await buildSession(account)
  const token = crypto.randomUUID()
  sessions.set(token, session)
  res.setHeader('Set-Cookie', sessionCookie(token))
  res.json({ account: session })
})

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (token) sessions.delete(token)
  res.setHeader('Set-Cookie', sessionCookie('', { clear: true }))
  res.json({ ok: true })
})

app.get('/api/me', (req, res) => {
  const session = getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Not signed in' })
  res.json({ account: session })
})

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/public/')) return next()

  const session = getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Not signed in' })

  req.session = session
  next()
})

app.get('/api/websites', async (req, res) => {
  const websites = await getWebsiteRecords()
  res.json(filterBySessionWebsites(req.session, websites, 'id'))
})

app.post('/api/websites', async (req, res) => {
  if (!requireOwner(req, res)) return

  const websites = await getWebsiteRecords()
  const website = {
    id: idFrom(req.body?.name),
    name: req.body?.name || 'New Website',
    domain: req.body?.domain || 'example.com',
    status: req.body?.status || 'Draft',
    pageCount: Number(req.body?.pageCount || 1),
    mediaCount: Number(req.body?.mediaCount || 0),
    owner: req.body?.owner || 'Unassigned',
    logo: (req.body?.name || 'NW').slice(0, 2).toUpperCase(),
    plan: req.body?.plan || 'Build',
    seo: Number(req.body?.seo || 0),
    performance: Number(req.body?.performance || 0),
    repository: req.body?.repository || '',
    notes: req.body?.notes || '',
  }

  const next = [...websites.filter(site => site.id !== website.id), website]
  await writeJson(paths.websites(), next)
  res.json(website)
})

app.patch('/api/websites/:id', async (req, res) => {
  if (!requireOwner(req, res)) return

  const websites = await getWebsiteRecords()
  const existing = websites.find(site => site.id === req.params.id)

  if (!existing) {
    return res.status(404).json({ error: 'Website not found' })
  }

  const updated = {
    ...existing,
    ...req.body,
    domain: req.body?.domain?.trim() || existing.domain,
    logo: (req.body?.name || existing.name).slice(0, 2).toUpperCase(),
  }

  const next = websites.map(site => (site.id === req.params.id ? updated : site))
  await writeJson(paths.websites(), next)
  res.json(updated)
})

app.delete('/api/websites/:id', async (req, res) => {
  if (!requireOwner(req, res)) return

  const websites = await getWebsiteRecords()
  const next = websites.filter(site => site.id !== req.params.id)
  const clients = await getClientRecords()
  const nextClients = clients.map(client => ({
    ...client,
    websiteIds: (client.websiteIds || []).filter(websiteId => websiteId !== req.params.id),
  }))

  await writeJson(paths.websites(), next)
  await writeJson(paths.clients(), nextClients)
  res.json({ ok: true, websites: next, clients: nextClients })
})

app.get('/api/clients', async (req, res) => {
  if (!requireOwner(req, res)) return
  res.json(await getClientRecords())
})

app.post('/api/clients', async (req, res) => {
  if (!requireOwner(req, res)) return

  const clients = await getClientRecords()
  const client = {
    id: idFrom(req.body?.name || req.body?.email),
    name: req.body?.name || 'New Client',
    email: req.body?.email || 'client@example.com',
    accessCode: req.body?.accessCode || `ksj-${Math.random().toString(36).slice(2, 8)}`,
    role: req.body?.role || 'Client',
    websiteIds: req.body?.websiteIds || [],
    status: req.body?.status || 'Draft',
    access: req.body?.access || 'Website editor',
    canEdit: req.body?.canEdit ?? true,
    canRequestUpdates: req.body?.canRequestUpdates ?? true,
    canManageMedia: req.body?.canManageMedia ?? true,
    canViewSupport: req.body?.canViewSupport ?? true,
  }

  const next = [client, ...clients.filter(item => item.id !== client.id)]
  await writeJson(paths.clients(), next)
  res.json(client)
})

app.patch('/api/clients/:id', async (req, res) => {
  if (!requireOwner(req, res)) return

  const clients = await getClientRecords()
  const existing = clients.find(client => client.id === req.params.id)

  if (!existing) {
    return res.status(404).json({ error: 'Client not found' })
  }

  const updated = {
    ...existing,
    ...req.body,
    email: req.body?.email?.trim() || existing.email,
  }

  const next = clients.map(client => (client.id === req.params.id ? updated : client))
  await writeJson(paths.clients(), next)
  res.json(updated)
})

app.delete('/api/clients/:id', async (req, res) => {
  if (!requireOwner(req, res)) return

  const clients = await getClientRecords()
  const next = clients.filter(client => client.id !== req.params.id)
  await writeJson(paths.clients(), next)
  res.json({ ok: true, clients: next })
})

app.get('/api/storage/:ownerId', async (req, res) => {
  const ownerId = safeName(req.params.ownerId)
  if (req.session.role !== 'owner' && ownerId !== safeName(req.session.id)) {
    return res.status(403).json({ error: 'Storage access denied' })
  }

  const ownerDir = path.join(ASSET_DIR, ownerId)
  const used = await getFolderSize(ownerDir)
  res.json({ used, limit: STORAGE_LIMIT_BYTES })
})

app.post('/api/assets/:ownerId/:websiteId/:slotId', upload.single('file'), async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const ownerId = safeName(req.params.ownerId)
  const websiteId = safeName(req.params.websiteId)
  const slotId = safeName(req.params.slotId)
  const ownerDir = path.join(ASSET_DIR, ownerId)
  const used = await getFolderSize(ownerDir)

  if (used + req.file.size > STORAGE_LIMIT_BYTES) {
    return res.status(413).json({ error: '2GB storage limit reached' })
  }

  const assetDir = path.join(ownerDir, websiteId, slotId)
  await ensureDir(assetDir)

  const manifestFile = paths.manifest(ownerId)
  const manifest = await readJson(manifestFile, [])
  const existing = manifest.filter(item => item.websiteId === websiteId && item.slotId === slotId)
  const version = existing.length + 1
  const fileName = `${version}-${Date.now()}-${safeName(req.file.originalname)}`
  const filePath = path.join(assetDir, fileName)

  await import('node:fs/promises').then(fs => fs.writeFile(filePath, req.file.buffer))

  const asset = {
    id: `${ownerId}:${websiteId}:${slotId}:${version}`,
    ownerId,
    websiteId,
    slotId,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size,
    version,
    url: `/assets/${ownerId}/${websiteId}/${slotId}/${fileName}`,
    updatedAt: new Date().toISOString(),
  }

  await writeJson(manifestFile, [asset, ...manifest])
  res.json(asset)
})

app.get('/api/assets/:ownerId/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return

  const manifest = await readJson(paths.manifest(req.params.ownerId), [])
  res.json(manifest.filter(item => item.websiteId === safeName(req.params.websiteId)))
})

app.get('/api/content/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  res.json(await getSiteContentRecord(req.params.websiteId))
})

app.put('/api/content/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (req.session.role !== 'owner' && !req.session.canEdit) {
    return res.status(403).json({ error: 'Edit permission required' })
  }

  const data = await writeJson(paths.content(req.params.websiteId), {
    ...req.body,
    updatedAt: new Date().toISOString(),
  })
  res.json(data)
})

app.get('/api/forms/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  res.json(await getFormRecords(req.params.websiteId))
})

app.put('/api/forms/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  res.json(await writeJson(paths.forms(req.params.websiteId), req.body?.forms || []))
})

app.post('/api/forms/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return

  const forms = await getFormRecords(req.params.websiteId)
  const form = {
    id: `form-${Date.now()}`,
    name: req.body?.name || 'New Form',
    status: 'Draft',
    destination: req.body?.destination || '',
    spamProtection: req.body?.spamProtection ?? true,
    fields: [],
    submissions: [],
  }
  const next = [form, ...forms]
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json({ form, forms: next })
})

app.patch('/api/forms/:websiteId/:formId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return

  const forms = await getFormRecords(req.params.websiteId)
  const next = updateFormList(forms, req.params.formId, form => ({ ...form, ...req.body }))
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(next)
})

app.delete('/api/forms/:websiteId/:formId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return

  const forms = await getFormRecords(req.params.websiteId)
  const next = forms.filter(form => form.id !== req.params.formId)
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(next)
})

app.post('/api/forms/:websiteId/:formId/fields', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return

  const forms = await getFormRecords(req.params.websiteId)
  const field = {
    id: `field-${Date.now()}`,
    label: `${req.body?.type || 'Text'} Field`,
    type: req.body?.type || 'Text',
    required: false,
    placeholder: '',
  }
  const next = updateFormList(forms, req.params.formId, form => ({
    ...form,
    fields: [...(form.fields || []), field],
  }))
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(next)
})

app.patch('/api/forms/:websiteId/:formId/fields/:fieldId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return

  const forms = await getFormRecords(req.params.websiteId)
  const next = updateFormList(forms, req.params.formId, form => ({
    ...form,
    fields: (form.fields || []).map(field =>
      field.id === req.params.fieldId ? { ...field, ...req.body } : field,
    ),
  }))
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(next)
})

app.delete('/api/forms/:websiteId/:formId/fields/:fieldId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return

  const forms = await getFormRecords(req.params.websiteId)
  const next = updateFormList(forms, req.params.formId, form => ({
    ...form,
    fields: (form.fields || []).filter(field => field.id !== req.params.fieldId),
  }))
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(next)
})

app.post('/api/forms/:websiteId/:formId/fields/:fieldId/move', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return

  const forms = await getFormRecords(req.params.websiteId)
  const next = updateFormList(forms, req.params.formId, form => {
    const fields = [...(form.fields || [])]
    const index = fields.findIndex(field => field.id === req.params.fieldId)
    const nextIndex = req.body?.direction === 'up' ? index - 1 : index + 1

    if (index < 0 || nextIndex < 0 || nextIndex >= fields.length) return form

    const [field] = fields.splice(index, 1)
    fields.splice(nextIndex, 0, field)
    return { ...form, fields }
  })
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(next)
})

app.post('/api/forms/:websiteId/:formId/test-submission', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return

  const forms = await getFormRecords(req.params.websiteId)
  const next = updateFormList(forms, req.params.formId, form => ({
    ...form,
    submissions: [
      {
        id: `sub-${Date.now()}`,
        createdAt: new Date().toLocaleString(),
        status: 'New',
        source: 'Portal preview',
      },
      ...(form.submissions || []),
    ],
  }))
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(next)
})

app.get('/api/support/tickets', async (req, res) => {
  const tickets = await getTicketRecords()
  res.json(filterBySessionWebsites(req.session, tickets))
})

app.post('/api/support/tickets', async (req, res) => {
  const requestedWebsite = safeName(req.body?.websiteId || req.session.websiteId || 'unassigned')
  if (!requireWebsiteAccess(req, res, requestedWebsite)) return

  const tickets = await getTicketRecords()
  const ticket = {
    id: crypto.randomUUID(),
    websiteId: requestedWebsite,
    clientName: req.body?.clientName || req.session.name || 'Client',
    subject: req.body?.subject || 'New support request',
    priority: req.body?.priority || 'Medium',
    status: req.body?.status || 'Open',
    message: req.body?.message || '',
    replies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await writeJson(paths.tickets(), [ticket, ...tickets])
  res.json(ticket)
})

app.patch('/api/support/tickets/:id', async (req, res) => {
  const tickets = await getTicketRecords()
  const existing = tickets.find(ticket => ticket.id === req.params.id)

  if (!existing) return res.status(404).json({ error: 'Ticket not found' })
  if (!requireWebsiteAccess(req, res, existing.websiteId)) return
  if (req.session.role !== 'owner') return res.status(403).json({ error: 'Owner access required' })

  const next = updateTicketList(tickets, req.params.id, ticket => ({
    ...ticket,
    ...req.body,
    websiteId: ticket.websiteId,
    updatedAt: new Date().toISOString(),
  }))

  await writeJson(paths.tickets(), next)
  res.json(filterBySessionWebsites(req.session, next))
})

app.post('/api/support/tickets/:id/replies', async (req, res) => {
  const tickets = await getTicketRecords()
  const existing = tickets.find(ticket => ticket.id === req.params.id)

  if (!existing) return res.status(404).json({ error: 'Ticket not found' })
  if (!requireWebsiteAccess(req, res, existing.websiteId)) return

  const reply = {
    id: crypto.randomUUID(),
    author: req.body?.author || req.session.name || 'KSJ Digital',
    message: req.body?.message || '',
    createdAt: new Date().toISOString(),
  }

  const next = updateTicketList(tickets, req.params.id, ticket => ({
    ...ticket,
    status: req.body?.status || (req.session.role === 'owner' ? 'Waiting Reply' : 'Open'),
    replies: [reply, ...(ticket.replies || [])],
    updatedAt: new Date().toISOString(),
  }))

  await writeJson(paths.tickets(), next)
  res.json(filterBySessionWebsites(req.session, next))
})

app.get('/api/public/sites/:websiteId', async (req, res) => {
  const websiteId = safeName(req.params.websiteId)
  const websites = await getWebsiteRecords()
  const website = websites.find(site => safeName(site.id) === websiteId)

  if (!website) {
    return res.status(404).json({ error: 'Website not found' })
  }

  const content = await getSiteContentRecord(websiteId)
  const assets = await readJson(paths.manifest(website.owner || websiteId), [])

  res.json({
    website,
    content,
    assets: assets.filter(asset => asset.websiteId === websiteId),
    publishedAt: content.updatedAt || null,
  })
})

app.get('/api/publish/requests', async (req, res) => {
  const requests = await readJson(paths.requests(), [])
  res.json(filterBySessionWebsites(req.session, requests))
})

app.post('/api/publish/requests', async (req, res) => {
  const websiteId = safeName(req.body?.websiteId || req.session.websiteId)
  if (!requireWebsiteAccess(req, res, websiteId)) return

  const requests = await readJson(paths.requests(), [])
  const request = {
    id: crypto.randomUUID(),
    status: 'Waiting Review',
    createdAt: new Date().toISOString(),
    ...req.body,
    websiteId,
    createdBy: req.session.name,
  }

  await writeJson(paths.requests(), [request, ...requests])
  res.json(request)
})

app.post('/api/publish/requests/:id/reject', async (req, res) => {
  if (!requireOwner(req, res)) return

  const requests = await readJson(paths.requests(), [])
  const updated = requests.map(item =>
    item.id === req.params.id
      ? {
          ...item,
          status: 'Rejected',
          rejectionReason: req.body?.reason || '',
          reviewedAt: new Date().toISOString(),
        }
      : item,
  )

  await writeJson(paths.requests(), updated)
  res.json(updated.find(item => item.id === req.params.id))
})

app.post('/api/publish/requests/:id/approve', async (req, res) => {
  if (!requireOwner(req, res)) return

  const requests = await readJson(paths.requests(), [])
  const request = requests.find(item => item.id === req.params.id)

  if (!request) return res.status(404).json({ error: 'Request not found' })

  const updatedRequest = {
    ...request,
    status: 'Approved',
    approvedAt: new Date().toISOString(),
  }
  await writeJson(
    paths.requests(),
    requests.map(item => (item.id === req.params.id ? updatedRequest : item)),
  )

  const history = await readJson(paths.history(), [])
  const deployment = {
    id: crypto.randomUUID(),
    requestId: request.id,
    websiteId: request.websiteId,
    status: 'Ready for repository deployment',
    approvedAt: updatedRequest.approvedAt,
    repository: request.repository || null,
  }

  await writeJson(paths.history(), [deployment, ...history])
  res.json(deployment)
})

app.get('/api/publish/history', async (req, res) => {
  const history = await readJson(paths.history(), [])
  res.json(filterBySessionWebsites(req.session, history))
})

await ensureDir(ASSET_DIR)
app.listen(port, () => console.log(`KSJ Digital API running on http://localhost:${port}`))
