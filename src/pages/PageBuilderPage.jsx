import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

const blockTypes = ['Hero', 'Text', 'Image', 'Gallery', 'Button', 'Divider', 'FAQ', 'Embed', 'Discord', 'YouTube', 'Twitch']

function slugify(title = '') {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return slug ? `/${slug}` : '/new-page'
}

function orderPages(pages = []) {
  return [...pages].sort((a, b) => a.order - b.order).map((page, index) => ({ ...page, order: index + 1 }))
}

function newStarterPage() {
  return {
    id: 'home',
    title: 'Homepage',
    slug: '/',
    status: 'Published',
    locked: true,
    order: 1,
    blocks: [
      {
        id: 'hero-1',
        type: 'Hero',
        title: 'Homepage Hero',
        text: 'Start editing this managed website from KSJ Digital.',
        button: 'Learn More',
      },
    ],
  }
}

function PreviewBlock({ block }) {
  if (block.type === 'Divider') return <hr />
  if (block.type === 'Button') return <button>{block.button || block.title}</button>
  if (['Image', 'Gallery'].includes(block.type)) return <div className="builderImageMock">{block.type}</div>
  if (['Embed', 'Discord', 'YouTube', 'Twitch'].includes(block.type)) return <div className="builderEmbedMock">{block.type} block</div>
  return <section><span>{block.type}</span><h3>{block.title}</h3><p>{block.text}</p>{block.button && <button>{block.button}</button>}</section>
}

export function PageBuilderPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const websiteId = website?.id
  const canEdit = account?.role === 'owner' || account?.canEdit
  const [content, setContent] = useState({ pages: [] })
  const [selectedId, setSelectedId] = useState('')
  const [device, setDevice] = useState('Desktop')
  const [notice, setNotice] = useState('Loading')
  const pages = orderPages(content.pages || [])
  const selected = pages.find(page => page.id === selectedId) || pages[0]

  useEffect(() => {
    if (!websiteId) {
      setContent({ pages: [] })
      setSelectedId('')
      setNotice('Waiting for assigned website')
      return
    }

    let cancelled = false

    async function loadContent() {
      try {
        const data = await api.getContent(websiteId)
        if (cancelled) return
        const nextPages = data.pages?.length ? data.pages : [newStarterPage()]
        const next = { ...data, pages: orderPages(nextPages) }
        setContent(next)
        setSelectedId(next.pages[0]?.id || '')
        setNotice(canEdit ? 'Ready' : 'Preview only')
      } catch (error) {
        if (!cancelled) setNotice(error.message)
      }
    }

    loadContent()

    return () => {
      cancelled = true
    }
  }, [canEdit, websiteId])

  async function saveContent(nextContent, nextSelectedId = selectedId, message = 'Saved') {
    if (!websiteId) {
      setNotice('No website assigned')
      return
    }

    if (!canEdit) {
      setNotice('Edit permission required')
      return
    }

    const ordered = { ...nextContent, pages: orderPages(nextContent.pages || []) }
    setContent(ordered)
    setSelectedId(nextSelectedId || ordered.pages[0]?.id || '')
    setNotice('Saving')

    try {
      const saved = await api.saveContent(websiteId, ordered)
      setContent({ ...ordered, updatedAt: saved.updatedAt })
      setNotice(message)
    } catch (error) {
      setNotice(error.message)
    }
  }

  function updateSelected(changes) {
    if (!selected || !canEdit) return

    const nextPages = pages.map(page =>
      page.id === selected.id
        ? {
            ...page,
            ...changes,
            slug: changes.title && page.slug !== '/' ? slugify(changes.title) : page.slug,
          }
        : page,
    )
    saveContent({ ...content, pages: nextPages }, selected.id, 'Page updated')
  }

  function addPage() {
    if (!canEdit) return
    const page = {
      id: `new-page-${Date.now()}`,
      title: 'New Page',
      slug: '/new-page',
      status: 'Draft',
      locked: false,
      order: pages.length + 1,
      blocks: [
        {
          id: `hero-${Date.now()}`,
          type: 'Hero',
          title: 'New Page',
          text: 'Start writing your page content.',
          button: 'Learn More',
        },
      ],
    }
    saveContent({ ...content, pages: [...pages, page] }, page.id, 'Page created')
  }

  function duplicateSelected() {
    if (!selected || !canEdit) return

    const page = {
      ...selected,
      id: `${selected.id}-copy-${Date.now()}`,
      title: `${selected.title} Copy`,
      slug: slugify(`${selected.title} Copy`),
      status: 'Draft',
      locked: false,
      order: pages.length + 1,
    }
    saveContent({ ...content, pages: [...pages, page] }, page.id, 'Page duplicated')
  }

  function removeSelected() {
    if (!selected || !canEdit) return
    if (selected.locked) return setNotice('Homepage is protected')
    const nextPages = pages.filter(page => page.id !== selected.id)
    saveContent({ ...content, pages: nextPages }, nextPages[0]?.id, 'Page deleted')
  }

  function movePage(pageId, direction) {
    if (!canEdit) return
    const index = pages.findIndex(page => page.id === pageId)
    const nextIndex = direction === 'up' ? index - 1 : index + 1

    if (index < 0 || nextIndex < 0 || nextIndex >= pages.length) return

    const nextPages = [...pages]
    const [page] = nextPages.splice(index, 1)
    nextPages.splice(nextIndex, 0, page)
    saveContent({ ...content, pages: nextPages }, pageId, 'Page moved')
  }

  function addNewBlock(type) {
    if (!selected || !canEdit) return

    const block = {
      id: `${type.toLowerCase()}-${Date.now()}`,
      type,
      title: type,
      text: 'New content block.',
      button: type === 'Button' ? 'Click Here' : '',
    }
    const nextPages = pages.map(page =>
      page.id === selected.id ? { ...page, blocks: [...(page.blocks || []), block] } : page,
    )
    saveContent({ ...content, pages: nextPages }, selected.id, `${type} block added`)
  }

  function editBlock(blockId, changes) {
    if (!selected || !canEdit) return

    const nextPages = pages.map(page =>
      page.id === selected.id
        ? {
            ...page,
            blocks: (page.blocks || []).map(block =>
              block.id === blockId ? { ...block, ...changes } : block,
            ),
          }
        : page,
    )
    saveContent({ ...content, pages: nextPages }, selected.id, 'Block updated')
  }

  function removeBlock(blockId) {
    if (!selected || !canEdit) return

    const nextPages = pages.map(page =>
      page.id === selected.id
        ? { ...page, blocks: (page.blocks || []).filter(block => block.id !== blockId) }
        : page,
    )
    saveContent({ ...content, pages: nextPages }, selected.id, 'Block removed')
  }

  return (
    <Layout client={client} title="Pages">
      <section className="moduleHero card">
        <div>
          <span>Website Builder</span>
          <h2>{website?.name || 'Assigned Website'} Pages</h2>
          <p>Create, organise and edit pages using safe content blocks. Changes save into KSJ Digital and can be used by the live client website.</p>
        </div>
        <button>{notice}</button>
      </section>
      <section className="builderGrid">
        <aside className="card builderPages">
          <div className="panelHead"><h2>Pages</h2>{canEdit && <button onClick={addPage} disabled={!websiteId}>Create</button>}</div>
          {pages.map(page => <article className={page.id === selectedId ? 'active' : ''} key={page.id} onClick={() => setSelectedId(page.id)}><div><b>{page.title}</b><small>{page.slug}</small></div><span>{page.status}</span>{canEdit && <div className="builderPageActions"><button onClick={event => { event.stopPropagation(); movePage(page.id, 'up') }}>↑</button><button onClick={event => { event.stopPropagation(); movePage(page.id, 'down') }}>↓</button></div>}</article>)}
          {!pages.length && <p className="emptyState">No pages loaded from KSJ Digital yet.</p>}
        </aside>
        <section className="card builderEditor">
          <div className="panelHead"><h2>{canEdit ? 'Edit Page' : 'Preview Page'}</h2>{canEdit && <button disabled={!selected} onClick={() => updateSelected({ status: selected.status === 'Published' ? 'Draft' : 'Published' })}>{selected?.status || 'No page'}</button>}</div>
          {selected && <><div className="builderFields"><label>Page Title<input value={selected.title} disabled={!canEdit} onChange={event => updateSelected({ title: event.target.value })} /></label><label>Slug<input value={selected.slug} disabled /></label></div>{canEdit && <><div className="builderActions"><button onClick={duplicateSelected}>Duplicate</button><button onClick={removeSelected}>Delete</button></div><div className="blockAddBar">{blockTypes.map(type => <button key={type} onClick={() => addNewBlock(type)}>{type}</button>)}</div></>}{selected.blocks?.map(block => <article className="blockEditor" key={block.id}><div className="panelHead"><h3>{block.type}</h3>{canEdit && <button onClick={() => removeBlock(block.id)}>Remove</button>}</div><label>Title<input value={block.title || ''} disabled={!canEdit} onChange={event => editBlock(block.id, { title: event.target.value })} /></label><label>Text<textarea value={block.text || ''} disabled={!canEdit} onChange={event => editBlock(block.id, { text: event.target.value })} /></label>{block.type !== 'Text' && <label>Button / Label<input value={block.button || ''} disabled={!canEdit} onChange={event => editBlock(block.id, { button: event.target.value })} /></label>}</article>)}</>}
        </section>
        <aside className="card builderPreview">
          <div className="panelHead"><h2>Live Preview</h2><select value={device} onChange={event => setDevice(event.target.value)}><option>Desktop</option><option>Tablet</option><option>Mobile</option></select></div>
          {selected && <div className={`previewFrame ${device.toLowerCase()}`}><nav><b>{website?.logo || 'KSJ'}</b><span>{selected.slug}</span></nav>{selected.blocks?.map(block => <PreviewBlock key={block.id} block={block} />)}</div>}
        </aside>
      </section>
    </Layout>
  )
}
