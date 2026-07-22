import { useEffect, useMemo, useState } from 'react'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'

const EMPTY_ARTICLE = {
  title: 'Untitled Article',
  slug: '',
  excerpt: '',
  content: '',
  featuredImage: '',
  category: 'Uncategorised',
  tags: [],
  author: 'KSJ Digital',
  status: 'Draft',
  scheduledAt: '',
  seo: { title: '', description: '', canonicalUrl: '', socialImage: '' },
}

function formatDate(value) {
  if (!value) return 'Not published'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
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

  const filtered = useMemo(() => articles.filter(article => {
    const matchesStatus = statusFilter === 'All' || article.status === statusFilter
    const haystack = `${article.title} ${article.category} ${(article.tags || []).join(' ')}`.toLowerCase()
    return matchesStatus && haystack.includes(query.trim().toLowerCase())
  }), [articles, query, statusFilter])

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
      setDraft(next[0] || EMPTY_ARTICLE)
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
    setDraft(structuredClone(article))
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

  async function deleteArticle() {
    if (!websiteId || !selectedId || !canEdit) return
    setNotice('Deleting article')
    try {
      const next = await api.deleteArticle(websiteId, selectedId)
      setArticles(next)
      setSelectedId(next[0]?.id || '')
      setDraft(next[0] || EMPTY_ARTICLE)
      setNotice('Article deleted')
    } catch (error) {
      setNotice(error.message || 'Delete failed')
    }
  }

  return (
    <Layout client={client} title="Content">
      <section className="moduleHero card">
        <div>
          <span>CMS</span>
          <h2>{website?.name || 'Assigned Website'} Content</h2>
          <p>Create, schedule and publish articles with built-in SEO fields.</p>
        </div>
        <button>{notice}</button>
      </section>

      {account?.role === 'owner' && websites.length > 1 && (
        <section className="card formSettings">
          <label>Website<select value={websiteId || ''} onChange={event => setSelectedWebsiteId(event.target.value)}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        </section>
      )}

      <section className="formsGrid">
        <aside className="card formList">
          <div className="panelHead"><h2>Articles</h2>{canEdit && <button onClick={createArticle}>Create</button>}</div>
          <label>Search<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search articles" /></label>
          <label>Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>All</option><option>Draft</option><option>Scheduled</option><option>Published</option><option>Archived</option></select></label>
          {filtered.map(article => (
            <button className={article.id === selectedId ? 'active' : ''} key={article.id} onClick={() => selectArticle(article)}>
              <b>{article.title}</b>
              <small>{article.status} · {article.category}</small>
            </button>
          ))}
          {!filtered.length && <p className="emptyState">No matching articles.</p>}
        </aside>

        <section className="card formEditor">
          <div className="panelHead">
            <h2>{selectedId ? 'Article Editor' : 'No Article Selected'}</h2>
            {selectedId && canEdit && <button onClick={() => saveArticle()} disabled={!draft.title.trim()}>Save</button>}
          </div>
          {selectedId && <>
            <div className="formSettings">
              <label>Title<input value={draft.title} disabled={!canEdit} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
              <label>Slug<input value={draft.slug} disabled={!canEdit} onChange={event => setDraft({ ...draft, slug: event.target.value })} placeholder="generated-from-title" /></label>
              <label>Category<input value={draft.category} disabled={!canEdit} onChange={event => setDraft({ ...draft, category: event.target.value })} /></label>
              <label>Tags<input value={(draft.tags || []).join(', ')} disabled={!canEdit} onChange={event => setDraft({ ...draft, tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} placeholder="news, update" /></label>
              <label>Author<input value={draft.author} disabled={!canEdit} onChange={event => setDraft({ ...draft, author: event.target.value })} /></label>
              <label>Status<select value={draft.status} disabled={!canEdit} onChange={event => setDraft({ ...draft, status: event.target.value })}><option>Draft</option><option>Scheduled</option><option>Published</option><option>Archived</option></select></label>
              {draft.status === 'Scheduled' && <label>Publish At<input type="datetime-local" value={draft.scheduledAt ? draft.scheduledAt.slice(0, 16) : ''} disabled={!canEdit} onChange={event => setDraft({ ...draft, scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : '' })} /></label>}
              <label>Featured Image URL<input value={draft.featuredImage} disabled={!canEdit} onChange={event => setDraft({ ...draft, featuredImage: event.target.value })} /></label>
              <label>Excerpt<textarea value={draft.excerpt} disabled={!canEdit} onChange={event => setDraft({ ...draft, excerpt: event.target.value })} /></label>
              <label>Article Content<textarea value={draft.content} disabled={!canEdit} onChange={event => setDraft({ ...draft, content: event.target.value })} rows="14" /></label>
            </div>
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
            <div className="submissions">
              <h3>Publishing Details</h3>
              <p><b>Status</b><small>{draft.status}</small></p>
              <p><b>Published</b><small>{formatDate(draft.publishedAt)}</small></p>
              <p><b>Last Updated</b><small>{formatDate(draft.updatedAt)}</small></p>
            </div>
            {canEdit && <button onClick={() => saveArticle({ status: draft.status === 'Published' ? 'Draft' : 'Published' })}>{draft.status === 'Published' ? 'Unpublish' : 'Publish Now'}</button>}
          </>}
        </aside>
      </section>
    </Layout>
  )
}
