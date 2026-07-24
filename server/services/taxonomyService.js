import crypto from 'node:crypto'
import path from 'node:path'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { getContentType } from './contentTypeRegistry.js'

const taxonomyDir = path.join(DATA_DIR, 'taxonomies')
const contentRecordsDir = path.join(DATA_DIR, 'content-records')
const mutations = new Map()

export class TaxonomyError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'TaxonomyError'
    this.status = status
    this.details = details
  }
}

function identity(value, label) {
  const id = safeName(value)
  if (!id || id === 'file') throw new TaxonomyError(`${label} is required`, 422)
  return id
}

function stringValue(value, fallback = '') {
  return String(value ?? fallback).trim()
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => stringValue(item)).filter(Boolean))]
}

function registryPath(websiteId) {
  return path.join(taxonomyDir, `${safeName(websiteId)}.json`)
}

function emptyRegistry(websiteId) {
  return { version: 1, websiteId, taxonomies: [], terms: [], assignments: [] }
}

async function readRegistry(websiteId) {
  const stored = await readJson(registryPath(websiteId), emptyRegistry(websiteId))
  if (!stored || typeof stored !== 'object' || !Array.isArray(stored.taxonomies) || !Array.isArray(stored.terms) || !Array.isArray(stored.assignments)) {
    throw new TaxonomyError('Stored taxonomy registry is invalid', 500)
  }
  return { version: 1, websiteId, taxonomies: stored.taxonomies, terms: stored.terms, assignments: stored.assignments }
}

async function mutateRegistry(websiteId, operation) {
  const key = safeName(websiteId)
  const previous = mutations.get(key) || Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const registry = await readRegistry(websiteId)
    const result = await operation(registry)
    await writeJson(registryPath(websiteId), registry)
    return result
  })
  mutations.set(key, current)
  try {
    return await current
  } finally {
    if (mutations.get(key) === current) mutations.delete(key)
  }
}

function normaliseTaxonomy(websiteId, input = {}, existing = null) {
  const now = new Date().toISOString()
  const allowedContentTypes = uniqueStrings(input.allowedContentTypes ?? existing?.allowedContentTypes)
  const unknown = allowedContentTypes.filter(typeId => !getContentType(typeId))
  if (unknown.length) throw new TaxonomyError('Taxonomy contains unknown content types', 422, { contentTypes: unknown })
  return {
    id: existing?.id || identity(input.id || input.name || crypto.randomUUID(), 'Taxonomy id'),
    websiteId,
    label: stringValue(input.label, existing?.label || input.name || 'Untitled taxonomy'),
    description: stringValue(input.description, existing?.description),
    hierarchical: input.hierarchical === undefined ? existing?.hierarchical !== false : input.hierarchical === true,
    allowedContentTypes,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : existing?.metadata || {},
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

function normaliseTerm(websiteId, taxonomyId, input = {}, existing = null) {
  const now = new Date().toISOString()
  const name = stringValue(input.name, existing?.name)
  if (!name) throw new TaxonomyError('Term name is required', 422)
  const slugSource = stringValue(input.slug, existing?.slug || name)
  return {
    id: existing?.id || identity(input.id || crypto.randomUUID(), 'Term id'),
    websiteId,
    taxonomyId,
    parentId: input.parentId === null ? null : stringValue(input.parentId, existing?.parentId) || null,
    name,
    slug: identity(slugSource, 'Term slug'),
    description: stringValue(input.description, existing?.description),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : existing?.metadata || {},
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

function taxonomyOrThrow(registry, taxonomyId) {
  const taxonomy = registry.taxonomies.find(item => item.id === taxonomyId)
  if (!taxonomy) throw new TaxonomyError('Taxonomy not found', 404)
  return taxonomy
}

function termOrThrow(registry, taxonomyId, termId) {
  const term = registry.terms.find(item => item.taxonomyId === taxonomyId && item.id === termId)
  if (!term) throw new TaxonomyError('Taxonomy term not found', 404)
  return term
}

function validateParent(registry, taxonomy, term) {
  if (!term.parentId) return
  if (!taxonomy.hierarchical) throw new TaxonomyError('This taxonomy does not support parent terms', 422)
  const parent = termOrThrow(registry, taxonomy.id, term.parentId)
  if (parent.id === term.id) throw new TaxonomyError('A term cannot be its own parent', 422)
  const seen = new Set([term.id])
  let current = parent
  while (current) {
    if (seen.has(current.id)) throw new TaxonomyError('Term hierarchy would create a cycle', 422)
    seen.add(current.id)
    current = current.parentId ? registry.terms.find(item => item.taxonomyId === taxonomy.id && item.id === current.parentId) : null
  }
}

function ensureUniqueTerm(registry, term, ignoreId = null) {
  const duplicate = registry.terms.find(item => item.taxonomyId === term.taxonomyId && item.id !== ignoreId && (item.slug === term.slug || item.name.toLowerCase() === term.name.toLowerCase()))
  if (duplicate) throw new TaxonomyError('Term name or slug already exists in this taxonomy', 409, { termId: duplicate.id })
}

function usageFor(registry, taxonomyId, termId = null) {
  const assignments = registry.assignments.filter(item => item.taxonomyId === taxonomyId && (!termId || item.termId === termId))
  const byContentType = assignments.reduce((counts, assignment) => {
    counts[assignment.contentType] = (counts[assignment.contentType] || 0) + 1
    return counts
  }, {})
  return { count: assignments.length, byContentType, assignments }
}

async function assertContentRecord(websiteId, contentType, recordId) {
  if (!getContentType(contentType)) throw new TaxonomyError('Unknown content type', 422, { contentType })
  const records = await readJson(path.join(contentRecordsDir, websiteId, `${safeName(contentType)}.json`), [])
  if (!Array.isArray(records) || !records.some(record => String(record.id) === recordId)) {
    throw new TaxonomyError('Content record not found', 404, { contentType, recordId })
  }
}

function buildTree(terms, parentId = null) {
  return terms.filter(term => (term.parentId || null) === parentId).sort((a, b) => a.name.localeCompare(b.name)).map(term => ({
    ...term,
    children: buildTree(terms, term.id),
  }))
}

export async function listTaxonomies(websiteValue) {
  const websiteId = identity(websiteValue, 'Website id')
  const registry = await readRegistry(websiteId)
  return registry.taxonomies.map(taxonomy => ({
    ...taxonomy,
    termCount: registry.terms.filter(term => term.taxonomyId === taxonomy.id).length,
    usageCount: registry.assignments.filter(assignment => assignment.taxonomyId === taxonomy.id).length,
  })).sort((a, b) => a.label.localeCompare(b.label))
}

export async function getTaxonomy(websiteValue, taxonomyValue) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  const registry = await readRegistry(websiteId)
  const taxonomy = taxonomyOrThrow(registry, taxonomyId)
  const terms = registry.terms.filter(term => term.taxonomyId === taxonomyId)
  return { ...taxonomy, terms: buildTree(terms), usage: usageFor(registry, taxonomyId) }
}

export async function createTaxonomy(websiteValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  return mutateRegistry(websiteId, registry => {
    const taxonomy = normaliseTaxonomy(websiteId, input)
    if (registry.taxonomies.some(item => item.id === taxonomy.id)) throw new TaxonomyError('Taxonomy id already exists', 409)
    registry.taxonomies.push(taxonomy)
    return taxonomy
  })
}

export async function updateTaxonomy(websiteValue, taxonomyValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  return mutateRegistry(websiteId, registry => {
    const index = registry.taxonomies.findIndex(item => item.id === taxonomyId)
    if (index < 0) throw new TaxonomyError('Taxonomy not found', 404)
    const updated = normaliseTaxonomy(websiteId, input, registry.taxonomies[index])
    if (updated.allowedContentTypes.length) {
      const invalidAssignments = registry.assignments.filter(item => item.taxonomyId === taxonomyId && !updated.allowedContentTypes.includes(item.contentType))
      if (invalidAssignments.length) throw new TaxonomyError('Existing assignments use content types excluded by this update', 409, { assignments: invalidAssignments })
    }
    if (!updated.hierarchical && registry.terms.some(term => term.taxonomyId === taxonomyId && term.parentId)) {
      throw new TaxonomyError('Hierarchical terms must be flattened before disabling hierarchy', 409)
    }
    registry.taxonomies[index] = updated
    return updated
  })
}

export async function deleteTaxonomy(websiteValue, taxonomyValue, options = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  return mutateRegistry(websiteId, registry => {
    const taxonomy = taxonomyOrThrow(registry, taxonomyId)
    const terms = registry.terms.filter(term => term.taxonomyId === taxonomyId)
    const usage = usageFor(registry, taxonomyId)
    if ((terms.length || usage.count) && options.force !== true) throw new TaxonomyError('Taxonomy is still in use', 409, { termCount: terms.length, usage })
    registry.taxonomies = registry.taxonomies.filter(item => item.id !== taxonomyId)
    registry.terms = registry.terms.filter(item => item.taxonomyId !== taxonomyId)
    registry.assignments = registry.assignments.filter(item => item.taxonomyId !== taxonomyId)
    return { deleted: true, taxonomy, termCount: terms.length, usage }
  })
}

export async function listTerms(websiteValue, taxonomyValue, options = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  const registry = await readRegistry(websiteId)
  taxonomyOrThrow(registry, taxonomyId)
  const query = stringValue(options.query || options.q).toLowerCase()
  const terms = registry.terms.filter(term => term.taxonomyId === taxonomyId).filter(term => !query || [term.name, term.slug, term.description].some(value => String(value || '').toLowerCase().includes(query))).map(term => ({ ...term, usageCount: usageFor(registry, taxonomyId, term.id).count }))
  return options.tree === true || options.tree === 'true' ? buildTree(terms) : terms.sort((a, b) => a.name.localeCompare(b.name))
}

export async function createTerm(websiteValue, taxonomyValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  return mutateRegistry(websiteId, registry => {
    const taxonomy = taxonomyOrThrow(registry, taxonomyId)
    const term = normaliseTerm(websiteId, taxonomyId, input)
    if (registry.terms.some(item => item.taxonomyId === taxonomyId && item.id === term.id)) throw new TaxonomyError('Term id already exists', 409)
    validateParent(registry, taxonomy, term)
    ensureUniqueTerm(registry, term)
    registry.terms.push(term)
    return term
  })
}

export async function updateTerm(websiteValue, taxonomyValue, termValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  const termId = identity(termValue, 'Term id')
  return mutateRegistry(websiteId, registry => {
    const taxonomy = taxonomyOrThrow(registry, taxonomyId)
    const index = registry.terms.findIndex(item => item.taxonomyId === taxonomyId && item.id === termId)
    if (index < 0) throw new TaxonomyError('Taxonomy term not found', 404)
    const updated = normaliseTerm(websiteId, taxonomyId, input, registry.terms[index])
    validateParent(registry, taxonomy, updated)
    ensureUniqueTerm(registry, updated, termId)
    registry.terms[index] = updated
    return updated
  })
}

export async function getTermUsage(websiteValue, taxonomyValue, termValue) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  const termId = identity(termValue, 'Term id')
  const registry = await readRegistry(websiteId)
  taxonomyOrThrow(registry, taxonomyId)
  termOrThrow(registry, taxonomyId, termId)
  return usageFor(registry, taxonomyId, termId)
}

export async function assignTerm(websiteValue, taxonomyValue, termValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  const termId = identity(termValue, 'Term id')
  const contentType = stringValue(input.contentType)
  const recordId = stringValue(input.recordId)
  if (!contentType || !recordId) throw new TaxonomyError('Content type and record id are required', 422)
  await assertContentRecord(websiteId, contentType, recordId)
  return mutateRegistry(websiteId, registry => {
    const taxonomy = taxonomyOrThrow(registry, taxonomyId)
    termOrThrow(registry, taxonomyId, termId)
    if (taxonomy.allowedContentTypes.length && !taxonomy.allowedContentTypes.includes(contentType)) {
      throw new TaxonomyError('Taxonomy is not available for this content type', 422, { contentType })
    }
    const existing = registry.assignments.find(item => item.taxonomyId === taxonomyId && item.termId === termId && item.contentType === contentType && item.recordId === recordId)
    if (existing) return existing
    const assignment = { taxonomyId, termId, contentType, recordId, createdAt: new Date().toISOString() }
    registry.assignments.push(assignment)
    return assignment
  })
}

export async function unassignTerm(websiteValue, taxonomyValue, termValue, input = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  const termId = identity(termValue, 'Term id')
  const contentType = stringValue(input.contentType)
  const recordId = stringValue(input.recordId)
  return mutateRegistry(websiteId, registry => {
    taxonomyOrThrow(registry, taxonomyId)
    termOrThrow(registry, taxonomyId, termId)
    const before = registry.assignments.length
    registry.assignments = registry.assignments.filter(item => !(item.taxonomyId === taxonomyId && item.termId === termId && item.contentType === contentType && item.recordId === recordId))
    return { deleted: registry.assignments.length < before }
  })
}

export async function listRecordTerms(websiteValue, contentTypeValue, recordValue) {
  const websiteId = identity(websiteValue, 'Website id')
  const contentType = stringValue(contentTypeValue)
  const recordId = stringValue(recordValue)
  await assertContentRecord(websiteId, contentType, recordId)
  const registry = await readRegistry(websiteId)
  return registry.assignments.filter(item => item.contentType === contentType && item.recordId === recordId).map(assignment => ({
    ...assignment,
    taxonomy: registry.taxonomies.find(item => item.id === assignment.taxonomyId) || null,
    term: registry.terms.find(item => item.taxonomyId === assignment.taxonomyId && item.id === assignment.termId) || null,
  })).filter(item => item.taxonomy && item.term)
}

export async function mergeTerms(websiteValue, taxonomyValue, sourceValue, targetValue) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  const sourceId = identity(sourceValue, 'Source term id')
  const targetId = identity(targetValue, 'Target term id')
  if (sourceId === targetId) throw new TaxonomyError('Source and target terms must be different', 422)
  return mutateRegistry(websiteId, registry => {
    const taxonomy = taxonomyOrThrow(registry, taxonomyId)
    const source = termOrThrow(registry, taxonomyId, sourceId)
    const target = termOrThrow(registry, taxonomyId, targetId)
    registry.terms = registry.terms.map(term => term.taxonomyId === taxonomyId && term.parentId === sourceId ? { ...term, parentId: targetId, updatedAt: new Date().toISOString() } : term)
    const retained = registry.assignments.filter(item => item.taxonomyId === taxonomyId && item.termId !== sourceId)
    const moved = registry.assignments.filter(item => item.taxonomyId === taxonomyId && item.termId === sourceId).map(item => ({ ...item, termId: targetId }))
    const keys = new Set(retained.map(item => `${item.taxonomyId}:${item.termId}:${item.contentType}:${item.recordId}`))
    for (const assignment of moved) {
      const key = `${assignment.taxonomyId}:${assignment.termId}:${assignment.contentType}:${assignment.recordId}`
      if (!keys.has(key)) { retained.push(assignment); keys.add(key) }
    }
    registry.assignments = retained
    registry.terms = registry.terms.filter(term => !(term.taxonomyId === taxonomyId && term.id === sourceId))
    validateParent(registry, taxonomy, target)
    return { merged: true, source, target, usage: usageFor(registry, taxonomyId, targetId) }
  })
}

export async function deleteTerm(websiteValue, taxonomyValue, termValue, options = {}) {
  const websiteId = identity(websiteValue, 'Website id')
  const taxonomyId = identity(taxonomyValue, 'Taxonomy id')
  const termId = identity(termValue, 'Term id')
  if (options.mergeInto) return mergeTerms(websiteId, taxonomyId, termId, options.mergeInto)
  return mutateRegistry(websiteId, registry => {
    taxonomyOrThrow(registry, taxonomyId)
    const term = termOrThrow(registry, taxonomyId, termId)
    const children = registry.terms.filter(item => item.taxonomyId === taxonomyId && item.parentId === termId)
    const usage = usageFor(registry, taxonomyId, termId)
    if ((children.length || usage.count) && options.force !== true) throw new TaxonomyError('Taxonomy term is still in use', 409, { childCount: children.length, usage })
    registry.terms = registry.terms.filter(item => !(item.taxonomyId === taxonomyId && item.id === termId)).map(item => item.taxonomyId === taxonomyId && item.parentId === termId ? { ...item, parentId: null, updatedAt: new Date().toISOString() } : item)
    registry.assignments = registry.assignments.filter(item => !(item.taxonomyId === taxonomyId && item.termId === termId))
    return { deleted: true, term, childCount: children.length, usage }
  })
}
