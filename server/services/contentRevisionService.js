import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'

const MAX_REVISIONS_PER_RECORD = 30

function revisionPath(websiteId, typeId) {
  return path.join(DATA_DIR, 'content-revisions', safeName(websiteId), `${safeName(typeId)}.json`)
}

function revisionSnapshot(record = {}) {
  const { revisions, ...snapshot } = structuredClone(record)
  return snapshot
}

function revisionSnapshotState(snapshot = {}) {
  const state = structuredClone(snapshot)
  delete state.updatedAt
  return state
}

function revisionSnapshotChanged(current, proposed) {
  return JSON.stringify(revisionSnapshotState(current)) !== JSON.stringify(revisionSnapshotState(proposed))
}

function revisionRecord(record, timestamp = new Date().toISOString()) {
  return {
    id: crypto.randomUUID(),
    contentRecordId: record.id,
    createdAt: timestamp,
    snapshot: revisionSnapshot(record),
  }
}

async function publishContentRevisionEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export async function listContentRevisions(websiteId, typeId, recordId) {
  const revisions = await readJson(revisionPath(websiteId, typeId), [])
  return revisions
    .filter(revision => revision.contentRecordId === recordId)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, MAX_REVISIONS_PER_RECORD)
}

export async function getContentRevision(websiteId, typeId, recordId, revisionId) {
  const revisions = await listContentRevisions(websiteId, typeId, recordId)
  return revisions.find(revision => revision.id === revisionId) || null
}

export async function saveContentRevision(websiteId, typeId, record) {
  const file = revisionPath(websiteId, typeId)
  const all = await readJson(file, [])
  const previousRecordRevisions = all.filter(revision => revision.contentRecordId === record.id)
  const latest = previousRecordRevisions
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))[0]
  const snapshot = revisionSnapshot(record)
  if (latest && !revisionSnapshotChanged(latest.snapshot, snapshot)) return latest

  const created = revisionRecord(record)
  const otherRecords = all.filter(revision => revision.contentRecordId !== record.id)
  const currentRecord = [created, ...previousRecordRevisions]
    .slice(0, MAX_REVISIONS_PER_RECORD)
  const next = [...currentRecord, ...otherRecords]
  await writeJson(file, next)
  await publishContentRevisionEvent('content-revision.saved', {
    revisionCount: currentRecord.length,
    totalRevisionCount: next.length,
    retentionLimitReached: previousRecordRevisions.length >= MAX_REVISIONS_PER_RECORD,
    revisionPruned: previousRecordRevisions.length + 1 > currentRecord.length,
  })
  return created
}

export async function importContentRevisions(websiteId, typeId, recordId, revisions = []) {
  if (!Array.isArray(revisions) || revisions.length === 0) return
  const file = revisionPath(websiteId, typeId)
  const all = await readJson(file, [])
  if (all.some(revision => revision.contentRecordId === recordId)) return

  const imported = revisions.slice(0, MAX_REVISIONS_PER_RECORD).map(revision => ({
    id: revision.id || crypto.randomUUID(),
    contentRecordId: recordId,
    createdAt: revision.createdAt || new Date().toISOString(),
    snapshot: structuredClone(revision.snapshot || revision),
  }))
  const next = [...imported, ...all]
  await writeJson(file, next)
  await publishContentRevisionEvent('content-revision.imported', {
    importedRevisionCount: imported.length,
    totalRevisionCount: next.length,
    importTruncated: revisions.length > imported.length,
    retentionLimitReached: imported.length === MAX_REVISIONS_PER_RECORD,
  })
}
