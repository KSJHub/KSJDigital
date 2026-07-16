const FIELD_TYPES = new Set(['text', 'textarea', 'image', 'url', 'number', 'boolean', 'select', 'repeater'])

const registry = [
  {
    type: 'text',
    icon: '¶',
    title: 'Text Section',
    category: 'Content',
    description: 'Eyebrow, heading and editable paragraph.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Heading', type: 'text', required: true },
      { key: 'text', label: 'Content', type: 'textarea' },
      { key: 'align', label: 'Alignment', type: 'select', options: ['left', 'centre', 'right'] },
    ],
    defaults: { eyebrow: 'New Section', title: 'New text section', text: 'Click here and start typing.', align: 'left' },
  },
  {
    type: 'image',
    icon: '🖼',
    title: 'Image Section',
    category: 'Media',
    description: 'Managed image with title and supporting text.',
    fields: [
      { key: 'title', label: 'Heading', type: 'text', required: true },
      { key: 'text', label: 'Supporting text', type: 'textarea' },
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Alternative text', type: 'text' },
      { key: 'layout', label: 'Layout', type: 'select', options: ['wide', 'left', 'right'] },
    ],
    defaults: { title: 'Image Section', text: 'Add supporting text for this image.', image: '', alt: '', layout: 'wide' },
  },
  {
    type: 'cta',
    icon: '↗',
    title: 'Call To Action',
    category: 'Engagement',
    description: 'Prominent message with a visitor action button.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Heading', type: 'text', required: true },
      { key: 'text', label: 'Message', type: 'textarea' },
      { key: 'buttonLabel', label: 'Button text', type: 'text' },
      { key: 'buttonUrl', label: 'Button destination', type: 'url' },
      { key: 'newTab', label: 'Open in a new tab', type: 'boolean' },
      { key: 'align', label: 'Alignment', type: 'select', options: ['left', 'centre', 'right'] },
    ],
    defaults: { eyebrow: 'Next Step', title: 'Ready to get involved?', text: 'Add a clear reason for visitors to take action.', buttonLabel: 'Learn More', buttonUrl: '#', newTab: false, align: 'left' },
  },
  {
    type: 'gallery',
    icon: '▦',
    title: 'Gallery',
    category: 'Media',
    description: 'Responsive image gallery with editable captions.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Heading', type: 'text', required: true },
      { key: 'text', label: 'Supporting text', type: 'textarea' },
      { key: 'columns', label: 'Columns', type: 'number', minimum: 1, maximum: 4 },
      { key: 'images', label: 'Images', type: 'repeater', itemFields: ['src', 'alt', 'caption'] },
    ],
    defaults: { eyebrow: 'Gallery', title: 'Latest Images', text: 'Add and arrange images from the live editor.', columns: 3, images: [] },
    createDefaults: () => ({ images: Array.from({ length: 4 }, (_, index) => ({ src: '', alt: '', caption: `Image ${index + 1}` })) }),
  },
  {
    type: 'video',
    icon: '▶',
    title: 'Video',
    category: 'Media',
    description: 'Responsive YouTube or Vimeo feature section.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Heading', type: 'text', required: true },
      { key: 'text', label: 'Supporting text', type: 'textarea' },
      { key: 'videoUrl', label: 'Video URL', type: 'url' },
    ],
    defaults: { eyebrow: 'Watch', title: 'Featured Video', text: 'Add a YouTube or Vimeo video.', videoUrl: '' },
  },
  {
    type: 'faq',
    icon: '?',
    title: 'FAQ',
    category: 'Content',
    description: 'Expandable questions and answers.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Heading', type: 'text', required: true },
      { key: 'text', label: 'Supporting text', type: 'textarea' },
      { key: 'openFirst', label: 'Open first answer', type: 'boolean' },
      { key: 'items', label: 'Questions', type: 'repeater', itemFields: ['question', 'answer'] },
    ],
    defaults: { eyebrow: 'Help', title: 'Frequently Asked Questions', text: 'Answer the questions visitors ask most often.', openFirst: true, items: [] },
    createDefaults: () => ({ items: Array.from({ length: 4 }, (_, index) => ({ question: `Question ${index + 1}`, answer: 'Add the answer here.' })) }),
  },
  {
    type: 'products',
    icon: '🛍',
    title: 'Product Grid',
    category: 'Commerce',
    capability: 'commerce',
    description: 'Displays managed products from this website.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Heading', type: 'text', required: true },
      { key: 'text', label: 'Supporting text', type: 'textarea' },
      { key: 'limit', label: 'Products shown', type: 'number', minimum: 1, maximum: 24 },
      { key: 'featuredOnly', label: 'Featured products only', type: 'boolean' },
    ],
    defaults: { eyebrow: 'Shop', title: 'Featured Products', text: 'Explore products available from this website.', limit: 4, featuredOnly: false },
  },
]

const byType = new Map(registry.map(definition => [definition.type, definition]))

export const COMPONENT_FIELD_TYPES = Object.freeze([...FIELD_TYPES])
export const COMPONENT_REGISTRY = Object.freeze(registry.map(definition => Object.freeze(definition)))

export function componentDefinition(type) {
  return byType.get(String(type || '')) || null
}

export function componentLibrary(capabilities = []) {
  const enabled = new Set(Array.isArray(capabilities) ? capabilities : [])
  return COMPONENT_REGISTRY.filter(definition => !definition.capability || enabled.has(definition.capability))
}

export function createComponentBlock(type, { id, order = 0 } = {}) {
  const definition = componentDefinition(type)
  if (!definition) throw new Error(`Unknown managed component type: ${type}`)
  const generatedId = id || globalThis.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id: generatedId,
    type: definition.type,
    order: Number(order) || 0,
    ...structuredClone(definition.defaults),
    ...(definition.createDefaults ? definition.createDefaults() : {}),
  }
}

export function validateComponentRegistry() {
  const errors = []
  const types = new Set()
  for (const definition of COMPONENT_REGISTRY) {
    if (!definition.type || !/^[a-z][a-z0-9-]*$/.test(definition.type)) errors.push('Every component requires a valid type')
    if (types.has(definition.type)) errors.push(`Duplicate component type: ${definition.type}`)
    types.add(definition.type)
    if (!definition.title || !definition.description || !definition.category) errors.push(`${definition.type} is missing display metadata`)
    if (!Array.isArray(definition.fields)) errors.push(`${definition.type} fields must be an array`)
    for (const field of definition.fields || []) {
      if (!field.key || !field.label) errors.push(`${definition.type} has an invalid field`)
      if (!FIELD_TYPES.has(field.type)) errors.push(`${definition.type}.${field.key} uses unsupported field type ${field.type}`)
    }
  }
  return errors
}

export function validateManagedPageBlocks(content = {}) {
  const pageBlocks = content?.engine?.pageBlocks
  if (pageBlocks == null) return []
  if (!pageBlocks || typeof pageBlocks !== 'object' || Array.isArray(pageBlocks)) return ['engine.pageBlocks must be an object']

  const errors = []
  for (const [page, blocks] of Object.entries(pageBlocks)) {
    if (!Array.isArray(blocks)) {
      errors.push(`engine.pageBlocks.${page} must be an array`)
      continue
    }
    const ids = new Set()
    blocks.forEach((block, index) => {
      const path = `engine.pageBlocks.${page}[${index}]`
      if (!block || typeof block !== 'object' || Array.isArray(block)) return errors.push(`${path} must be an object`)
      if (!block.id) errors.push(`${path} requires an id`)
      else if (ids.has(block.id)) errors.push(`${path} duplicates component id ${block.id}`)
      else ids.add(block.id)
      const definition = componentDefinition(block.type)
      if (!definition) errors.push(`${path} uses unregistered component type ${block.type || '(missing)'}`)
      for (const field of definition?.fields || []) {
        if (field.required && !String(block[field.key] ?? '').trim()) errors.push(`${path}.${field.key} is required`)
      }
    })
  }
  return errors
}
