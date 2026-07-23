import { useEffect, useMemo, useState } from 'react'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'

const BLOCK_TYPES = [
  ['richText', 'Rich Text'],
  ['image', 'Image'],
  ['quote', 'Quote'],
  ['callToAction', 'Call to Action'],
  ['faq', 'FAQ'],
]

const EMPTY_ARTICLE = {
  title: 'Untitled Article',
  slug: '',
  excerpt: '',
  content: '',
  blocks: [],
  featuredImage: '',
  category: 'Uncategorised',
  tags: [],
  author: 'KSJ Digital',
  locale: 'en-GB',
  status: 'Draft',
  scheduledAt: '',
  revisions: [],
  seo: { title: '', description: '', canonicalUrl: '', socialImage: '', robots: 'index,follow' },
}

function makeId(prefix = 'block') {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createBlock(type) {
  const base = { id: makeId(), type, order: 10 }
  if (type === 'image') return { ...base, url: '', alt: '', caption: '' }
  if (type === 'quote') return { ...base, quote: '', attribution: '' }
  if (type === 'callToAction') return { ...base, heading: '', text: '', buttonLabel: 'Learn more', buttonUrl: '' }
  if (type === 'faq') return { ...base, heading: 'Frequently Asked Questions', items: [] }
  return { ...base, heading: '', body: '' }
}

function normaliseDraft(article = EMPTY_ARTICLE) {
  const blocks = Array.isArray(article.blocks) && article.blocks.length
    ? article.blocks
    : article.content
      ? [{ ...createBlock('richText'), body: article.content }]
      : []
  return {
    ...EMPTY_ARTICLE,
    ...article,
    blocks: blocks.map((block, index) => ({ ...block, id: block.id || makeId(), order: (index + 1) * 10 })),
    revisions: Array.isArray(article.revisions) ? article.revisions : [],
    seo: { ...EMPTY_ARTICLE.seo, ...(article.seo || {}) },
  }
}

function formatDate(value) {
  if (!value) return 'Not published'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function blockLabel(type) {
  return BLOCK_TYPES.find(([value]) => value === type)?.[1] || type
}

function BlockEditor({ block, disabled, onChange, onMove, onDuplicate, onDelete }) {
  function field(name, value) {
    onChange({ ...block, [name]: value })
  }

  function addFaqItem() {
    field('items', [...(block.items || []), { id: makeId('faq'), question: '', answer: '' }])
  }

  function updateFaqItem(id, patch) {
    field('items', (block.items || []).map(item => item.id === id ? { ...item, ...patch } : item))
  }

  function deleteFaqItem(id) {
    field('items', (block.items || []).filter(item => item.id !== id))
  }

  return (
    <article className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
      <div className="panelHead">
        <div><strong>{blockLabel(block.type)}</strong><small> · reusable content block</small></div>
        {!disabled && <div>
          <button onClick={() => onMove(-1)} aria-label="Move block up">↑</button>
          <button onClick={() => onMove(1)} aria-label="Move block down">↓</button>
          <button onClick={onDuplicate}>Duplicate</button>
          <button onClick={onDelete}>Delete</button>
        </div>}
      </div>

      {block.type === 'richText' && <div className="formSettings">
        <label>Heading<input value={block.heading || ''} disabled={disabled} onChange={event => field('heading', event.target.value)} /></label>
        <label>Body<textarea rows="8" value={block.body || ''} disabled={disabled} onChange={event => field('body', event.target.value)} /></label>
      </div>}

      {block.type === 'image' && <div className="formSettings">
        <label>Image URL<input value={block.url || ''} disabled={disabled} onChange={event => field('url', event.target.value)} /></label>
        <label>Alt Text<input value={block.alt || ''} disabled={disabled} onChange={event => field('alt', event.target.value)} /></label>
        <label>Caption<input value={block.caption || ''} disabled={disabled} onChange={event => field('caption', event.target.value)} /></label>
      </div>}

      {block.type === 'quote' && <div className="formSettings">
        <label>Quote<textarea rows="5" value={block.quote || ''} disabled={disabled} onChange={event => field('quote', event.target.value)} /></label>
        <label>Attribution<input value={block.attribution || ''} disabled={disabled} onChange={event => field('attribution', event.target.value)} /></label>
      </div>}

      {block.type === 'callToAction' && <div className="formSettings">
        <label>Heading<input value={block.heading || ''} disabled={disabled} onChange={event => field('heading', event.target.value)} /></label>
        <label>Text<textarea value={block.text || ''} disabled={disabled} onChange={event => field('text', event.target.value)} /></label>
        <label>Button Label<input value={block.buttonLabel || ''} disabled={disabled} onChange={event => field('buttonLabel', event.target.value)} /></label>
        <label>Button URL<input value={block.buttonUrl || ''} disabled={disabled} onChange={event => field('buttonUrl', event.target.value)} /></label>
      </div>}

      {block.type === 'faq' && <div className="formSettings">
        <label>Section Heading<input value={block.heading || ''} disabled={disabled} onChange={event => field('heading', event.target.value)} /></label>
        {(block.items || []).map(item => <div className="card" key={item.id} style={{ padding: '0.8rem' }}>
          <label>Question<input value={item.question || ''} disabled={disabled} onChange={event => updateFaqItem(item.id, { question: event.target.value })} /></label>
          <label>Answer<textarea value={item.answer || ''} disabled={disabled} onChange={event => updateFaqItem(item.id, { answer: event.target.value })} /></label>
          {!disabled && <button onClick={() => deleteFaqItem(item.id)}>Remove Question</button>}
        </div>)}
        {!disabled && <button onClick={addFaqItem}>Add Question</button>}
      </div>}
    </article>
  )
}

export function CmsPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('')
  const website = account?.role === 'owner'
    ? websites.find(site => site.id === selectedWebsiteId) || websites[0] || null
    : assignedWebsite
  const websiteId = website?.id
  const canEdit = account?.role === 'owner' || account?.canEdit
  const [articles, setArticles] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState(EMPTY_ARTICLE)
  const [notice, setNotice] = useState('Loading articles')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [newBlockType, setNewBlockType] = useState('richText')

  const filtered = useMemo(() => articles.filter(article => {
    const matchesStatus = statusFilter === 'All' || article.status === statusFilter
    const haystack = `${article.title} ${article.category} ${(article.tags || []).join(' ')}`.toLowerCase()
    return matchesStatus && haystack.includes(query.trim().toLowerCase())
  }), [articles, query, statusFilter])

  const readiness = useMemo(() => {
    const checks = [
      ['Title', Boolean(draft.title?.trim())],
      ['Excerpt', Boolean(draft.excerpt?.trim())],
      ['Content blocks', Boolean(draft.blocks?.length)],
      ['SEO title', Boolean(draft.seo?.title?.trim())],
      ['Meta description', Boolean(draft.seo?.description?.trim())],
    ]
    return { checks, complete: checks.filter(([, valid]) => valid).length, total: checks.length }
  }, [draft])

  useEffect(() => {
    if (account?.role === 'owner' && !selectedWebsiteId && websites[0]?.id) setSelectedWebsiteId(websites[0].id)
  }, [account?.role, selectedWebsiteId, websites])

  useEffect(() => {
    if (!websiteId) return
    let cancelled = false
    setNotice('Loading articles')
    api.getArticles(websiteId).then(next => {
      if (cancelled) return
      setArticles(next)
      setSelectedId(next[0]?.id || '')
      setDraft(normaliseDraft(next[0]))
      setNotice(canEdit ? 'Ready' : 'Preview only')
    }).catch(error => {
      if (cancelled) return
      setArticles([])
      setSelectedId('')
      setDraft(EMPTY_ARTICLE)
      setNotice(error.message || 'CMS unavailable')
    })
    return () => { cancelled = true }
  }, [canEdit, websiteId])

  function selectArticle(article) {
    setSelectedId(article.id)
    setDraft(normaliseDraft(structuredClone(article)))
  }

  async function createArticle() {
    if (!websiteId || !canEdit) return
    setNotice('Creating article')
    try {
      const result = await api.createArticle(websiteId, EMPTY_ARTICLE)
      setArticles(result.articles)
      selectArticle(result.article)
      setNotice('Draft created')
    } catch (error) {
      setNotice(error.message || 'Create failed')
    }
  }

  async function saveArticle(overrides = {}) {
    if (!websiteId || !selectedId || !canEdit) return
    setNotice('Saving article')
    try {
      const payload = { ...draft, ...overrides, seo: { ...draft.seo, ...(overrides.seo || {}) } }
      const result = await api.updateArticle(websiteId, selectedId, payload)
      setArticles(result.articles)
      selectArticle(result.article)
      setNotice('Article saved')
    } catch (error) {
      setNotice(error.message || 'Save failed')
    }
  }

  async function restoreRevision(revisionId) {
    if (!websiteId || !selectedId || !canEdit) return
    setNotice('Restoring revision')
    try {
      const result = await api.restoreArticleRevision(websiteId, selectedId, revisionId)
      setArticles(result.articles)
      selectArticle(result.article)
      setNotice('Revision restored as draft')
    } catch (error) {
      setNotice(error.message || 'Restore failed')
    }
  }

  async function deleteArticle() {
    if (!websiteId || !selectedId || !canEdit) return
    setNotice('Deleting article')
    try {
      const next = await api.deleteArticle(websiteId, selectedId)
      setArticles(next)
      setSelectedId(next[0]?.id || '')
      setDraft(normaliseDraft(next[0]))
      setNotice('Article deleted')
    } catch (error) {
      setNotice(error.message || 'Delete failed')
    }
  }

  function updateBlock(id, nextBlock) {
    setDraft(current => ({ ...current, blocks: current.blocks.map(block => block.id === id ? nextBlock : block) }))
  }

  function addBlock() {
    const block = createBlock(newBlockType)
    setDraft(current => ({ ...current, blocks: [...current.blocks, { ...block, order: (current.blocks.length + 1) * 10 }] }))
  }

  function moveBlock(index, direction) {
    setDraft(current => {
      const target = index + direction
      if (target < 0 || target >= current.blocks.length) return current
      const blocks = [...current.blocks]
      ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
      return { ...current, blocks: blocks.map((block, blockIndex) => ({ ...block, order: (blockIndex + 1) * 10 })) }
    })
  }

  function duplicateBlock(index) {
    setDraft(current => {
      const blocks = [...current.blocks]
      blocks.splice(index + 1, 0, { ...structuredClone(blocks[index]), id: makeId() })
      return { ...current, blocks: blocks.map((block, blockIndex) => ({ ...block, order: (blockIndex + 1) * 10 })) }
    })
  }

  function deleteBlock(id) {
    setDraft(current => ({ ...current, blocks: current.blocks.filter(block => block.id !== id) }))
  }

  return (
    <Layout client={client} title="Content">
      <section className="moduleHero card">
        <div><span>CMS</span><h2>{website?.name || 'Assigned Website'} Content</h2><p>Build structured articles from reusable blocks with SEO, scheduling and recoverable revisions.</p></div>
        <button>{notice}</button>
      </section>

      {account?.role === 'owner' && websites.length > 1 && <section className="card formSettings">
        <label>Website<select value={websiteId || ''} onChange={event => setSelectedWebsiteId(event.target.value)}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      </section>}

      <section className="formsGrid">
        <aside className="card formList">
          <div className="panelHead"><h2>Articles</h2>{canEdit && <button onClick={createArticle}>Create</button>}</div>
          <label>Search<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search articles" /></label>
          <label>Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>All</option><option>Draft</option><option>Scheduled</option><option>Published</option><option>Archived</option></select></label>
          {filtered.map(article => <button className={article.id === selectedId ? 'active' : ''} key={article.id} onClick={() => selectArticle(article)}><b>{article.title}</b><small>{article.status} · {article.category} · {(article.blocks || []).length} blocks</small></button>)}
          {!filtered.length && <p className="emptyState">No matching articles.</p>}
        </aside>

        <section className="card formEditor">
          <div className="panelHead"><h2>{selectedId ? 'Article Editor' : 'No Article Selected'}</h2>{selectedId && canEdit && <button onClick={() => saveArticle()} disabled={!draft.title.trim()}>Save</button>}</div>
          {selectedId && <>
            <div className="formSettings">
              <label>Title<input value={draft.title} disabled={!canEdit} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
              <label>Slug<input value={draft.slug} disabled={!canEdit} onChange={event => setDraft({ ...draft, slug: event.target.value })} placeholder="generated-from-title" /></label>
              <label>Category<input value={draft.category} disabled={!canEdit} onChange={event => setDraft({ ...draft, category: event.target.value })} /></label>
              <label>Tags<input value={(draft.tags || []).join(', ')} disabled={!canEdit} onChange={event => setDraft({ ...draft, tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} placeholder="news, update" /></label>
              <label>Author<input value={draft.author} disabled={!canEdit} onChange={event => setDraft({ ...draft, author: event.target.value })} /></label>
              <label>Locale<input value={draft.locale || 'en-GB'} disabled={!canEdit} onChange={event => setDraft({ ...draft, locale: event.target.value })} /></label>
              <label>Status<select value={draft.status} disabled={!canEdit} onChange={event => setDraft({ ...draft, status: event.target.value })}><option>Draft</option><option>Scheduled</option><option>Published</option><option>Archived</option></select></label>
              {draft.status === 'Scheduled' && <label>Publish At<input type="datetime-local" value={draft.scheduledAt ? draft.scheduledAt.slice(0, 16) : ''} disabled={!canEdit} onChange={event => setDraft({ ...draft, scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : '' })} /></label>}
              <label>Featured Image URL<input value={draft.featuredImage} disabled={!canEdit} onChange={event => setDraft({ ...draft, featuredImage: event.target.value })} /></label>
              <label>Excerpt<textarea value={draft.excerpt} disabled={!canEdit} onChange={event => setDraft({ ...draft, excerpt: event.target.value })} /></label>
            </div>

            <div className="panelHead"><h2>Content Blocks</h2>{canEdit && <div><select value={newBlockType} onChange={event => setNewBlockType(event.target.value)}>{BLOCK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={addBlock}>Add Block</button></div>}</div>
            {!draft.blocks.length && <p className="emptyState">Add the first reusable content block.</p>}
            {draft.blocks.map((block, index) => <BlockEditor key={block.id} block={block} disabled={!canEdit} onChange={next => updateBlock(block.id, next)} onMove={direction => moveBlock(index, direction)} onDuplicate={() => duplicateBlock(index)} onDelete={() => deleteBlock(block.id)} />)}
            {canEdit && <div className="formDanger"><button onClick={deleteArticle}>Delete Article</button></div>}
          </>}
        </section>

        <aside className="card formPreview">
          <div className="panelHead"><h2>SEO & Publishing</h2></div>
          {selectedId && <>
            <label>SEO Title<input value={draft.seo?.title || ''} disabled={!canEdit} onChange={event => setDraft({ ...draft, seo: { ...draft.seo, title: event.target.value } })} /></label>
            <label>Meta Description<textarea value={draft.seo?.description || ''} disabled={!canEdit} onChange={event => setDraft({ ...draft, seo: { ...draft.seo, description: event.target.value } })} /></label>
            <label>Canonical URL<input value={draft.seo?.canonicalUrl || ''} disabled={!canEdit} onChange={event => setDraft({ ...draft, seo: { ...draft.seo, canonicalUrl: event.target.value } })} /></label>
            <label>Social Image<input value={draft.seo?.socialImage || ''} disabled={!canEdit} onChange={event => setDraft({ ...draft, seo: { ...draft.seo, socialImage: event.target.value } })} /></label>
            <label>Robots<select value={draft.seo?.robots || 'index,follow'} disabled={!canEdit} onChange={event => setDraft({ ...draft, seo: { ...draft.seo, robots: event.target.value } })}><option>index,follow</option><option>noindex,follow</option><option>noindex,nofollow</option></select></label>

            <div className="submissions"><h3>Publish Readiness</h3>{readiness.checks.map(([label, valid]) => <p key={label}><b>{valid ? '✓' : '○'} {label}</b><small>{valid ? 'Ready' : 'Missing'}</small></p>)}<p><b>Score</b><small>{readiness.complete}/{readiness.total}</small></p></div>
            <div className="submissions"><h3>Publishing Details</h3><p><b>Status</b><small>{draft.status}</small></p><p><b>Published</b><small>{formatDate(draft.publishedAt)}</small></p><p><b>Last Updated</b><small>{formatDate(draft.updatedAt)}</small></p></div>
            {canEdit && <button onClick={() => saveArticle({ status: draft.status === 'Published' ? 'Draft' : 'Published' })}>{draft.status === 'Published' ? 'Unpublish' : 'Publish Now'}</button>}

            <div className="submissions"><h3>Revision History</h3>{(draft.revisions || []).slice(0, 10).map(revision => <p key={revision.id}><span><b>{revision.title || 'Untitled'}</b><small>{formatDate(revision.createdAt)}</small></span>{canEdit && <button onClick={() => restoreRevision(revision.id)}>Restore</button>}</p>)}{!draft.revisions?.length && <p className="emptyState">Revisions appear after the first save.</p>}</div>
          </>}
        </aside>
      </section>
    </Layout>
  )
}
