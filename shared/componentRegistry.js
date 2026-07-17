const FIELD_TYPES = new Set(['text', 'textarea', 'image', 'url', 'number', 'boolean', 'select', 'repeater'])
const RENDERER_KEY_PATTERN = /^[a-z][a-z0-9-]*$/
const PRESET_ID_PATTERN = /^[a-z][a-z0-9-]*$/

const registry = [
  {
    type: 'text',
    renderer: 'text',
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
    presets: [
      { id: 'standard', name: 'Standard Text', description: 'A simple left-aligned content section.', values: {} },
      { id: 'centred-intro', name: 'Centred Introduction', description: 'A centred opening statement for a page.', values: { eyebrow: 'Welcome', title: 'Introduce this page', align: 'centre' } },
    ],
  },
  {
    type: 'image',
    renderer: 'image',
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
    presets: [
      { id: 'wide', name: 'Wide Image', description: 'A wide image-led content section.', values: { layout: 'wide' } },
      { id: 'image-left', name: 'Image Left', description: 'Image beside supporting content.', values: { layout: 'left' } },
      { id: 'image-right', name: 'Image Right', description: 'Supporting content followed by an image.', values: { layout: 'right' } },
    ],
  },
  {
    type: 'cta',
    renderer: 'cta',
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
    presets: [
      { id: 'standard', name: 'Standard CTA', description: 'A clear left-aligned action section.', values: {} },
      { id: 'hero', name: 'Hero CTA', description: 'A centred high-impact call to action.', values: { eyebrow: 'Get Started', title: 'Ready to take the next step?', buttonLabel: 'Get Started', align: 'centre' } },
      { id: 'contact', name: 'Contact Banner', description: 'Direct visitors to your contact page.', values: { eyebrow: 'Talk To Us', title: 'Let’s start a conversation', buttonLabel: 'Contact Us', buttonUrl: '/contact', align: 'centre' } },
    ],
  },
  {
    type: 'gallery',
    renderer: 'gallery',
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
    presets: [
      { id: 'three-column', name: '3 Column Gallery', description: 'A balanced gallery for general image collections.', values: { columns: 3 } },
      { id: 'portfolio', name: 'Portfolio Gallery', description: 'A spacious two-column showcase.', values: { eyebrow: 'Portfolio', title: 'Selected Work', columns: 2 } },
      { id: 'compact', name: 'Compact Gallery', description: 'A dense four-column image grid.', values: { columns: 4 } },
    ],
  },
  {
    type: 'video',
    renderer: 'video',
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
    presets: [
      { id: 'featured', name: 'Featured Video', description: 'A prominent embedded video section.', values: {} },
      { id: 'latest', name: 'Latest Video', description: 'A section prepared for your newest upload.', values: { eyebrow: 'Latest', title: 'Watch our latest video' } },
    ],
  },
  {
    type: 'faq',
    renderer: 'faq',
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
    presets: [
      { id: 'standard', name: 'Standard FAQ', description: 'Four editable questions with the first answer open.', values: {} },
      { id: 'closed', name: 'Collapsed FAQ', description: 'All answers remain closed until selected.', values: { openFirst: false } },
    ],
  },
  {
    type: 'products',
    renderer: 'products',
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
    presets: [
      { id: 'featured', name: 'Featured Products', description: 'Show up to four featured products.', values: { limit: 4, featuredOnly: true } },
      { id: 'catalogue', name: 'Product Catalogue', description: 'Show a broader selection of available products.', values: { title: 'Shop All Products', limit: 8, featuredOnly: false } },
    ],
  },
]

const byType = new Map(registry.map(definition => [definition.type, definition]))

export const COMPONENT_FIELD_TYPES = Object.freeze([...FIELD_TYPES])
export const COMPONENT_REGISTRY = Object.freeze(registry.map(definition => Object.freeze(definition)))

export function componentDefinition(type) {
  return byType.get(String(type || '')) || null
}

export function componentRenderer(type) {
  return componentDefinition(type)?.renderer || null
}

export function componentPresets(type) {
  return componentDefinition(type)?.presets || []
}

export function componentLibrary(capabilities = []) {
  const enabled = new Set(Array.isArray(capabilities) ? capabilities : [])
  return COMPONENT_REGISTRY.filter(definition => !definition.capability || enabled.has(definition.capability))
}

export function createComponentBlock(type, { id, order = 0, presetId } = {}) {
  const definition = componentDefinition(type)
  if (!definition) throw new Error(`Unknown managed component type: ${type}`)
  const preset = presetId ? definition.presets?.find(candidate => candidate.id === presetId) : null
  if (presetId && !preset) throw new Error(`Unknown preset ${presetId} for managed component type: ${type}`)
  const generatedId = id || globalThis.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id: generatedId,
    type: definition.type,
    renderer: definition.renderer,
    order: Number(order) || 0,
    ...structuredClone(definition.defaults),
    ...(definition.createDefaults ? definition.createDefaults() : {}),
    ...(preset?.values ? structuredClone(preset.values) : {}),
  }
}

export function validateComponentRegistry() {
  const errors = []
  const types = new Set()
  for (const definition of COMPONENT_REGISTRY) {
    if (!definition.type || !/^[a-z][a-z0-9-]*$/.test(definition.type)) errors.push('Every component requires a valid type')
    if (types.has(definition.type)) errors.push(`Duplicate component type: ${definition.type}`)
    types.add(definition.type)
    if (!definition.renderer || !RENDERER_KEY_PATTERN.test(definition.renderer)) errors.push(`${definition.type} requires a valid renderer key`)
    if (!definition.title || !definition.description || !definition.category) errors.push(`${definition.type} is missing display metadata`)
    if (!Array.isArray(definition.fields)) errors.push(`${definition.type} fields must be an array`)
    const fieldKeys = new Set((definition.fields || []).map(field => field.key))
    for (const field of definition.fields || []) {
      if (!field.key || !field.label) errors.push(`${definition.type} has an invalid field`)
      if (!FIELD_TYPES.has(field.type)) errors.push(`${definition.type}.${field.key} uses unsupported field type ${field.type}`)
    }
    const presetIds = new Set()
    for (const preset of definition.presets || []) {
      if (!preset.id || !PRESET_ID_PATTERN.test(preset.id)) errors.push(`${definition.type} has an invalid preset id`)
      if (presetIds.has(preset.id)) errors.push(`${definition.type} has duplicate preset id ${preset.id}`)
      presetIds.add(preset.id)
      if (!preset.name || !preset.description) errors.push(`${definition.type}.${preset.id || 'preset'} is missing preset metadata`)
      if (!preset.values || typeof preset.values !== 'object' || Array.isArray(preset.values)) errors.push(`${definition.type}.${preset.id || 'preset'} values must be an object`)
      for (const key of Object.keys(preset.values || {})) {
        if (!fieldKeys.has(key)) errors.push(`${definition.type}.${preset.id} references unknown field ${key}`)
      }
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
      else if (!componentRenderer(block.type)) errors.push(`${path} has no registered renderer`)
      for (const field of definition?.fields || []) {
        if (field.required && !String(block[field.key] ?? '').trim()) errors.push(`${path}.${field.key} is required`)
      }
    })
  }
  return errors
}
