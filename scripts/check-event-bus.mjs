import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-event-bus-'))
process.chdir(temporary)
try {
  const serviceFile = path.join(root, 'server/services/eventBusService.js')
  const bus = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)
  const received = []
  bus.registerEventHandler('content-handler', async event => { received.push(event) })
  bus.registerEventHandler('failing-handler', async () => { throw new Error('intentional delivery failure') })

  assert.equal(bus.topicMatches('content.*', 'content.created'), true)
  assert.equal(bus.topicMatches('content.**', 'content.page.created'), true)
  assert.equal(bus.topicMatches('content.*', 'content.page.created'), false)

  await bus.upsertSubscription({ id: 'content-events', topicPattern: 'content.*', handler: 'content-handler' }, { id: 'check' })
  await bus.upsertSubscription({ id: 'failed-events', topicPattern: 'fail.**', handler: 'failing-handler', retry: { maximumAttempts: 1 } }, { id: 'check' })

  const publication = await bus.publishEvent('content.created', { id: 'page-one' }, { correlationId: 'correlation-one' })
  assert.equal(publication.deliveryCount, 1)
  const processed = await bus.processEventDeliveries({ workerId: 'check-worker', limit: 10 })
  assert.equal(processed.processed, 1)
  assert.equal(received.length, 1)
  assert.deepEqual(received[0].payload, { id: 'page-one' })

  const failed = await bus.publishEvent('fail.delivery.test', { id: 'failed' })
  assert.equal(failed.deliveryCount, 1)
  await bus.processEventDeliveries({ workerId: 'check-worker', limit: 10 })
  let state = await bus.getEventBusState({ limit: 100 })
  assert.equal(state.deadLetters.length, 1)
  assert.equal(state.deadLetters[0].attempts, 1)
  assert(state.statistics.deadLettered >= 1)

  const replay = await bus.replayEvent(publication.event.id, { id: 'check' })
  assert.equal(replay.event.replayOfEventId, publication.event.id)
  await bus.processEventDeliveries({ workerId: 'check-worker', limit: 10 })
  assert.equal(received.length, 2)

  const deadLetterReplay = await bus.replayDeadLetter(state.deadLetters[0].id, { id: 'check' })
  assert.equal(deadLetterReplay.event.replayOfEventId, failed.event.id)
  state = await bus.getEventBusState({ limit: 100 })
  assert(state.statistics.published >= 4)
  assert(state.statistics.delivered >= 2)
  assert(state.statistics.replayed >= 2)
  assert(state.history.some(item => item.action === 'event-delivery.dead-lettered'))
  assert(state.history.some(item => item.action === 'event.replayed'))

  const router = await fs.readFile(path.join(root, 'server/eventBusRouter.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(router, /Owner permission required/)
  assert.match(router, /dead-letters/)
  assert.match(start, /startEventBusWorker/)
  assert.match(start, /createEventBusRouter/)
  assert.match(start, /\/api\/event-bus/)

  console.log('Event bus and internal messaging checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
