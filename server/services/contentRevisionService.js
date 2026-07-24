import crypto from 'node:crypto'
import { paths, readJson, writeJson } from '../storage.js'

const MAX_REVISIONS_PER_RECORD = 30

function revisionRecord(record, timestamp = new Date().toISOString()) {
  const { revisions, ...snapshot } = structuredClone(record)
  return {
    id: crypto.randomUUID(),
    contentRecordId: record.id,
    createdAt: timestamp,
    snapshot,
  }
}

export async function listContentRevisions(websiteId, typeId, recordId) {
  const revisions = await readJson(paths.contentRevisions(websiteId, typeId), [])
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
  const all = await readJson(paths.contentRevisions(websiteId, typeId), [])
  const created = revisionRecord(record)
  const otherRecords = all.filter(revision => revision.contentRecordId !== record.id)
  const currentRecord = [created, ...all.filter(revision => revision.contentRecordId === record.id)]
    .slice(0, MAX_REVISIONS_PER_RECORD)
  await writeJson(paths.contentRevisions(websiteId, typeId), [...currentRecord, ...otherRecords])
  return created
}

export async function importContentRevisions(websiteId, typeId, recordId, revisions = []) {
  if (!Array.isArray(revisions) || revisions.length === 0) return
  const all = await readJson(paths.contentRevisions(websiteId, typeId), [])
  if (all.some(revision => revision.contentRecordId === recordId)) return

  const imported = revisions.slice(0, MAX_REVISIONS_PER_RECORD).map(revision => ({
    id: revision.id || crypto.randomUUID(),
    contentRecordId: recordId,
    createdAt: revision.createdAt || new Date().toISOString(),
    snapshot: structuredClone(revision.snapshot || revision),
  }))
  await writeJson(paths.contentRevisions(websiteId, typeId), [...imported, ...all])
}
