import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

const blockTypes = ['Hero', 'Text', 'Image', 'Gallery', 'Button', 'Divider', 'FAQ', 'Embed']

function slugify(title = '') {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return slug ? `/${slug}` : '/new-page'
}

function orderPages(pages = []) {
  return [...pages].sort((a, b) => a.order - b.order).map((page, index) => ({ ...page, order: index + 1 }))
}

function starterPage() {
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
        title: 'Welcome to your website',
        text: 'Click this section to edit the heading, text and button.',
        button: 'Learn More',
      },
    ],
  }
}

function newBlock(type) {
  return {
    id: `${type.toLowerCase()}-${Date.now()}`,
    type,
    title: type === 'Hero' ? 'New hero section' : `New ${type.toLowerCase()}`,
    text: type === 'Divider' ? '' : 'Click this section to edit its content.',
    button: ['Hero', 'Button'].includes(type) ? 'Learn More' : '',
    image: '',
  }
}

function VisualBlock({ block, selected, canEdit, onSelect, onDragStart, onDrop }) {
  const className = `visualBlock visual${block.type} ${selected ? 'selected' : ''}`

  return (
    <section
      className={className}
      draggable={canEdit}
      onClick={() => onSelect(block.id)}
      onDragStart={() => onDragStart(block.id)}
      onDragOver={event => event.preventDefault()}
      onDrop={() => onDrop(block.id)}
    >
      {block.type === 'Divider' ? (
        <hr />
      ) : ['Image', 'Gallery'].includes(block.type) ? (
        <div className="visualImageArea">
          {block.image ? <img src={block.image} alt={block.title || 'Website content'} /> : <span>Drop or choose an image</span>}
          {block.type === 'Gallery' && <small>Gallery section</small>}
        </div>
      ) : block.type === 'Embed' ? (
        <div className="visualEmbedArea">Embedded content</div>
      ) : (
        <>
          <small>{block.type}</small>
          {block.title && <h2>{block.title}</h2>}
          {block.text && <p>{block.text}</p>}
          {block.button && <button>{block.button}</button>}
        </>
      )}
      {canEdit && <span className="visualEditHint">Click to edit · Drag to move</span>}
    </section>
  )
}

export function PageBuilderPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const websiteId = website?.id
  const canEdit = account?.role === 'owner' || account?.canEdit
  const canRequestUpdates = account?.role === 'owner' || account?.canRequestUpdates
  const [content, setContent] = useState({ pages: [] })
  const [selectedPageId, setSelectedPageId] = useState('')
  const [selectedBlockId, setSelectedBlockId] = useState('')
  const [device, setDevice] = useState('desktop')
  const [notice, setNotice] = useState('Loading')
  const [draggedBlockId, setDraggedBlockId] = useState('')
  const pages = useMemo(() => orderPages(content.pages || []), [content.pages])
  const selectedPage = pages.find(page => page.id === selectedPageId) || pages[0]
  const selectedBlock = selectedPage?.blocks?.find(block => block.id === selectedBlockId)

  useEffect(() => {
    if (!websiteId) {
      setContent({ pages: [] })
      setNotice('Waiting for assigned website')
      return
    }

    let cancelled = false
    api.getContent(websiteId)
      .then(data => {
        if (cancelled) return
        const nextPages = data.pages?.length ? data.pages : [starterPage()]
        const next = { ...data, pages: orderPages(nextPages) }
        setContent(next)
        setSelectedPageId(next.pages[0]?.id || '')
        setSelectedBlockId(next.pages[0]?.blocks?.[0]?.id || '')
        setNotice(canEdit ? 'Ready to edit' : 'Preview only')
      })
      .catch(error => !cancelled && setNotice(error.message))

    return () => { cancelled = true }
  }, [canEdit, websiteId])

  async function save(nextContent, message = 'Draft saved') {
    if (!websiteId || !canEdit) return setNotice(!websiteId ? 'No website assigned' : 'Edit permission required')
    const ordered = { ...nextContent, pages: orderPages(nextContent.pages || []) }
    setContent(ordered)
    setNotice('Saving draft')
    try {
      const saved = await api.saveContent(websiteId, ordered)
      setContent({ ...ordered, updatedAt: saved.updatedAt })
      setNotice(message)
    } catch (error) {
      setNotice(error.message)
    }
  }

  function updatePage(changes) {
    if (!selectedPage) return
    const nextPages = pages.map(page => page.id === selectedPage.id
      ? { ...page, ...changes, slug: changes.title && page.slug !== '/' ? slugify(changes.title) : page.slug }
      : page)
    save({ ...content, pages: nextPages }, 'Page draft saved')
  }

  function updateBlock(changes) {
    if (!selectedPage || !selectedBlock) return
    const nextPages = pages.map(page => page.id === selectedPage.id
      ? { ...page, status: client ? 'Draft' : page.status, blocks: page.blocks.map(block => block.id === selectedBlock.id ? { ...block, ...changes } : block) }
      : page)
    save({ ...content, pages: nextPages }, 'Section draft saved')
  }

  function addPage() {
    const page = {
      id: `page-${Date.now()}`,
      title: 'New Page',
      slug: '/new-page',
      status: 'Draft',
      locked: false,
      order: pages.length + 1,
      blocks: [newBlock('Hero')],
    }
    setSelectedPageId(page.id)
    setSelectedBlockId(page.blocks[0].id)
    save({ ...content, pages: [...pages, page] }, 'Page created')
  }

  function addBlock(type) {
    if (!selectedPage) return
    const block = newBlock(type)
    const nextPages = pages.map(page => page.id === selectedPage.id
      ? { ...page, status: client ? 'Draft' : page.status, blocks: [...(page.blocks || []), block] }
      : page)
    setSelectedBlockId(block.id)
    save({ ...content, pages: nextPages }, `${type} section added`)
  }

  function removeBlock() {
    if (!selectedPage || !selectedBlock) return
    const nextBlocks = selectedPage.blocks.filter(block => block.id !== selectedBlock.id)
    const nextPages = pages.map(page => page.id === selectedPage.id ? { ...page, blocks: nextBlocks, status: 'Draft' } : page)
    setSelectedBlockId(nextBlocks[0]?.id || '')
    save({ ...content, pages: nextPages }, 'Section removed')
  }

  function moveBlock(targetId) {
    if (!draggedBlockId || draggedBlockId === targetId || !selectedPage) return
    const blocks = [...selectedPage.blocks]
    const from = blocks.findIndex(block => block.id === draggedBlockId)
    const to = blocks.findIndex(block => block.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = blocks.splice(from, 1)
    blocks.splice(to, 0, moved)
    const nextPages = pages.map(page => page.id === selectedPage.id ? { ...page, blocks, status: 'Draft' } : page)
    setDraggedBlockId('')
    save({ ...content, pages: nextPages }, 'Section order saved')
  }

  async function submitForApproval() {
    if (!websiteId || !canRequestUpdates) return setNotice('Update request permission required')
    setNotice('Submitting for approval')
    try {
      await api.createPublishRequest({
        websiteId,
        websiteName: website.name,
        repository: website.repository,
        title: `${selectedPage?.title || 'Website'} visual edits`,
        createdBy: account?.name,
        contentPath: `server-data/content/${websiteId}.json`,
      })
      setNotice('Submitted to KSJ Digital for approval')
    } catch (error) {
      setNotice(error.message)
    }
  }

  return (
    <Layout client={client} title={client ? 'Edit Website' : 'Website Editor'}>
      <section className="visualEditorHeader card">
        <div>
          <span>Visual Website Editor</span>
          <h2>{website?.name || 'Assigned Website'}</h2>
          <p>Click any section in the preview to edit it. Drag sections to change their order.</p>
        </div>
        <div className="visualEditorHeaderActions">
          <button className="secondary" onClick={() => window.open(website?.domain?.startsWith('http') ? website.domain : `https://${website?.domain}`, '_blank')}>View Live Site</button>
          {client && canRequestUpdates && <button onClick={submitForApproval}>Submit for Approval</button>}
          <small>{notice}</small>
        </div>
      </section>

      <section className="visualEditorShell">
        <aside className="card visualPagePanel">
          <div className="panelHead"><h2>Pages</h2>{canEdit && <button onClick={addPage}>Add</button>}</div>
          {pages.map(page => (
            <button className={page.id === selectedPage?.id ? 'active' : ''} key={page.id} onClick={() => { setSelectedPageId(page.id); setSelectedBlockId(page.blocks?.[0]?.id || '') }}>
              <b>{page.title}</b><small>{page.slug} · {page.status}</small>
            </button>
          ))}
          <hr />
          <h3>Add Section</h3>
          <div className="visualBlockLibrary">
            {blockTypes.map(type => <button key={type} disabled={!canEdit || !selectedPage} onClick={() => addBlock(type)}>{type}</button>)}
          </div>
        </aside>

        <main className={`card visualCanvas ${device}`}>
          <div className="visualCanvasToolbar">
            <label>Page name<input value={selectedPage?.title || ''} disabled={!canEdit} onChange={event => updatePage({ title: event.target.value })} /></label>
            <div><button className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}>Desktop</button><button className={device === 'tablet' ? 'active' : ''} onClick={() => setDevice('tablet')}>Tablet</button><button className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}>Mobile</button></div>
          </div>
          <div className="visualWebsiteFrame">
            <nav><b>{website?.logo || website?.name?.slice(0, 3).toUpperCase() || 'SITE'}</b><span>{pages.map(page => page.title).join('   ')}</span></nav>
            {selectedPage?.blocks?.map(block => (
              <VisualBlock key={block.id} block={block} selected={block.id === selectedBlockId} canEdit={canEdit} onSelect={setSelectedBlockId} onDragStart={setDraggedBlockId} onDrop={moveBlock} />
            ))}
            {!selectedPage?.blocks?.length && <p className="emptyState">Add a section to begin editing this page.</p>}
          </div>
        </main>

        <aside className="card visualInspector">
          <div className="panelHead"><h2>{selectedBlock ? `Edit ${selectedBlock.type}` : 'Select a Section'}</h2>{selectedBlock && canEdit && <button onClick={removeBlock}>Remove</button>}</div>
          {selectedBlock ? (
            <div className="visualInspectorFields">
              {selectedBlock.type !== 'Divider' && <label>Heading<input value={selectedBlock.title || ''} disabled={!canEdit} onChange={event => updateBlock({ title: event.target.value })} /></label>}
              {!['Divider', 'Image', 'Gallery'].includes(selectedBlock.type) && <label>Text<textarea value={selectedBlock.text || ''} disabled={!canEdit} onChange={event => updateBlock({ text: event.target.value })} /></label>}
              {['Hero', 'Button'].includes(selectedBlock.type) && <label>Button text<input value={selectedBlock.button || ''} disabled={!canEdit} onChange={event => updateBlock({ button: event.target.value })} /></label>}
              {['Image', 'Gallery'].includes(selectedBlock.type) && <label>Image URL<input value={selectedBlock.image || ''} disabled={!canEdit} onChange={event => updateBlock({ image: event.target.value })} placeholder="Paste an image URL" /></label>}
              <p>Changes appear immediately in the preview and save as a draft.</p>
            </div>
          ) : <p>Click a section in the website preview to edit it here.</p>}
        </aside>
      </section>
    </Layout>
  )
}
