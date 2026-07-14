import fs from 'node:fs/promises'
import { migrateActiveSites } from './activeSitesMigration.js'
import './identityAccessRuntime.js'
import './publishingRuntime.js'

globalThis.fs = fs
await migrateActiveSites()
