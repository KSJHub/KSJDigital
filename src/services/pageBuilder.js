const PAGE_KEY = 'ksjDigitalPageBuilder'

const starterPages = [
  { id: 'home', title: 'Homepage', slug: '/', status: 'Published', locked: true, order: 1, blocks: [{ id: 'hero-1', type: 'Hero', title: 'Welcome to TwoToneTaj', text: 'Average gamer. Community builder. Professional scoreboard victim.', button: 'Join The Squad' }] },
  { id: 'about', title: 'About', slug: '/about', status: 'Published', locked: false, order: 2, blocks: [{ id: 'text-1', type: 'Text', title: 'About', text: 'Tell your story here.' }] },
  { id: 'community', title: 'Community', slug: '/community', status: 'Published', locked: false, order: 3, blocks: [{ id: 'text-2', type: 'Text', title: 'Community', text: 'Community information and links.' }] },
  { id: 'merch', title: 'Merch', slug: '/merch', status: 'Draft', locked: false, order: 4, blocks: [{ id: 'text-3', type: 'Text', title: 'Merch', text: 'Coming soon.' }] },
]

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback } catch { return fallback }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  return value
}

function key(websiteId = 'twotonetaj') {
  return `${PAGE_KEY}:${websiteId}`
}

export function slugify(title = '') {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return slug ? `/${slug}` : '/new-page'
}

export function getPages(websiteId) {
  return read(key(websiteId), starterPages).sort((a, b) => a.order - b.order)
}

export function savePages(websiteId, pages) {
  return write(key(websiteId), pages.map((page, index) => ({ ...page, order: index + 1 })))
}

export function createPage(websiteId, title = 'New Page') {
  const pages = getPages(websiteId)
  const id = `${slugify(title).replace('/', '') || 'new-page'}-${Date.now()}`
  const page = { id, title, slug: slugify(title), status: 'Draft', locked: false, order: pages.length + 1, blocks: [{ id: `hero-${Date.now()}`, type: 'Hero', title, text: 'Start writing your page content.', button: 'Learn More' }] }
  savePages(websiteId, [...pages, page])
  return page
}

export function updatePage(websiteId, pageId, changes) {
  const pages = getPages(websiteId).map(page => page.id === pageId ? { ...page, ...changes, slug: changes.title && page.slug !== '/' ? slugify(changes.title) : page.slug } : page)
  return savePages(websiteId, pages)
}

export function deletePage(websiteId, pageId) {
  const page = getPages(websiteId).find(item => item.id === pageId)
  if (page?.locked) return getPages(websiteId)
  return savePages(websiteId, getPages(websiteId).filter(item => item.id !== pageId))
}

export function duplicatePage(websiteId, pageId) {
  const pages = getPages(websiteId)
  const page = pages.find(item => item.id === pageId)
  if (!page) return null
  const copy = { ...page, id: `${page.id}-copy-${Date.now()}`, title: `${page.title} Copy`, slug: slugify(`${page.title} Copy`), status: 'Draft', locked: false, order: pages.length + 1 }
  savePages(websiteId, [...pages, copy])
  return copy
}

export function movePage(websiteId, pageId, direction) {
  const pages = getPages(websiteId)
  const index = pages.findIndex(page => page.id === pageId)
  const nextIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || nextIndex < 0 || nextIndex >= pages.length) return pages
  const next = [...pages]
  const [page] = next.splice(index, 1)
  next.splice(nextIndex, 0, page)
  return savePages(websiteId, next)
}

export function addBlock(websiteId, pageId, type = 'Text') {
  const block = { id: `${type.toLowerCase()}-${Date.now()}`, type, title: type, text: 'New content block.', button: type === 'Button' ? 'Click Here' : '' }
  const pages = getPages(websiteId).map(page => page.id === pageId ? { ...page, blocks: [...(page.blocks || []), block] } : page)
  savePages(websiteId, pages)
  return block
}

export function updateBlock(websiteId, pageId, blockId, changes) {
  const pages = getPages(websiteId).map(page => page.id === pageId ? { ...page, blocks: (page.blocks || []).map(block => block.id === blockId ? { ...block, ...changes } : block) } : page)
  return savePages(websiteId, pages)
}

export function deleteBlock(websiteId, pageId, blockId) {
  const pages = getPages(websiteId).map(page => page.id === pageId ? { ...page, blocks: (page.blocks || []).filter(block => block.id !== blockId) } : page)
  return savePages(websiteId, pages)
}
