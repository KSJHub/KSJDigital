import crypto from 'node:crypto'
import { paths, readJson, writeJson } from './storage.js'

const IGNORED_KEYS = new Set([
  'updatedAt',
  'publishedAt',
  'publishedBy',
  'publishRequestId',
])

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value

  return Object.keys(value)
    .filter(key => !IGNORED_KEYS.has(key))
    .sort()
    .reduce((result, key) => {
      result[key] = stableValue(value[key])
      return result
    }, {})
}

function snapshotFingerprint(request = {}) {
  const snapshot = stableValue(request.draftSnapshot || {})
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex')
}

export async function collapseDuplicateApprovalRequests() {
  const requests = await readJson(paths.requests(), [])
  if (!Array.isArray(requests) || !requests.length) return

  const ordered = [...requests].sort((left, right) => {
    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
  })

  const newestLegacyByWebsite = new Set()
  const recoveredDrafts = new Map()
  const prepared = []
  let changed = false

  for (const request of ordered) {
    if (request.status !== 'Waiting Review' || request.draftSnapshot) {
      prepared.push(request)
      continue
    }

    const websiteId = request.websiteId || 'website'
    if (newestLegacyByWebsite.has(websiteId)) {
      changed = true
      prepared.push({
        ...request,
        status: 'Superseded',
        supersededAt: new Date().toISOString(),
        supersededReason: 'Legacy request without a frozen snapshot was replaced by the newest recoverable request.',
      })
      continue
    }

    newestLegacyByWebsite.add(websiteId)
    let draft = recoveredDrafts.get(websiteId)
    if (!recoveredDrafts.has(websiteId)) {
      draft = await readJson(paths.content(websiteId), null)
      recoveredDrafts.set(websiteId, draft)
    }

    if (!draft) {
      prepared.push(request)
      continue
    }

    changed = true
    prepared.push({
      ...request,
      draftSnapshot: structuredClone(draft),
      snapshotUpdatedAt: draft.updatedAt || null,
      snapshotRecoveredAt: new Date().toISOString(),
      snapshotRecoveryWarning: 'This request was created before frozen snapshots were enabled. The current website draft was attached during recovery and may not exactly match the original submission time.',
    })
  }

  const latestByDraft = new Map()
  const updated = prepared.map(request => {
    if (request.status !== 'Waiting Review' || !request.draftSnapshot) return request

    const key = `${request.websiteId || 'website'}:${snapshotFingerprint(request)}`
    const latest = latestByDraft.get(key)

    if (!latest) {
      latestByDraft.set(key, request)
      return request
    }

    changed = true
    return {
      ...request,
      status: 'Superseded',
      supersededAt: new Date().toISOString(),
      supersededBy: latest.id,
      supersededReason: 'Duplicate of a newer pending draft snapshot',
    }
  })

  if (changed) await writeJson(paths.requests(), updated)
}
