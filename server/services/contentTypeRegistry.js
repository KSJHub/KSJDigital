import crypto from 'node:crypto'
import { getFieldType, isRelationshipFieldType } from './fieldTypeRegistry.js'

const VALID_BLOCK_TYPES = new Set(['richText', 'image', 'quote', 'callToAction', 'faq'])
const VALID_RELATIONSHIP_DELETE_POLICIES = new Set(['restrict', 'nullify'])
const contentTypes = new Map()

function stringValue(value, fallback = '') {
  return String(value ?? fallback)
}

function normaliseBlock(block = {}, index = 0) {
  const type = VALID_BLOCK_TYPES.has(block.type) ? block.type : 'richText'
  const base = {
    id: stringValue(block.id) || crypto.randomUUID(),
    type,
    order: Number.isFinite(Number(block.order)) ? Number(block.order) : (index + 1) * 10,
  }

  if (type === 'image') return { ...base, url: stringValue(block.url), alt: stringValue(block.alt), caption: stringValue(block.caption) }
  if (type === 'quote') return { ...base, quote: stringValue(block.quote), attribution: stringValue(block.attribution) }
  if (type === 'callToAction') {
    return { ...base, heading: stringValue(block.heading), text: stringValue(block.text), buttonLabel: stringValue(block.buttonLabel, 'Learn more'), buttonUrl: stringValue(block.buttonUrl) }
  }
  if (type === 'faq') {
    const items = Array.isArray(block.items) ? block.items : []
    return {
      ...base,
      heading: stringValue(block.heading, 'Frequently Asked Questions'),
      items: items.slice(0, 50).map(item => ({ id: stringValue(item?.id) || crypto.randomUUID(), question: stringValue(item?.question), answer: stringValue(item?.answer) })),
    }
  }
  return { ...base, heading: stringValue(block.heading), body: stringValue(block.body ?? block.content) }
}

function normaliseBlocks(value, input = {}, existing = {}) {
  if (Array.isArray(value)) {
    return value.slice(0, 100).map(normaliseBlock).sort((left, right) => left.order - right.order).map((block, index) => ({ ...block, order: (index + 1) * 10 }))
  }
  const legacyContent = stringValue(input.content, existing.content)
  return legacyContent ? [normaliseBlock({ type: 'richText', body: legacyContent }, 0)] : []
}

function isEmpty(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function relationshipFieldDefinition(contentTypeId, field, type) {
  if (!isRelationshipFieldType(type.id)) return field
  const targetTypes = Array.isArray(field.targetTypes) ? [...new Set(field.targetTypes.map(value => stringValue(value).trim()).filter(Boolean))] : []
  if (!targetTypes.length) throw new Error(`Content type ${contentTypeId} relationship field ${field.id} requires targetTypes`)
  const onDelete = stringValue(field.onDelete, 'restrict').trim()
  if (!VALID_RELATIONSHIP_DELETE_POLICIES.has(onDelete)) throw new Error(`Content type ${contentTypeId} relationship field ${field.id} has an invalid onDelete policy`)
  return { ...field, targetTypes: Object.freeze(targetTypes), onDelete }
}

function workflowDefinition(contentTypeId, definition, fields) {
  if (!definition) return null
  const field = stringValue(definition.field, 'status').trim()
  if (!fields.some(item => item.id === field)) throw new Error(`Content type ${contentTypeId} workflow field ${field} is not registered`)
  const states = Array.isArray(definition.states) ? definition.states.map(state => Object.freeze({ id: stringValue(state?.id).trim(), label: stringValue(state?.label, state?.id).trim() })) : []
  if (!states.length || states.some(state => !state.id)) throw new Error(`Content type ${contentTypeId} workflow requires valid states`)
  const stateIds = new Set(states.map(state => state.id))
  const initialState = stringValue(definition.initialState, states[0].id).trim()
  if (!stateIds.has(initialState)) throw new Error(`Content type ${contentTypeId} workflow initial state is invalid`)
  const transitions = Array.isArray(definition.transitions) ? definition.transitions.map(transition => {
    const id = stringValue(transition?.id).trim()
    const from = Array.isArray(transition?.from) ? [...new Set(transition.from.map(value => stringValue(value).trim()).filter(Boolean))] : []
    const to = stringValue(transition?.to).trim()
    const roles = Array.isArray(transition?.roles) ? [...new Set(transition.roles.map(value => stringValue(value).trim()).filter(Boolean))] : []
    if (!id || !from.length || !to || from.some(state => !stateIds.has(state)) || !stateIds.has(to)) throw new Error(`Content type ${contentTypeId} has an invalid workflow transition`)
    return Object.freeze({ id, label: stringValue(transition.label, id), from: Object.freeze(from), to, roles: Object.freeze(roles) })
  }) : []
  return Object.freeze({ field, initialState, states: Object.freeze(states), transitions: Object.freeze(transitions) })
}

function searchDefinition(contentTypeId, definition, fields) {
  if (definition === false) return null
  const fieldIds = new Set(fields.map(field => field.id))
  const weightedFields = Array.isArray(definition?.fields) ? definition.fields.map(item => {
    const field = stringValue(item?.field).trim()
    const weight = Number(item?.weight)
    if (!fieldIds.has(field)) throw new Error(`Content type ${contentTypeId} search field ${field} is not registered`)
    return Object.freeze({ field, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 })
  }) : []
  const filterFields = Array.isArray(definition?.filters) ? [...new Set(definition.filters.map(value => stringValue(value).trim()).filter(Boolean))] : []
  if (filterFields.some(field => !fieldIds.has(field))) throw new Error(`Content type ${contentTypeId} search filter is not registered`)
  const titleField = stringValue(definition?.titleField, fields.find(field => field.id === 'title')?.id).trim()
  const summaryField = stringValue(definition?.summaryField, fields.find(field => field.id === 'excerpt')?.id).trim()
  return Object.freeze({
    titleField: fieldIds.has(titleField) ? titleField : null,
    summaryField: fieldIds.has(summaryField) ? summaryField : null,
    fields: Object.freeze(weightedFields),
    filters: Object.freeze(filterFields),
  })
}

export class ContentSchemaValidationError extends Error {
  constructor(errors) {
    super('Content record validation failed')
    this.name = 'ContentSchemaValidationError'
    this.status = 422
    this.errors = errors
  }
}

export function registerContentType(definition) {
  const id = stringValue(definition?.id).trim()
  if (!id) throw new Error('Content type id is required')
  if (contentTypes.has(id)) throw new Error(`Content type already registered: ${id}`)
  const fields = Array.isArray(definition.fields) ? definition.fields.map(field => {
    const fieldId = stringValue(field?.id).trim()
    const type = getFieldType(field?.type)
    if (!fieldId) throw new Error(`Content type ${id} has a field without an id`)
    if (!type) throw new Error(`Content type ${id} field ${fieldId} uses an unknown field type`)
    return Object.freeze(relationshipFieldDefinition(id, { ...field, id: fieldId, type: type.id }, type))
  }) : []
  const registered = Object.freeze({
    id,
    label: stringValue(definition.label, id),
    fields: Object.freeze(fields),
    workflow: workflowDefinition(id, definition.workflow, fields),
    search: searchDefinition(id, definition.search, fields),
    normalise: typeof definition.normalise === 'function' ? definition.normalise : null,
  })
  contentTypes.set(id, registered)
  return registered
}

export function getContentType(id) { return contentTypes.get(stringValue(id).trim()) || null }
export function listContentTypes() { return [...contentTypes.values()] }
export function getRelationshipFields(typeId) {
  const definition = getContentType(typeId)
  return definition ? definition.fields.filter(field => isRelationshipFieldType(field.type)) : []
}

export function describeContentType(id) {
  const definition = getContentType(id)
  if (!definition) return null
  return {
    id: definition.id,
    label: definition.label,
    fields: definition.fields.map(field => ({ ...field, targetTypes: field.targetTypes ? [...field.targetTypes] : undefined })),
    workflow: definition.workflow ? {
      field: definition.workflow.field,
      initialState: definition.workflow.initialState,
      states: definition.workflow.states.map(state => ({ ...state })),
      transitions: definition.workflow.transitions.map(transition => ({ ...transition, from: [...transition.from], roles: [...transition.roles] })),
    } : null,
    search: definition.search ? {
      titleField: definition.search.titleField,
      summaryField: definition.search.summaryField,
      fields: definition.search.fields.map(field => ({ ...field })),
      filters: [...definition.search.filters],
    } : null,
  }
}

export function listContentTypeDescriptions() { return listContentTypes().map(definition => describeContentType(definition.id)) }

export function normaliseContentFields(typeId, input = {}, existing = {}) {
  const definition = getContentType(typeId)
  if (!definition) throw new Error(`Unknown content type: ${typeId}`)
  const fields = {}
  for (const field of definition.fields) {
    const type = getFieldType(field.type)
    const supplied = input[field.id]
    const current = existing[field.id]
    const value = supplied === undefined ? current ?? field.default : supplied
    fields[field.id] = type.normalise(value, { input, existing, field })
  }
  return definition.normalise ? definition.normalise(fields, input, existing) : fields
}

export function validateContentFields(typeId, fields) {
  const definition = getContentType(typeId)
  if (!definition) throw new Error(`Unknown content type: ${typeId}`)
  const errors = definition.fields.filter(field => field.required && isEmpty(fields[field.id])).map(field => ({ field: field.id, code: 'required', message: `${field.label || field.id} is required` }))
  if (errors.length) throw new ContentSchemaValidationError(errors)
  return fields
}

registerContentType({
  id: 'article',
  label: 'Article',
  fields: [
    { id: 'title', label: 'Title', type: 'text', default: 'Untitled Article', required: true },
    { id: 'slug', label: 'Slug', type: 'text' },
    { id: 'excerpt', label: 'Excerpt', type: 'text' },
    { id: 'content', label: 'Legacy content', type: 'richText' },
    { id: 'blocks', label: 'Content', type: 'blocks' },
    { id: 'featuredImage', label: 'Featured image', type: 'image' },
    { id: 'category', label: 'Category', type: 'text', default: 'Uncategorised' },
    { id: 'tags', label: 'Tags', type: 'stringList' },
    { id: 'author', label: 'Author', type: 'text', default: 'KSJ Digital' },
    { id: 'locale', label: 'Locale', type: 'text', default: 'en-GB' },
    { id: 'status', label: 'Status', type: 'text', default: 'Draft' },
    { id: 'scheduledAt', label: 'Scheduled at', type: 'date' },
    { id: 'publishedAt', label: 'Published at', type: 'date' },
    { id: 'seo', label: 'SEO', type: 'object' },
    { id: 'relatedArticles', label: 'Related articles', type: 'references', targetTypes: ['article'], onDelete: 'restrict' },
  ],
  workflow: {
    field: 'status', initialState: 'Draft',
    states: [{ id: 'Draft', label: 'Draft' }, { id: 'In Review', label: 'In review' }, { id: 'Scheduled', label: 'Scheduled' }, { id: 'Published', label: 'Published' }, { id: 'Archived', label: 'Archived' }],
    transitions: [
      { id: 'submit', label: 'Submit for review', from: ['Draft'], to: 'In Review', roles: ['editor', 'approver', 'owner'] },
      { id: 'return', label: 'Return to draft', from: ['In Review'], to: 'Draft', roles: ['approver', 'owner'] },
      { id: 'approve', label: 'Approve and publish', from: ['In Review'], to: 'Published', roles: ['approver', 'owner'] },
      { id: 'schedule', label: 'Schedule publication', from: ['In Review'], to: 'Scheduled', roles: ['approver', 'owner'] },
      { id: 'publish-scheduled', label: 'Publish scheduled content', from: ['Scheduled'], to: 'Published', roles: ['owner'] },
      { id: 'archive', label: 'Archive', from: ['Published'], to: 'Archived', roles: ['approver', 'owner'] },
      { id: 'restore', label: 'Restore draft', from: ['Archived', 'Published', 'Scheduled'], to: 'Draft', roles: ['approver', 'owner'] },
    ],
  },
  search: {
    titleField: 'title',
    summaryField: 'excerpt',
    fields: [{ field: 'title', weight: 10 }, { field: 'slug', weight: 8 }, { field: 'excerpt', weight: 5 }, { field: 'category', weight: 4 }, { field: 'tags', weight: 4 }, { field: 'author', weight: 2 }, { field: 'blocks', weight: 1 }],
    filters: ['category', 'tags', 'author', 'locale', 'status'],
  },
  normalise(fields, input, existing) {
    const title = fields.title.trim() || 'Untitled Article'
    const slugSource = fields.slug || existing.slug || title
    const slug = slugSource.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/(^-|-$)/g, '').replace(/[._]+/g, '-') || 'untitled-article'
    return {
      ...fields,
      title,
      slug,
      blocks: normaliseBlocks(input.blocks ?? existing.blocks, input, existing),
      seo: {
        title: stringValue(fields.seo?.title), description: stringValue(fields.seo?.description), canonicalUrl: stringValue(fields.seo?.canonicalUrl), socialImage: stringValue(fields.seo?.socialImage), robots: stringValue(fields.seo?.robots, 'index,follow'),
      },
    }
  },
})