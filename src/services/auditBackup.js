export function getProductionChecklist() {
  return [
    ['Authentication', 'Server session endpoints active', 'Harden every API route with middleware'],
    ['Storage', 'Server filesystem storage active', 'Cloud storage recommended for production'],
    ['Publishing', 'Approval workflow ready', 'Repository token required for live deployment'],
    ['Backups', 'Backup module pending API migration', 'Server-side restore points next'],
    ['Audit Logs', 'Activity logging pending API migration', 'Server-side immutable logs next'],
    ['Monitoring', 'Health endpoint ready', 'Uptime monitoring next'],
  ]
}
