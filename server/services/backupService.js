import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { ASSET_DIR, BACKUP_DIR, DATA_DIR, ensureDir, readJson, safeName, writeJson } from '../storage.js'
import { publishIntegrationEvent } from './integrationService.js'
import { writeStructuredLog } from './systemHealthService.js'

const ROOT = path.join(BACKUP_DIR, 'snapshots')
const REGISTRY = path.join(BACKUP_DIR, 'backup-registry.json')
const locks = new Map()
const timers = new Map()
const DEFAULTS = { enabled: true, intervalMs: 24 * 60 * 60_000, retentionDays: 30, maximumBackups: 30, includeAssets: true }

export class BackupError extends Error {
  constructor(message, status = 400, details = null) { super(message); this.name = 'BackupError'; this.status = status; this.details = details }
}

function nowIso() { return new Date().toISOString() }
function initialRegistry() { return { settings: { ...DEFAULTS }, backups: [], restores: [], lastScheduledAt: null, updatedAt: nowIso() } }
async function readRegistry() {
  const registry = await readJson(REGISTRY, null) || initialRegistry()
  registry.settings = { ...DEFAULTS, ...(registry.settings || {}) }
  registry.backups ||= []
  registry.restores ||= []
  return registry
}
async function mutate(operation) {
  const previous = locks.get('registry') || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = structuredClone(await readRegistry())
    const result = await operation(registry)
    registry.updatedAt = nowIso()
    await writeJson(REGISTRY, registry)
    return result === undefined ? registry : result
  })
  locks.set('registry', current)
  try { return await current } finally { if (locks.get('registry') === current) locks.delete('registry') }
}
function contained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
async function walk(directory, base = directory) {
  const output = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const full = path.join(directory, entry.name)
    if (contained(BACKUP_DIR, full)) continue
    if (entry.isDirectory()) output.push(...await walk(full, base))
    else if (entry.isFile()) output.push({ full, relative: path.relative(base, full).split(path.sep).join('/') })
  }
  return output
}
async function copyActiveData(destination, includeAssets) {
  await ensureDir(destination)
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))
  for (const entry of entries) {
    const source = path.join(DATA_DIR, entry.name)
    if (contained(BACKUP_DIR, source)) continue
    if (!includeAssets && contained(ASSET_DIR, source)) continue
    await fs.cp(source, path.join(destination, entry.name), { recursive: true })
  }
}
async function hashFile(file) {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(file))
  return hash.digest('hex')
}
async function manifestFor(directory) {
  const files = await walk(directory)
  const entries = []
  let totalBytes = 0
  for (const item of files) {
    const info = await fs.stat(item.full)
    entries.push({ path: item.relative, size: info.size, sha256: await hashFile(item.full) })
    totalBytes += info.size
  }
  entries.sort((a, b) => a.path.localeCompare(b.path))
  return { algorithm: 'sha256', files: entries, fileCount: entries.length, totalBytes }
}
function backupFolder(id) { return path.join(ROOT, safeName(id)) }
async function verifyManifest(folder, manifest) {
  const errors = []
  for (const entry of manifest.files || []) {
    const file = path.join(folder, 'data', ...entry.path.split('/'))
    if (!contained(path.join(folder, 'data'), file)) { errors.push({ path: entry.path, error: 'Unsafe path' }); continue }
    try {
      const info = await fs.stat(file)
      if (info.size !== entry.size) errors.push({ path: entry.path, error: 'Size mismatch' })
      else if (await hashFile(file) !== entry.sha256) errors.push({ path: entry.path, error: 'Checksum mismatch' })
    } catch (error) { errors.push({ path: entry.path, error: error.code === 'ENOENT' ? 'Missing file' : error.message }) }
  }
  return { valid: errors.length === 0, checkedFiles: manifest.files?.length || 0, errors }
}

export async function createBackup(input = {}) {
  const registry = await readRegistry()
  const includeAssets = input.includeAssets === undefined ? registry.settings.includeAssets !== false : input.includeAssets === true
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`
  const temporary = path.join(ROOT, `.${id}.tmp`)
  const destination = backupFolder(id)
  await ensureDir(temporary)
  try {
    await copyActiveData(path.join(temporary, 'data'), includeAssets)
    const manifest = { id, label: String(input.label || '').trim().slice(0, 200) || null, createdAt: nowIso(), includeAssets, ...await manifestFor(path.join(temporary, 'data')) }
    await fs.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    await ensureDir(ROOT)
    await fs.rename(temporary, destination)
    await mutate(current => {
      current.backups.unshift({ ...manifest, status: 'available' })
      current.lastScheduledAt = input.scheduled ? nowIso() : current.lastScheduledAt
    })
    if (!input.skipPrune) await pruneBackups()
    await writeStructuredLog('info', 'Backup created', { backupId: id, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, includeAssets })
    return manifest
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true }).catch(() => {})
    publishIntegrationEvent('global', 'backup.failed', { error: error.message }, { disasterRecovery: true }).catch(() => {})
    throw error
  }
}

export async function listBackups() { return readRegistry() }
export async function verifyBackup(idValue) {
  const id = safeName(idValue)
  const folder = backupFolder(id)
  const manifest = await readJson(path.join(folder, 'manifest.json'), null)
  if (!manifest) throw new BackupError('Backup not found', 404)
  const verification = await verifyManifest(folder, manifest)
  return { backup: manifest, ...verification, verifiedAt: nowIso() }
}
export async function previewRestore(idValue, options = {}) {
  const verification = await verifyBackup(idValue)
  if (!verification.valid) throw new BackupError('Backup integrity verification failed', 409, verification.errors)
  const selected = Array.isArray(options.paths) && options.paths.length ? new Set(options.paths.map(String)) : null
  const files = verification.backup.files.filter(entry => !selected || selected.has(entry.path))
  if (selected && files.length !== selected.size) throw new BackupError('One or more selected restore paths do not exist in the backup', 422)
  const token = crypto.createHash('sha256').update(`${verification.backup.id}:${files.map(item => item.path).join('|')}:${verification.backup.createdAt}`).digest('hex')
  return { backupId: verification.backup.id, mode: selected ? 'selective' : 'full', files, fileCount: files.length, totalBytes: files.reduce((sum, item) => sum + item.size, 0), confirmationToken: token }
}
async function atomicCopy(source, destination) {
  await ensureDir(path.dirname(destination))
  const temporary = `${destination}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.restore.tmp`
  await fs.copyFile(source, temporary)
  try { await fs.rename(temporary, destination) } catch (error) {
    if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error
    await fs.copyFile(temporary, destination)
    await fs.rm(temporary, { force: true })
  }
}
async function clearActiveData() {
  for (const entry of await fs.readdir(DATA_DIR, { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const target = path.join(DATA_DIR, entry.name)
    if (contained(BACKUP_DIR, target)) continue
    await fs.rm(target, { recursive: true, force: true })
  }
}
export async function restoreBackup(idValue, options = {}) {
  const preview = await previewRestore(idValue, options)
  if (!options.confirmationToken || options.confirmationToken !== preview.confirmationToken) throw new BackupError('Restore confirmation token is invalid', 409)
  const recovery = await createBackup({ label: `Pre-restore recovery for ${preview.backupId}`, skipPrune: true })
  const sourceRoot = path.join(backupFolder(preview.backupId), 'data')
  const restored = []
  try {
    if (preview.mode === 'full') await clearActiveData()
    for (const entry of preview.files) {
      const source = path.join(sourceRoot, ...entry.path.split('/'))
      const destination = path.join(DATA_DIR, ...entry.path.split('/'))
      if (!contained(sourceRoot, source) || !contained(DATA_DIR, destination) || contained(BACKUP_DIR, destination)) throw new BackupError('Restore path is unsafe', 422)
      await atomicCopy(source, destination)
      restored.push(entry.path)
    }
    const record = { id: crypto.randomUUID(), backupId: preview.backupId, recoveryBackupId: recovery.id, mode: preview.mode, restoredFiles: restored, restoredAt: nowIso(), status: 'completed' }
    await mutate(registry => { registry.restores.unshift(record); registry.restores = registry.restores.slice(0, 500) })
    await pruneBackups()
    await writeStructuredLog('warn', 'Backup restored', record)
    publishIntegrationEvent('global', 'backup.restored', record, { disasterRecovery: true }).catch(() => {})
    return record
  } catch (error) {
    await mutate(registry => registry.restores.unshift({ id: crypto.randomUUID(), backupId: preview.backupId, recoveryBackupId: recovery.id, restoredFiles: restored, restoredAt: nowIso(), status: 'failed', error: error.message }))
    throw error
  }
}
export async function deleteBackup(idValue) {
  const id = safeName(idValue)
  await fs.rm(backupFolder(id), { recursive: true, force: true })
  return mutate(registry => { const existed = registry.backups.some(item => item.id === id); registry.backups = registry.backups.filter(item => item.id !== id); return { deleted: existed, id } })
}
export async function updateBackupSettings(input = {}) {
  return mutate(registry => {
    const number = (key, min, max) => Math.min(max, Math.max(min, Number(input[key] ?? registry.settings[key] ?? DEFAULTS[key])))
    registry.settings = { enabled: input.enabled === undefined ? registry.settings.enabled !== false : input.enabled === true, intervalMs: number('intervalMs', 60 * 60_000, 365 * 86_400_000), retentionDays: number('retentionDays', 1, 3650), maximumBackups: number('maximumBackups', 1, 365), includeAssets: input.includeAssets === undefined ? registry.settings.includeAssets !== false : input.includeAssets === true }
    return registry.settings
  })
}
export async function pruneBackups() {
  const registry = await readRegistry()
  const cutoff = Date.now() - registry.settings.retentionDays * 86_400_000
  const keep = registry.backups.filter((item, index) => index < registry.settings.maximumBackups && new Date(item.createdAt).getTime() >= cutoff)
  const remove = registry.backups.filter(item => !keep.some(kept => kept.id === item.id))
  for (const item of remove) await fs.rm(backupFolder(item.id), { recursive: true, force: true })
  await mutate(current => { current.backups = current.backups.filter(item => keep.some(kept => kept.id === item.id)) })
  return { removed: remove.length, remaining: keep.length }
}
export function startBackupScheduler() {
  if (timers.has('scheduler')) return timers.get('scheduler')
  const pulse = async () => {
    const registry = await readRegistry()
    if (registry.settings.enabled === false) return
    const last = new Date(registry.lastScheduledAt || 0).getTime()
    if (Date.now() - last >= registry.settings.intervalMs) await createBackup({ scheduled: true, label: 'Scheduled backup' })
  }
  const timer = setInterval(() => pulse().catch(error => console.error('Backup scheduler failed', error)), 60_000)
  timer.unref?.()
  timers.set('scheduler', timer)
  pulse().catch(error => console.error('Backup scheduler startup failed', error))
  return timer
}
