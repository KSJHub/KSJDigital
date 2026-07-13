import fs from 'node:fs/promises'
import { migrateActiveSites } from './activeSitesMigration.js'

globalThis.fs = fs
await migrateActiveSites()
