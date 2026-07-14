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
  if (!Array.isArray(requests) || requests.length < 2) return

  const ordered = [...requests].sort((left, right) => {
    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
  })

  const latestByDraft = new Map()
  let changed = false

  const updated = ordered.map(request => {
    if (request.status !== 'Waiting Review') return request

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
