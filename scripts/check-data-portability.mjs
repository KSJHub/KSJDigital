import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-portability-'))
process.chdir(temporary)
try {
  const serviceFile = path.join(root, 'server/services/dataPortabilityService.js')
  const portability = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)
  await fs.mkdir(path.join(temporary, 'server-data', 'content'), { recursive: true })
  await fs.mkdir(path.join(temporary, 'server-data', 'published-content'), { recursive: true })
  await fs.writeFile(path.join(temporary, 'server-data', 'content', 'site-one.json'), JSON.stringify({ title: 'Portable content', blocks: [{ type: 'text' }] }))
  await fs.writeFile(path.join(temporary, 'server-data', 'published-content', 'site-one.json'), JSON.stringify({ title: 'Published' }))

  const jsonJob = await portability.createExportJob({ websiteId: 'site-one', format: 'json', includeAssetFiles: false }, { id: 'check' })
  assert.equal(jsonJob.status, 'completed')
  assert.equal(jsonJob.format, 'json')
  assert(jsonJob.checksum)
  const exported = await portability.readExportPackage(jsonJob.id)
  assert.equal(exported.contentType, 'application/json')
  const portablePackage = JSON.parse(exported.bytes.toString('utf8'))
  assert.equal(portablePackage.websiteId, 'site-one')
  assert.equal(portablePackage.collections.content.title, 'Portable content')
  assert(portablePackage.integrity.collections.content)

  const validation = await portability.validatePortablePackage({ package: portablePackage })
  assert.equal(validation.valid, true)
  const dryRun = await portability.importPortablePackage({ package: portablePackage, targetWebsiteId: 'site-two', mode: 'dry-run' }, { id: 'check' })
  assert.equal(dryRun.status, 'validated')
  const imported = await portability.importPortablePackage({ package: portablePackage, targetWebsiteId: 'site-two', mode: 'replace' }, { id: 'check' })
  assert.equal(imported.status, 'completed')
  const restored = JSON.parse(await fs.readFile(path.join(temporary, 'server-data', 'content', 'site-two.json'), 'utf8'))
  assert.equal(restored.title, 'Portable content')

  const archiveJob = await portability.createExportJob({ websiteId: 'site-one', format: 'archive', includeAssetFiles: false }, { id: 'check' })
  assert.equal(archiveJob.format, 'archive')
  assert.equal((await portability.readExportPackage(archiveJob.id)).contentType, 'application/gzip')

  const tampered = structuredClone(portablePackage)
  tampered.collections.content.title = 'Tampered'
  assert.equal((await portability.validatePortablePackage({ package: tampered })).valid, false)

  const state = await portability.getPortabilityState({ limit: 100 })
  assert.equal(state.jobs.length, 2)
  assert(state.statistics.exports >= 2)
  assert(state.statistics.imports >= 1)
  assert(state.statistics.validations >= 3)
  assert(state.history.some(item => item.action === 'portability-export.completed'))
  assert.equal('internalPath' in state.jobs[0], false)

  const router = await fs.readFile(path.join(root, 'server/dataPortabilityRouter.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(router, /Owner permission required/)
  assert.match(router, /exports\/:jobId\/download/)
  assert.match(router, /validatePortablePackage/)
  assert.match(start, /createDataPortabilityRouter/)
  assert.match(start, /\/api\/data-portability/)

  console.log('Data export and portability checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
