import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getClientWebsite } from '../services/platform.js'

const blockTypes = ['Hero', 'Text', 'Image', 'Gallery', 'Button', 'Divider', 'FAQ', 'Embed', 'Discord', 'YouTube', 'Twitch']

const starterPages = [
  {
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
        title: 'Welcome to TwoToneTaj',
        text: 'Average gamer. Community builder. Professional scoreboard victim.',
        button: 'Join The Squad',
      },
    ],
  },
]

function slugify(title = '') {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return slug ? `/${slug}` : '/new-page'
}

function orderPages(pages) {
  return [...pages].sort((a, b) => a.order - b.order).map((page, index) => ({ ...page, order: index + 1 }))
}

function PreviewBlock({ block }) {
  if (block.type === 'Divider') return <hr />
  if (block.type === 'Button') return <button>{block.button || block.title}</button>
  if (['Image', 'Gallery'].includes(block.type)) return <div className="builderImageMock">{block.type}</div>
  if (['Embed', 'Discord', 'YouTube', 'Twitch'].includes(block.type)) return <div className="builderEmbedMock">{block.type} block</div>
  return <section><span>{block.type}</span><h3>{block.title}</h3><p>{block.text}</p>{block.button && <button>{block.button}</button>}</section>
}

export function PageBuilderPage({ client = false }) {
  const website = getClientWebsite()
  const [content, setContent] = useState({ pages: starterPages })
  const [selectedId, setSelectedId] = useState(starterPages[0]?.id)
  const [device, setDevice] = useState('Desktop')
  const [notice, setNotice] = useState('Loading')
  const pages = orderPages(content.pages?.length ? content.pages : starterPages)
  const selected = pages.find(page => page.id === selectedId) || pages[0]

  useEffect(() => {
    let cancelled = false

    async function loadContent() {
      try {
        const data = await api.getContent(website.id)
        if (cancelled) return
        const next = { ...data, pages: data.pages?.length ? data.pages : starterPages }
        setContent(next)
        setSelectedId(next.pages[0]?.id)
        setNotice('Ready')
      } catch (error) {
        if (!cancelled) setNotice(error.message)
      }
    }

    loadContent()

    return () => {
      cancelled = true
    }
  }, [website.id])

  async function saveContent(nextContent, nextSelectedId = selectedId, message = 'Saved') {
    const ordered = { ...nextContent, pages: orderPages(nextContent.pages || []) }
    setContent(ordered)
    setSelectedId(nextSelectedId)
    setNotice('Saving')

    try {
      const saved = await api.saveContent(website.id, ordered)
      setContent({ ...ordered, updatedAt: saved.updatedAt })
      setNotice(message)
    } catch (error) {
      setNotice(error.message)
    }
  }

  function updateSelected(changes) {
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
    if (selected.locked) return setNotice('Homepage is protected')
    const nextPages = pages.filter(page => page.id !== selected.id)
    saveContent({ ...content, pages: nextPages }, nextPages[0]?.id, 'Page deleted')
  }

  function movePage(pageId, direction) {
    const index = pages.findIndex(page => page.id === pageId)
    const nextIndex = direction === 'up' ? index - 1 : index + 1

    if (index < 0 || nextIndex < 0 || nextIndex >= pages.length) return

    const nextPages = [...pages]
    const [page] = nextPages.splice(index, 1)
    nextPages.splice(nextIndex, 0, page)
    saveContent({ ...content, pages: nextPages }, pageId, 'Page moved')
  }

  function addNewBlock(type) {
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
    const nextPages = pages.map(page =>
      page.id === selected.id
        ? { ...page, blocks: (page.blocks || []).filter(block => block.id !== blockId) }
        : page,
    )
    saveContent({ ...content, pages: nextPages }, selected.id, 'Block removed')
  }

  return <Layout client={client} title="Pages"><section className="moduleHero card"><div><span>Website Builder</span><h2>{website.name} Pages</h2><p>Create, organise and edit pages using safe content blocks. Changes save into KSJ Digital and can be used by the live client website.</p></div><button>{notice}</button></section><section className="builderGrid"><aside className="card builderPages"><div className="panelHead"><h2>Pages</h2><button onClick={addPage}>Create</button></div>{pages.map(page => <article className={page.id === selectedId ? 'active' : ''} key={page.id} onClick={() => setSelectedId(page.id)}><div><b>{page.title}</b><small>{page.slug}</small></div><span>{page.status}</span><div className="builderPageActions"><button onClick={event => { event.stopPropagation(); movePage(page.id, 'up') }}>↑</button><button onClick={event => { event.stopPropagation(); movePage(page.id, 'down') }}>↓</button></div></article>)}</aside><section className="card builderEditor"><div className="panelHead"><h2>Edit Page</h2><button onClick={() => updateSelected({ status: selected.status === 'Published' ? 'Draft' : 'Published' })}>{selected?.status}</button></div>{selected && <><div className="builderFields"><label>Page Title<input value={selected.title} onChange={event => updateSelected({ title: event.target.value })} /></label><label>Slug<input value={selected.slug} disabled /></label></div><div className="builderActions"><button onClick={duplicateSelected}>Duplicate</button><button onClick={removeSelected}>Delete</button></div><div className="blockAddBar">{blockTypes.map(type => <button key={type} onClick={() => addNewBlock(type)}>{type}</button>)}</div>{selected.blocks?.map(block => <article className="blockEditor" key={block.id}><div className="panelHead"><h3>{block.type}</h3><button onClick={() => removeBlock(block.id)}>Remove</button></div><label>Title<input value={block.title || ''} onChange={event => editBlock(block.id, { title: event.target.value })} /></label><label>Text<textarea value={block.text || ''} onChange={event => editBlock(block.id, { text: event.target.value })} /></label>{block.type !== 'Text' && <label>Button / Label<input value={block.button || ''} onChange={event => editBlock(block.id, { button: event.target.value })} /></label>}</article>)}</>}</section><aside className="card builderPreview"><div className="panelHead"><h2>Live Preview</h2><select value={device} onChange={event => setDevice(event.target.value)}><option>Desktop</option><option>Tablet</option><option>Mobile</option></select></div>{selected && <div className={`previewFrame ${device.toLowerCase()}`}><nav><b>{website.logo}</b><span>{selected.slug}</span></nav>{selected.blocks?.map(block => <PreviewBlock key={block.id} block={block} />)}</div>}</aside></section></Layout>
}
