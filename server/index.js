import cors from 'cors'
import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { ASSET_DIR, STORAGE_LIMIT_BYTES, ensureDir, getFolderSize, paths, readJson, safeName, writeJson } from './storage.js'

const app = express()
const port = Number(process.env.PORT || 4174)
const upload = multer({ storage: multer.memoryStorage() })

app.use(cors())
app.use(express.json({ limit: '25mb' }))
app.use('/assets', express.static(ASSET_DIR))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'KSJ Digital API' })
})

app.get('/api/storage/:ownerId', async (req, res) => {
  const ownerDir = path.join(ASSET_DIR, safeName(req.params.ownerId))
  const used = await getFolderSize(ownerDir)
  res.json({ used, limit: STORAGE_LIMIT_BYTES })
})

app.post('/api/assets/:ownerId/:websiteId/:slotId', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const ownerId = safeName(req.params.ownerId)
  const websiteId = safeName(req.params.websiteId)
  const slotId = safeName(req.params.slotId)
  const ownerDir = path.join(ASSET_DIR, ownerId)
  const used = await getFolderSize(ownerDir)
  if (used + req.file.size > STORAGE_LIMIT_BYTES) return res.status(413).json({ error: '2GB storage limit reached' })
  const assetDir = path.join(ownerDir, websiteId, slotId)
  await ensureDir(assetDir)
  const manifestFile = paths.manifest(ownerId)
  const manifest = await readJson(manifestFile, [])
  const existing = manifest.filter(item => item.websiteId === websiteId && item.slotId === slotId)
  const version = existing.length + 1
  const fileName = `${version}-${Date.now()}-${safeName(req.file.originalname)}`
  const filePath = path.join(assetDir, fileName)
  await import('node:fs/promises').then(fs => fs.writeFile(filePath, req.file.buffer))
  const asset = { id: `${ownerId}:${websiteId}:${slotId}:${version}`, ownerId, websiteId, slotId, name: req.file.originalname, type: req.file.mimetype, size: req.file.size, version, url: `/assets/${ownerId}/${websiteId}/${slotId}/${fileName}`, updatedAt: new Date().toISOString() }
  await writeJson(manifestFile, [asset, ...manifest])
  res.json(asset)
})

app.get('/api/assets/:ownerId/:websiteId', async (req, res) => {
  const manifest = await readJson(paths.manifest(req.params.ownerId), [])
  res.json(manifest.filter(item => item.websiteId === safeName(req.params.websiteId)))
})

app.get('/api/content/:websiteId', async (req, res) => {
  res.json(await readJson(paths.content(req.params.websiteId), { pages: [] }))
})

app.put('/api/content/:websiteId', async (req, res) => {
  const data = await writeJson(paths.content(req.params.websiteId), { ...req.body, updatedAt: new Date().toISOString() })
  res.json(data)
})

app.get('/api/publish/requests', async (_req, res) => {
  res.json(await readJson(paths.requests(), []))
})

app.post('/api/publish/requests', async (req, res) => {
  const requests = await readJson(paths.requests(), [])
  const request = { id: crypto.randomUUID(), status: 'Waiting Review', createdAt: new Date().toISOString(), ...req.body }
  await writeJson(paths.requests(), [request, ...requests])
  res.json(request)
})

app.post('/api/publish/requests/:id/reject', async (req, res) => {
  const requests = await readJson(paths.requests(), [])
  const updated = requests.map(item => item.id === req.params.id ? { ...item, status: 'Rejected', rejectionReason: req.body?.reason || '', reviewedAt: new Date().toISOString() } : item)
  await writeJson(paths.requests(), updated)
  res.json(updated.find(item => item.id === req.params.id))
})

app.post('/api/publish/requests/:id/approve', async (req, res) => {
  const requests = await readJson(paths.requests(), [])
  const request = requests.find(item => item.id === req.params.id)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  const updatedRequest = { ...request, status: 'Approved', approvedAt: new Date().toISOString() }
  await writeJson(paths.requests(), requests.map(item => item.id === req.params.id ? updatedRequest : item))
  const history = await readJson(paths.history(), [])
  const deployment = { id: crypto.randomUUID(), requestId: request.id, websiteId: request.websiteId, status: 'Ready for repository deployment', approvedAt: updatedRequest.approvedAt, repository: request.repository || null }
  await writeJson(paths.history(), [deployment, ...history])
  res.json(deployment)
})

app.get('/api/publish/history', async (_req, res) => {
  res.json(await readJson(paths.history(), []))
})

await ensureDir(ASSET_DIR)
app.listen(port, () => console.log(`KSJ Digital API running on http://localhost:${port}`))
