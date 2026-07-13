import cors from 'cors'
import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { createBasketCheckoutRouter } from './basketCheckout.js'
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
app.use('/api/checkout/basket', createBasketCheckoutRouter())
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

async function getSiteContentRecord(websiteId) {
  const stored = await readJson(paths.content(websiteId), null)

  if (!stored) {
    return writeJson(paths.content(websiteId), getStarterSiteContent(websiteId))
  }

  return stored
}

async function ensureStarterData() {
  await Promise.all([getWebsiteRecords(), getClientRecords(), getTicketRecords()])
}

function findSession(req) {
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE]
  return token ? sessions.get(token) : null
}

function sanitiseClient(client) {
  const { password, accessCode, ...safe } = client
  return safe
}

function accountPayload(client) {
  return {
    id: client.id,
    name: client.name,
    role: client.role,
    websiteId: client.websiteId || '',
    websiteIds: client.websiteIds || (client.websiteId ? [client.websiteId] : []),
    canEdit: client.canEdit !== false,
    canManageMedia: client.canManageMedia !== false,
    canRequestUpdates: client.canRequestUpdates !== false,
    canViewSupport: client.canViewSupport !== false,
  }
}

function requireSession(req, res, next) {
  const session = findSession(req)
  if (!session) return res.status(401).json({ error: 'Login required' })
  req.session = session
  next()
}

function requireOwner(req, res) {
  if (req.session?.role !== 'owner') {
    res.status(403).json({ error: 'Owner access required' })
    return false
  }
  return true
}

function requirePermission(req, res, permission, message) {
  if (req.session?.role === 'owner') return true
  if (!req.session?.[permission]) {
    res.status(403).json({ error: message })
    return false
  }
  return true
}

function sessionWebsiteIds(session) {
  if (session?.role === 'owner') return null
  return session?.websiteIds || (session?.websiteId ? [session.websiteId] : [])
}

function requireWebsiteAccess(req, res, websiteId) {
  if (req.session?.role === 'owner') return true
  const allowed = new Set(sessionWebsiteIds(req.session) || [])
  if (!allowed.has(websiteId)) {
    res.status(403).json({ error: 'Website access denied' })
    return false
  }
  return true
}

function filterBySessionWebsites(session, items) {
  if (session?.role === 'owner') return items
  const allowed = new Set(sessionWebsiteIds(session) || [])
  return items.filter(item => allowed.has(item.websiteId || item.id))
}

function updateFormList(forms, formId, updater) {
  return forms.map(form => (form.id === formId ? updater(form) : form))
}

function updateTicketList(tickets, ticketId, updater) {
  return tickets.map(ticket => (ticket.id === ticketId ? updater(ticket) : ticket))
}

await ensureStarterData()

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ksj-digital-api' })
})

app.post('/api/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const clients = await getClientRecords()
  const client = clients.find(item => String(item.email || '').toLowerCase() === email)
  const storedPassword = client?.password || client?.accessCode || ''

  if (!client || !storedPassword || storedPassword !== password) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const token = crypto.randomUUID()
  const account = accountPayload(client)
  sessions.set(token, account)
  res.setHeader('Set-Cookie', sessionCookie(token))
  res.json(account)
})

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE]
  if (token) sessions.delete(token)
  res.setHeader('Set-Cookie', sessionCookie('', { clear: true }))
  res.json({ ok: true })
})

app.get('/api/me', (req, res) => {
  const session = findSession(req)
  if (!session) return res.status(401).json({ error: 'Login required' })
  res.json(session)
})

app.use('/api', requireSession)

app.get('/api/websites', async (req, res) => {
  const websites = await getWebsiteRecords()
  res.json(filterBySessionWebsites(req.session, websites))
})

app.post('/api/websites', async (req, res) => {
  if (!requireOwner(req, res)) return
  const websites = await getWebsiteRecords()
  const website = {
    id: idFrom(req.body?.id || req.body?.name || `website-${Date.now()}`),
    name: req.body?.name || 'New Website',
    domain: req.body?.domain || '',
    owner: req.body?.owner || '',
    status: req.body?.status || 'Draft',
    orderPrefix: req.body?.orderPrefix || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await writeJson(paths.websites(), [...websites, website])
  res.json(website)
})

app.patch('/api/websites/:id', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.id)) return
  const websites = await getWebsiteRecords()
  const updated = websites.map(website =>
    website.id === req.params.id
      ? { ...website, ...req.body, id: website.id, updatedAt: new Date().toISOString() }
      : website,
  )
  await writeJson(paths.websites(), updated)
  res.json(updated.find(website => website.id === req.params.id))
})

app.delete('/api/websites/:id', async (req, res) => {
  if (!requireOwner(req, res)) return
  const websites = await getWebsiteRecords()
  await writeJson(paths.websites(), websites.filter(website => website.id !== req.params.id))
  res.json({ ok: true })
})

app.get('/api/clients', async (req, res) => {
  if (!requireOwner(req, res)) return
  const clients = await getClientRecords()
  res.json(clients.map(sanitiseClient))
})

app.post('/api/clients', async (req, res) => {
  if (!requireOwner(req, res)) return
  const clients = await getClientRecords()
  const client = {
    id: idFrom(req.body?.id || req.body?.name || `client-${Date.now()}`),
    name: req.body?.name || 'New Client',
    email: String(req.body?.email || '').trim().toLowerCase(),
    accessCode: req.body?.accessCode || '',
    role: req.body?.role || 'client',
    websiteId: req.body?.websiteId || '',
    websiteIds: req.body?.websiteIds || (req.body?.websiteId ? [req.body.websiteId] : []),
    canEdit: req.body?.canEdit !== false,
    canManageMedia: req.body?.canManageMedia !== false,
    canRequestUpdates: req.body?.canRequestUpdates !== false,
    canViewSupport: req.body?.canViewSupport !== false,
  }
  await writeJson(paths.clients(), [...clients, client])
  res.json(sanitiseClient(client))
})

app.patch('/api/clients/:id', async (req, res) => {
  if (!requireOwner(req, res)) return
  const clients = await getClientRecords()
  const updated = clients.map(client =>
    client.id === req.params.id
      ? { ...client, ...req.body, id: client.id }
      : client,
  )
  await writeJson(paths.clients(), updated)
  res.json(sanitiseClient(updated.find(client => client.id === req.params.id)))
})

app.delete('/api/clients/:id', async (req, res) => {
  if (!requireOwner(req, res)) return
  const clients = await getClientRecords()
  await writeJson(paths.clients(), clients.filter(client => client.id !== req.params.id))
  res.json({ ok: true })
})

app.get('/api/storage/:ownerId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.ownerId) && req.session.role !== 'owner') return
  const used = await getFolderSize(ASSET_DIR)
  res.json({ used, limit: STORAGE_LIMIT_BYTES })
})

app.get('/api/assets/:ownerId/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  const assets = await readJson(paths.manifest(req.params.ownerId), [])
  res.json(assets.filter(asset => asset.websiteId === req.params.websiteId))
})

app.post('/api/assets/:ownerId/:websiteId/:slotId', upload.single('file'), async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (!requirePermission(req, res, 'canManageMedia', 'Media permission required')) return
  if (!req.file) return res.status(400).json({ error: 'File is required' })

  const used = await getFolderSize(ASSET_DIR)
  if (used + req.file.size > STORAGE_LIMIT_BYTES) {
    return res.status(413).json({ error: 'Storage limit exceeded' })
  }

  await ensureDir(ASSET_DIR)
  const extension = path.extname(req.file.originalname || '') || '.bin'
  const filename = `${safeName(req.params.websiteId)}-${safeName(req.params.slotId)}-${Date.now()}${extension}`
  await fs.writeFile(path.join(ASSET_DIR, filename), req.file.buffer)

  const manifestPath = paths.manifest(req.params.ownerId)
  const assets = await readJson(manifestPath, [])
  const asset = {
    id: crypto.randomUUID(),
    ownerId: req.params.ownerId,
    websiteId: req.params.websiteId,
    slotId: req.params.slotId,
    filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    url: `/assets/${filename}`,
    updatedAt: new Date().toISOString(),
  }
  const next = [asset, ...assets.filter(item => !(item.websiteId === asset.websiteId && item.slotId === asset.slotId))]
  await writeJson(manifestPath, next)
  res.json(asset)
})

app.get('/api/content/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  res.json(await getSiteContentRecord(req.params.websiteId))
})

app.put('/api/content/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return
  const content = { ...req.body, updatedAt: new Date().toISOString() }
  await writeJson(paths.content(req.params.websiteId), content)
  res.json(content)
})

app.get('/api/forms/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  res.json(await getFormRecords(req.params.websiteId))
})

app.put('/api/forms/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return
  const forms = Array.isArray(req.body?.forms) ? req.body.forms : []
  await writeJson(paths.forms(req.params.websiteId), forms)
  res.json(forms)
})

app.post('/api/forms/:websiteId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return
  const forms = await getFormRecords(req.params.websiteId)
  const form = {
    id: idFrom(req.body?.id || req.body?.name || `form-${Date.now()}`),
    name: req.body?.name || 'New Form',
    status: req.body?.status || 'Draft',
    destination: req.body?.destination || '',
    spamProtection: req.body?.spamProtection !== false,
    fields: [],
    submissions: [],
  }
  const next = [...forms, form]
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(form)
})

app.patch('/api/forms/:websiteId/:formId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return
  const forms = await getFormRecords(req.params.websiteId)
  const next = updateFormList(forms, req.params.formId, form => ({ ...form, ...req.body, id: form.id }))
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(next.find(form => form.id === req.params.formId))
})

app.delete('/api/forms/:websiteId/:formId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return
  const forms = await getFormRecords(req.params.websiteId)
  await writeJson(paths.forms(req.params.websiteId), forms.filter(form => form.id !== req.params.formId))
  res.json({ ok: true })
})

app.post('/api/forms/:websiteId/:formId/fields', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return
  const forms = await getFormRecords(req.params.websiteId)
  const field = {
    id: idFrom(req.body?.id || req.body?.label || `field-${Date.now()}`),
    label: req.body?.label || 'New field',
    type: req.body?.type || 'Text',
    required: req.body?.required === true,
    placeholder: req.body?.placeholder || '',
  }
  const next = updateFormList(forms, req.params.formId, form => ({
    ...form,
    fields: [...(form.fields || []), field],
  }))
  await writeJson(paths.forms(req.params.websiteId), next)
  res.json(next.find(form => form.id === req.params.formId))
})

app.patch('/api/forms/:websiteId/:formId/fields/:fieldId', async (req, res) => {
  if (!requireWebsiteAccess(req, res, req.params.websiteId)) return
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return
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
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return

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
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return

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
  if (!requirePermission(req, res, 'canEdit', 'Edit permission required')) return

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
  if (!requirePermission(req, res, 'canViewSupport', 'Support permission required')) return

  const tickets = await getTicketRecords()
  res.json(filterBySessionWebsites(req.session, tickets))
})

app.post('/api/support/tickets', async (req, res) => {
  if (!requirePermission(req, res, 'canViewSupport', 'Support permission required')) return

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
  if (!requirePermission(req, res, 'canViewSupport', 'Support permission required')) return

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
  if (!requirePermission(req, res, 'canRequestUpdates', 'Publish request permission required')) return

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
  if (!request) return res.status(404).json({ error: 'Publish request not found' })

  const updated = requests.map(item =>
    item.id === req.params.id
      ? { ...item, status: 'Approved', reviewedAt: new Date().toISOString() }
      : item,
  )
  await writeJson(paths.requests(), updated)

  const history = await readJson(paths.history(), [])
  await writeJson(paths.history(), [
    {
      id: crypto.randomUUID(),
      websiteId: request.websiteId,
      requestId: request.id,
      action: 'Published',
      createdAt: new Date().toISOString(),
      createdBy: req.session.name,
    },
    ...history,
  ])

  res.json(updated.find(item => item.id === req.params.id))
})

app.get('/api/publish/history', async (req, res) => {
  const history = await readJson(paths.history(), [])
  res.json(filterBySessionWebsites(req.session, history))
})

app.listen(port, () => {
  console.log(`KSJ Digital API running on http://localhost:${port}`)
})
