import fs from 'node:fs/promises'
import { migrateActiveSites } from './activeSitesMigration.js'
import { collapseDuplicateApprovalRequests } from './approvalQueueCleanup.js'
import './identityAccessRuntime.js'
import './publishingRuntime.js'
import './publishingDecisionRuntime.js'

globalThis.fs = fs
await migrateActiveSites()
await collapseDuplicateApprovalRequests()
