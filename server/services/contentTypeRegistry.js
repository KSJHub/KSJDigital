import crypto from 'node:crypto'
import { getFieldType } from './fieldTypeRegistry.js'

const VALID_STATUSES = new Set(['Draft', 'Scheduled', 'Published', 'Archived'])
const VALID_BLOCK_TYPES = new Set(['richText', 'image', 'quote', 'callToAction', 'faq'])
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

  if (type === 'image') {
    return { ...base, url: stringValue(block.url), alt: stringValue(block.alt), caption: stringValue(block.caption) }
  }
  if (type === 'quote') {
    return { ...base, quote: stringValue(block.quote), attribution: stringValue(block.attribution) }
  }
  if (type === 'callToAction') {
    return {
      ...base,
      heading: stringValue(block.heading),
      text: stringValue(block.text),
      buttonLabel: stringValue(block.buttonLabel, 'Learn more'),
      buttonUrl: stringValue(block.buttonUrl),
    }
  }
  if (type === 'faq') {
    const items = Array.isArray(block.items) ? block.items : []
    return {
      ...base,
      heading: stringValue(block.heading, 'Frequently Asked Questions'),
      items: items.slice(0, 50).map(item => ({
        id: stringValue(item?.id) || crypto.randomUUID(),
        question: stringValue(item?.question),
        answer: stringValue(item?.answer),
      })),
    }
  }

  return { ...base, heading: stringValue(block.heading), body: stringValue(block.body ?? block.content) }
}

function normaliseBlocks(value, input = {}, existing = {}) {
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map(normaliseBlock)
      .sort((left, right) => left.order - right.order)
      .map((block, index) => ({ ...block, order: (index + 1) * 10 }))
  }

  const legacyContent = stringValue(input.content, existing.content)
  return legacyContent ? [normaliseBlock({ type: 'richText', body: legacyContent }, 0)] : []
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
    return Object.freeze({ ...field, id: fieldId, type: type.id })
  }) : []

  const registered = Object.freeze({
    id,
    label: stringValue(definition.label, id),
    fields: Object.freeze(fields),
    normalise: typeof definition.normalise === 'function' ? definition.normalise : null,
  })
  contentTypes.set(id, registered)
  return registered
}

export function getContentType(id) {
  return contentTypes.get(stringValue(id).trim()) || null
}

export function listContentTypes() {
  return [...contentTypes.values()]
}

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

registerContentType({
  id: 'article',
  label: 'Article',
  fields: [
    { id: 'title', type: 'text', default: 'Untitled Article', required: true },
    { id: 'slug', type: 'text' },
    { id: 'excerpt', type: 'text' },
    { id: 'content', type: 'richText' },
    { id: 'blocks', type: 'blocks' },
    { id: 'featuredImage', type: 'image' },
    { id: 'category', type: 'text', default: 'Uncategorised' },
    { id: 'tags', type: 'stringList' },
    { id: 'author', type: 'text', default: 'KSJ Digital' },
    { id: 'locale', type: 'text', default: 'en-GB' },
    { id: 'status', type: 'text', default: 'Draft' },
    { id: 'scheduledAt', type: 'date' },
    { id: 'publishedAt', type: 'date' },
    { id: 'seo', type: 'object' },
  ],
  normalise(fields, input, existing) {
    const title = fields.title.trim() || 'Untitled Article'
    const slugSource = fields.slug || existing.slug || title
    const slug = slugSource.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/(^-|-$)/g, '').replace(/[._]+/g, '-') || 'untitled-article'
    const status = VALID_STATUSES.has(fields.status) ? fields.status : existing.status || 'Draft'
    const timestamp = new Date().toISOString()

    return {
      ...fields,
      title,
      slug,
      blocks: normaliseBlocks(input.blocks ?? existing.blocks, input, existing),
      status,
      scheduledAt: status === 'Scheduled' ? fields.scheduledAt : null,
      publishedAt: status === 'Published' ? fields.publishedAt || existing.publishedAt || timestamp : fields.publishedAt,
      seo: {
        title: stringValue(fields.seo?.title),
        description: stringValue(fields.seo?.description),
        canonicalUrl: stringValue(fields.seo?.canonicalUrl),
        socialImage: stringValue(fields.seo?.socialImage),
        robots: stringValue(fields.seo?.robots, 'index,follow'),
      },
    }
  },
})
