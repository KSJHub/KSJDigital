import { starterWebsites } from '../defaults.js'
import { paths, readJson, safeName } from '../storage.js'
import { processScheduledContentRecords } from './contentRecordService.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'

const DEFAULT_INTERVAL_MS = 60_000
const MINIMUM_INTERVAL_MS = 10_000

function configuredInterval() {
  const value = Number(process.env.CONTENT_WORKFLOW_INTERVAL_MS || DEFAULT_INTERVAL_MS)
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_MS
  return Math.max(MINIMUM_INTERVAL_MS, Math.floor(value))
}

async function publishSchedulerEvent(payload) {
  await publishDomainEvent('content-workflow.scheduler-run', payload)
}

export function startContentWorkflowScheduler() {
  let running = false

  const run = async () => {
    if (running) return
    running = true
    let websiteCount = 0
    let processedWebsiteCount = 0
    let failedWebsiteCount = 0
    let publishedRecordCount = 0
    try {
      const websites = await readJson(paths.websites(), starterWebsites)
      const records = Array.isArray(websites) ? websites : []
      websiteCount = records.length
      for (const website of records) {
        const websiteId = safeName(website?.id)
        if (!websiteId) continue
        try {
          const published = await processScheduledContentRecords(websiteId)
          processedWebsiteCount += 1
          publishedRecordCount += Array.isArray(published) ? published.length : 0
        } catch (error) {
          failedWebsiteCount += 1
          console.error(`Unable to process scheduled content for ${websiteId}:`, error)
        }
      }
      if (publishedRecordCount > 0 || failedWebsiteCount > 0) {
        await publishSchedulerEvent({
          websiteCount,
          processedWebsiteCount,
          failedWebsiteCount,
          publishedRecordCount,
          hadPublications: publishedRecordCount > 0,
          completedWithoutFailures: failedWebsiteCount === 0,
        })
      }
    } catch (error) {
      console.error('Unable to process scheduled content:', error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(run, configuredInterval())
  timer.unref?.()
  void run()

  return () => clearInterval(timer)
}
