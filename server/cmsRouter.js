import crypto from 'node:crypto'
import express from 'express'
import { paths, readJson, safeName, writeJson } from './storage.js'

const VALID_STATUSES = new Set(['Draft', 'Scheduled', 'Published', 'Archived'])
const VALID_BLOCK_TYPES = new Set(['richText', 'image', 'quote', 'callToAction', 'faq'])
const MAX_REVISIONS = 30

function now() {
  return new Date().toISOString()
}

function slugFrom(value = '') {
  return safeName(value).replace(/[._]+/g, '-')
}

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
    return {
      ...base,
      url: stringValue(block.url),
      alt: stringValue(block.alt),
      caption: stringValue(block.caption),
    }
  }

  if (type === 'quote') {
    return {
      ...base,
      quote: stringValue(block.quote),
      attribution: stringValue(block.attribution),
    }
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

  return {
    ...base,
    heading: stringValue(block.heading),
    body: stringValue(block.body ?? block.content),
  }
}

function normaliseBlocks(blocks, legacyContent = '') {
  if (Array.isArray(blocks)) {
    return blocks
      .slice(0, 100)
      .map(normaliseBlock)
      .sort((left, right) => left.order - right.order)
      .map((block, index) => ({ ...block, order: (index + 1) * 10 }))
  }

  return legacyContent
    ? [normaliseBlock({ type: 'richText', body: legacyContent }, 0)]
    : []
}

function revisionSnapshot(article, timestamp) {
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    title: article.title,
    excerpt: article.excerpt,
    featuredImage: article.featuredImage,
    category: article.category,
    tags: article.tags,
    author: article.author,
    status: article.status,
    scheduledAt: article.scheduledAt,
    seo: article.seo,
    locale: article.locale,
    blocks: article.blocks,
  }
}

function normaliseArticle(article = {}, existing = {}) {
  const timestamp = now()
  const status = VALID_STATUSES.has(article.status) ? article.status : existing.status || 'Draft'
  const title = stringValue(article.title, existing.title || 'Untitled Article').trim() || 'Untitled Article'
  const slug = slugFrom(article.slug ?? existing.slug ?? title)
  const legacyContent = stringValue(article.content, existing.content)
  const blocks = normaliseBlocks(article.blocks ?? existing.blocks, legacyContent)
  const publishedAt = status === 'Published'
    ? article.publishedAt || existing.publishedAt || timestamp
    : article.publishedAt ?? existing.publishedAt ?? null

  const result = {
    id: existing.id || article.id || crypto.randomUUID(),
    title,
    slug,
    excerpt: stringValue(article.excerpt, existing.excerpt),
    content: legacyContent,
    blocks,
    featuredImage: stringValue(article.featuredImage, existing.featuredImage),
    category: stringValue(article.category, existing.category || 'Uncategorised'),
    tags: Array.isArray(article.tags)
      ? article.tags.map(tag => stringValue(tag).trim()).filter(Boolean)
      : existing.tags || [],
    author: stringValue(article.author, existing.author || 'KSJ Digital'),
    locale: stringValue(article.locale, existing.locale || 'en-GB'),
    status,
    scheduledAt: status === 'Scheduled' ? article.scheduledAt ?? existing.scheduledAt ?? null : null,
    publishedAt,
    seo: {
      title: stringValue(article.seo?.title, existing.seo?.title),
      description: stringValue(article.seo?.description, existing.seo?.description),
      canonicalUrl: stringValue(article.seo?.canonicalUrl, existing.seo?.canonicalUrl),
      socialImage: stringValue(article.seo?.socialImage, existing.seo?.socialImage),
      robots: stringValue(article.seo?.robots, existing.seo?.robots || 'index,follow'),
    },
    createdAt: existing.createdAt || article.createdAt || timestamp,
    updatedAt: timestamp,
  }

  const previousRevisions = Array.isArray(existing.revisions) ? existing.revisions : []
  result.revisions = existing.id
    ? [revisionSnapshot(existing, timestamp), ...previousRevisions].slice(0, MAX_REVISIONS)
    : []

  return result
}

async function getArticles(websiteId) {
  return readJson(paths.articles(websiteId), [])
}

function requireEdit(req, res) {
  if (req.session?.role === 'owner' || req.session?.canEdit) return true
  res.status(403).json({ error: 'Edit permission required' })
  return false
}

export function createCmsRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    const articles = await getArticles(req.params.websiteId)
    res.json(articles.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0)))
  })

  router.post('/:websiteId', async (req, res) => {
    if (!requireEdit(req, res)) return
    const articles = await getArticles(req.params.websiteId)
    const article = normaliseArticle(req.body || {})
    const next = [article, ...articles]
    await writeJson(paths.articles(req.params.websiteId), next)
    res.status(201).json({ article, articles: next })
  })

  router.patch('/:websiteId/:articleId', async (req, res) => {
    if (!requireEdit(req, res)) return
    const articles = await getArticles(req.params.websiteId)
    const index = articles.findIndex(article => article.id === req.params.articleId)
    if (index < 0) return res.status(404).json({ error: 'Article not found' })

    const updated = normaliseArticle(req.body || {}, articles[index])
    const next = articles.map((article, articleIndex) => articleIndex === index ? updated : article)
    await writeJson(paths.articles(req.params.websiteId), next)
    res.json({ article: updated, articles: next })
  })

  router.post('/:websiteId/:articleId/restore/:revisionId', async (req, res) => {
    if (!requireEdit(req, res)) return
    const articles = await getArticles(req.params.websiteId)
    const index = articles.findIndex(article => article.id === req.params.articleId)
    if (index < 0) return res.status(404).json({ error: 'Article not found' })

    const existing = articles[index]
    const revision = (existing.revisions || []).find(item => item.id === req.params.revisionId)
    if (!revision) return res.status(404).json({ error: 'Revision not found' })

    const updated = normaliseArticle({ ...revision, status: 'Draft' }, existing)
    const next = articles.map((article, articleIndex) => articleIndex === index ? updated : article)
    await writeJson(paths.articles(req.params.websiteId), next)
    res.json({ article: updated, articles: next })
  })

  router.delete('/:websiteId/:articleId', async (req, res) => {
    if (!requireEdit(req, res)) return
    const articles = await getArticles(req.params.websiteId)
    if (!articles.some(article => article.id === req.params.articleId)) {
      return res.status(404).json({ error: 'Article not found' })
    }
    const next = articles.filter(article => article.id !== req.params.articleId)
    await writeJson(paths.articles(req.params.websiteId), next)
    res.json(next)
  })

  return router
}
