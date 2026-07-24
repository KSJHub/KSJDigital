import { starterWebsites } from '../defaults.js'
import { paths, readJson, safeName } from '../storage.js'
import { processScheduledContentRecords } from './contentRecordService.js'

const DEFAULT_INTERVAL_MS = 60_000
const MINIMUM_INTERVAL_MS = 10_000

function configuredInterval() {
  const value = Number(process.env.CONTENT_WORKFLOW_INTERVAL_MS || DEFAULT_INTERVAL_MS)
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_MS
  return Math.max(MINIMUM_INTERVAL_MS, Math.floor(value))
}

export function startContentWorkflowScheduler() {
  let running = false

  const run = async () => {
    if (running) return
    running = true
    try {
      const websites = await readJson(paths.websites(), starterWebsites)
      for (const website of Array.isArray(websites) ? websites : []) {
        const websiteId = safeName(website?.id)
        if (!websiteId) continue
        try {
          await processScheduledContentRecords(websiteId)
        } catch (error) {
          console.error(`Unable to process scheduled content for ${websiteId}:`, error)
        }
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
