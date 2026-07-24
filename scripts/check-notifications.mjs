import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const originalCwd = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-notifications-'))
process.chdir(temporary)

try {
  const notifications = await import(path.join(originalCwd, 'server/services/notificationService.js'))
  const jobs = await import(path.join(originalCwd, 'server/services/jobQueueService.js'))

  assert(notifications.listNotificationProviders().some(provider => provider.id === 'in-app'))

  const template = await notifications.upsertNotificationTemplate({
    id: 'welcome',
    name: 'Welcome',
    subject: 'Welcome {{name}}',
    body: 'Hello {{name}}, welcome to {{community.name}}.',
  })
  assert.equal(template.id, 'welcome')

  const recipient = await notifications.upsertNotificationRecipient({
    id: 'owner-inbox',
    name: 'Owner inbox',
    provider: 'in-app',
    address: 'owner',
  })
  assert.equal(recipient.provider, 'in-app')

  await notifications.updateNotificationRateLimit('in-app', { windowMs: 60_000, maximum: 10 })

  const first = await notifications.queueNotification({
    templateId: 'welcome',
    recipientIds: ['owner-inbox'],
    variables: { name: 'Morgan', community: { name: 'KSJ Digital' } },
    deduplicationKey: 'welcome-owner',
  })
  const duplicate = await notifications.queueNotification({
    templateId: 'welcome',
    recipientIds: ['owner-inbox'],
    variables: { name: 'Morgan', community: { name: 'KSJ Digital' } },
    deduplicationKey: 'welcome-owner',
  })
  assert.equal(first.jobs[0].id, duplicate.jobs[0].id, 'Notification queueing must be idempotent')

  await jobs.processJobQueue({ workerId: 'notification-validator', queue: 'notifications', limit: 10 })
  const state = await notifications.getNotificationState({ limit: 20 })
  assert.equal(state.deliveries.length, 1)
  assert.equal(state.deliveries[0].status, 'delivered')
  assert.equal(state.deliveries[0].message.subject, 'Welcome Morgan')
  assert.match(state.deliveries[0].message.body, /KSJ Digital/)
  assert(state.history.some(event => event.action === 'notification.delivered'))

  const routerSource = await fs.readFile(path.join(originalCwd, 'server/notificationRouter.js'), 'utf8')
  const startSource = await fs.readFile(path.join(originalCwd, 'server/start.js'), 'utf8')
  assert.match(routerSource, /Owner permission required/)
  assert.match(routerSource, /router\.post\('\/deliveries'/)
  assert.match(startSource, /createNotificationRouter/)
  assert.match(startSource, /\/api\/notifications/)

  console.log('Notification engine checks passed')
} finally {
  await new Promise(resolve => setTimeout(resolve, 100))
  process.chdir(originalCwd)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
