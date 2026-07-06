const AUDIT_KEY = 'ksjDigitalAuditLog'
const BACKUP_KEY = 'ksjDigitalBackups'

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback } catch { return fallback }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  return value
}

function key(prefix, websiteId = 'twotonetaj') {
  return `${prefix}:${websiteId}`
}

export function addAuditEvent(websiteId, event) {
  const events = read(key(AUDIT_KEY, websiteId), [])
  const item = { id: `audit-${Date.now()}`, createdAt: new Date().toLocaleString(), ...event }
  return write(key(AUDIT_KEY, websiteId), [item, ...events].slice(0, 100))
}

export function getAuditEvents(websiteId) {
  return read(key(AUDIT_KEY, websiteId), [])
}

export function createBackup(websiteId, payload) {
  const backups = read(key(BACKUP_KEY, websiteId), [])
  const item = {
    id: `backup-${Date.now()}`,
    createdAt: new Date().toLocaleString(),
    status: 'Complete',
    size: JSON.stringify(payload || {}).length,
    payload,
  }
  addAuditEvent(websiteId, { type: 'Backup', message: 'Manual backup created', actor: 'KSJ Digital' })
  return write(key(BACKUP_KEY, websiteId), [item, ...backups].slice(0, 20))
}

export function getBackups(websiteId) {
  return read(key(BACKUP_KEY, websiteId), [])
}

export function restoreBackup(websiteId, backupId) {
  const backup = getBackups(websiteId).find(item => item.id === backupId)
  addAuditEvent(websiteId, { type: 'Restore', message: `Backup restored: ${backup?.createdAt || backupId}`, actor: 'KSJ Digital' })
  return backup
}

export function getProductionChecklist() {
  return [
    ['Authentication', 'Local session active', 'Needs production JWT/password hashing'],
    ['Storage', 'Local + server filesystem ready', 'Cloud storage recommended for production'],
    ['Publishing', 'Approval workflow ready', 'Repository token required for live deployment'],
    ['Backups', 'Manual backup system ready', 'Automated scheduled backups next'],
    ['Audit Logs', 'Portal audit trail ready', 'Server-side immutable logs next'],
    ['Monitoring', 'Health endpoint ready', 'Uptime monitoring next'],
  ]
}
