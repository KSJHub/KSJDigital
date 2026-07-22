import crypto from 'node:crypto'
import express from 'express'
import { paths, readJson, safeName, writeJson } from './storage.js'

const VALID_STATUSES = new Set(['Draft', 'Scheduled', 'Published', 'Archived'])

function now() {
  return new Date().toISOString()
}

function slugFrom(value = '') {
  return safeName(value).replace(/[._]+/g, '-')
}

function normaliseArticle(article = {}, existing = {}) {
  const timestamp = now()
  const status = VALID_STATUSES.has(article.status) ? article.status : existing.status || 'Draft'
  const title = String(article.title ?? existing.title ?? 'Untitled Article').trim() || 'Untitled Article'
  const slug = slugFrom(article.slug ?? existing.slug ?? title)
  const publishedAt = status === 'Published'
    ? article.publishedAt || existing.publishedAt || timestamp
    : article.publishedAt ?? existing.publishedAt ?? null

  return {
    id: existing.id || article.id || crypto.randomUUID(),
    title,
    slug,
    excerpt: String(article.excerpt ?? existing.excerpt ?? ''),
    content: String(article.content ?? existing.content ?? ''),
    featuredImage: String(article.featuredImage ?? existing.featuredImage ?? ''),
    category: String(article.category ?? existing.category ?? 'Uncategorised'),
    tags: Array.isArray(article.tags)
      ? article.tags.map(tag => String(tag).trim()).filter(Boolean)
      : existing.tags || [],
    author: String(article.author ?? existing.author ?? 'KSJ Digital'),
    status,
    scheduledAt: status === 'Scheduled' ? article.scheduledAt ?? existing.scheduledAt ?? null : null,
    publishedAt,
    seo: {
      title: String(article.seo?.title ?? existing.seo?.title ?? ''),
      description: String(article.seo?.description ?? existing.seo?.description ?? ''),
      canonicalUrl: String(article.seo?.canonicalUrl ?? existing.seo?.canonicalUrl ?? ''),
      socialImage: String(article.seo?.socialImage ?? existing.seo?.socialImage ?? ''),
    },
    createdAt: existing.createdAt || article.createdAt || timestamp,
    updatedAt: timestamp,
  }
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
