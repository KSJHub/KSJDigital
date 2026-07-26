import fs from 'node:fs/promises'

const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
const scripts = packageJson.scripts || {}
const fullCheck = String(scripts.check || '')

const realtimeChecks = [
  ['check:authentication-realtime', 'scripts/check-authentication-realtime-events.mjs'],
  ['check:client-account-realtime', 'scripts/check-client-account-realtime-events.mjs'],
  ['check:website-realtime', 'scripts/check-website-realtime-events.mjs'],
  ['check:team-realtime', 'scripts/check-team-realtime-events.mjs'],
  ['check:commerce-settings-realtime', 'scripts/check-commerce-settings-realtime-events.mjs'],
  ['check:asset-library-realtime', 'scripts/check-asset-library-realtime-events.mjs'],
  ['check:taxonomy-realtime', 'scripts/check-taxonomy-realtime-events.mjs'],
  ['check:localisation-realtime', 'scripts/check-localisation-realtime-events.mjs'],
  ['check:integration-realtime', 'scripts/check-integration-realtime-events.mjs'],
  ['check:automation-realtime', 'scripts/check-automation-realtime-events.mjs'],
  ['check:job-realtime', 'scripts/check-job-realtime-events.mjs'],
  ['check:notification-realtime', 'scripts/check-notification-realtime-events.mjs'],
  ['check:feature-flag-realtime', 'scripts/check-feature-flag-realtime-events.mjs'],
  ['check:service-account-realtime', 'scripts/check-service-account-realtime-events.mjs'],
  ['check:api-key-realtime', 'scripts/check-api-key-realtime-events.mjs'],
  ['check:mfa-realtime', 'scripts/check-mfa-realtime-events.mjs'],
  ['check:abuse-protection-realtime', 'scripts/check-abuse-protection-realtime-events.mjs'],
  ['check:cache-realtime', 'scripts/check-cache-realtime-events.mjs'],
  ['check:event-bus-realtime', 'scripts/check-event-bus-realtime-events.mjs'],
  ['check:websocket-events', 'scripts/check-websocket-event-bridge.mjs'],
  ['check:data-portability-realtime', 'scripts/check-data-portability-realtime-events.mjs'],
  ['check:retention-compliance-realtime', 'scripts/check-retention-compliance-realtime-events.mjs'],
  ['check:privacy-rights-realtime', 'scripts/check-privacy-rights-realtime-events.mjs'],
  ['check:collaboration-realtime', 'scripts/check-collaboration-realtime-events.mjs'],
  ['check:system-health-realtime', 'scripts/check-system-health-realtime-events.mjs'],
  ['check:backup-realtime', 'scripts/check-backup-realtime-events.mjs'],
  ['check:configuration-realtime', 'scripts/check-configuration-realtime-events.mjs'],
  ['check:release-realtime', 'scripts/check-release-realtime-events.mjs'],
  ['check:migration-realtime', 'scripts/check-migration-realtime-events.mjs'],
]

for (const [scriptName, validatorFile] of realtimeChecks) {
  const expectedCommand = `node ${validatorFile}`
  if (scripts[scriptName] !== expectedCommand) {
    throw new Error(`Missing or incorrect realtime validator script: ${scriptName}`)
  }
  await fs.access(new URL(`../${validatorFile}`, import.meta.url))
  if (!fullCheck.includes(`npm run ${scriptName}`)) {
    throw new Error(`Realtime validator is not included in the full project check: ${scriptName}`)
  }
}

const files = {
  service: 'server/services/realtimeDomainEventService.js',
  notifications: 'server/notificationRouter.js',
  collaboration: 'server/collaborationRouter.js',
}

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, file]) => [key, await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8')]),
))

const canonicalRequirements = [
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

for (const [file, token] of canonicalRequirements) {
  if (!source[file].includes(token)) {
    throw new Error(`Missing real-time domain event integration: ${file} -> ${token}`)
  }
}

console.log(`Real-time domain event checks passed (${realtimeChecks.length} module validators registered).`)
