import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ksj-collaboration-'))
process.chdir(temporary)
try {
  const serviceFile = path.join(root, 'server/services/collaborationService.js')
  const collaboration = await import(`${pathToFileURL(serviceFile).href}?check=${Date.now()}`)
  const owner = { id: 'owner-check', email: 'owner@example.test', role: 'owner' }
  const resource = { websiteId: 'site-one', resourceType: 'content', resourceId: 'home-page' }

  const session = await collaboration.createCollaborationSession({ ...resource, displayName: 'Owner' }, owner)
  assert.equal(session.status, 'active')
  assert.equal(session.websiteId, 'site-one')

  const heartbeat = await collaboration.heartbeatSession(session.id, { cursor: { line: 3, column: 5 }, selection: { start: 1, end: 4 } }, owner)
  assert.deepEqual(heartbeat.cursor, { line: 3, column: 5 })
  assert.deepEqual(heartbeat.selection, { start: 1, end: 4 })

  const lock = await collaboration.acquireRecordLock({ ...resource, sessionId: session.id }, owner)
  assert.equal(lock.status, 'active')

  const change = await collaboration.appendCollaborationChange({ ...resource, sessionId: session.id, baseVersion: 0, operation: 'replace', path: 'title', value: 'Updated' }, owner)
  assert.equal(change.version, 1)

  let conflict
  try {
    await collaboration.appendCollaborationChange({ ...resource, sessionId: session.id, baseVersion: 0, operation: 'replace', path: 'title', value: 'Stale' }, owner)
  } catch (error) {
    conflict = error
  }
  assert.equal(conflict?.status, 409)
  assert.equal(conflict?.details?.currentVersion, 1)

  const state = await collaboration.getCollaborationState({ limit: 100 })
  assert.equal(state.sessions.length, 1)
  assert.equal(state.locks.length, 1)
  assert.equal(state.changes.length, 1)
  assert.equal(state.conflicts.length, 1)
  assert.equal(state.statistics.conflictsDetected, 1)

  const resolved = await collaboration.resolveCollaborationConflict(state.conflicts[0].id, { resolution: 'accept-current', notes: 'Stale change discarded' }, owner)
  assert.equal(resolved.status, 'resolved')

  const recovered = await collaboration.recoverCollaborationSession(session.id, owner)
  assert.equal(recovered.recoveredFromSessionId, session.id)

  const released = await collaboration.releaseRecordLock(lock.id, owner)
  assert.equal(released.status, 'released')
  const closed = await collaboration.closeCollaborationSession(session.id, owner)
  assert.equal(closed.status, 'closed')

  const router = await fs.readFile(path.join(root, 'server/collaborationRouter.js'), 'utf8')
  const start = await fs.readFile(path.join(root, 'server/start.js'), 'utf8')
  assert.match(router, /Owner permission required/)
  assert.match(router, /conflicts/)
  assert.match(start, /createCollaborationRouter/)
  assert.match(start, /startCollaborationCleanup/)
  assert.match(start, /\/api\/collaboration/)

  console.log('Real-time collaboration checks passed')
} finally {
  process.chdir(root)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
