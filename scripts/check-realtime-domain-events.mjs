import fs from 'node:fs/promises'

const files = {
  service: 'server/services/realtimeDomainEventService.js',
  notifications: 'server/notificationRouter.js',
  collaboration: 'server/collaborationRouter.js',
}

const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await fs.readFile(file, 'utf8')])))
const requirements = [
  ['service', "registerJobHandler('notification-delivery'"],
  ['service', "publishDomainEvent('notification.delivered'"],
  ['service', "publishDomainEvent('notification.failed'"],
  ['notifications', "publishDomainEvent('notification.queued'"],
  ['notifications', "publishDomainEvent('notification.template-updated'"],
  ['collaboration', "publishDomainEvent('collaboration.session-created'"],
  ['collaboration', "publishDomainEvent('collaboration.session-heartbeat'"],
  ['collaboration', "publishDomainEvent('collaboration.lock-acquired'"],
  ['collaboration', "publishDomainEvent('collaboration.change-applied'"],
  ['collaboration', "publishDomainEvent('collaboration.conflict-detected'"],
  ['collaboration', "publishDomainEvent('collaboration.conflict-resolved'"],
]

for (const [file, token] of requirements) {
  if (!source[file].includes(token)) throw new Error(`Missing real-time domain event integration: ${file} -> ${token}`)
}

console.log('Real-time domain event checks passed')
