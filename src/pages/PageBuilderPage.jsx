import { useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { addBlock, createPage, deleteBlock, deletePage, duplicatePage, getPages, movePage, updateBlock, updatePage } from '../services/pageBuilder.js'
import { getClientWebsite } from '../services/platform.js'

const blockTypes = ['Hero', 'Text', 'Image', 'Gallery', 'Button', 'Divider', 'FAQ', 'Embed', 'Discord', 'YouTube', 'Twitch']

function PreviewBlock({ block }) {
  if (block.type === 'Divider') return <hr />
  if (block.type === 'Button') return <button>{block.button || block.title}</button>
  if (['Image', 'Gallery'].includes(block.type)) return <div className="builderImageMock">{block.type}</div>
  if (['Embed', 'Discord', 'YouTube', 'Twitch'].includes(block.type)) return <div className="builderEmbedMock">{block.type} block</div>
  return <section><span>{block.type}</span><h3>{block.title}</h3><p>{block.text}</p>{block.button && <button>{block.button}</button>}</section>
}

export function PageBuilderPage({ client = false }) {
  const website = getClientWebsite()
  const [pages, setPages] = useState(getPages(website.id))
  const [selectedId, setSelectedId] = useState(pages[0]?.id)
  const [device, setDevice] = useState('Desktop')
  const [notice, setNotice] = useState('Ready')
  const selected = pages.find(page => page.id === selectedId) || pages[0]

  function refresh(nextId = selectedId) {
    const next = getPages(website.id)
    setPages(next)
    setSelectedId(next.find(page => page.id === nextId)?.id || next[0]?.id)
  }

  function addPage() {
    const page = createPage(website.id)
    refresh(page.id)
    setNotice('Page created')
  }

  function updateSelected(changes) {
    updatePage(website.id, selected.id, changes)
    refresh(selected.id)
    setNotice('Page updated')
  }

  function duplicateSelected() {
    const page = duplicatePage(website.id, selected.id)
    refresh(page?.id)
    setNotice('Page duplicated')
  }

  function removeSelected() {
    if (selected.locked) return setNotice('Homepage is protected')
    deletePage(website.id, selected.id)
    refresh()
    setNotice('Page deleted')
  }

  function addNewBlock(type) {
    addBlock(website.id, selected.id, type)
    refresh(selected.id)
    setNotice(`${type} block added`)
  }

  function editBlock(blockId, changes) {
    updateBlock(website.id, selected.id, blockId, changes)
    refresh(selected.id)
  }

  function removeBlock(blockId) {
    deleteBlock(website.id, selected.id, blockId)
    refresh(selected.id)
    setNotice('Block removed')
  }

  return <Layout client={client} title="Pages"><section className="moduleHero card"><div><span>Website Builder</span><h2>{website.name} Pages</h2><p>Create, organise and edit pages using safe content blocks. Homepage is protected and all changes remain draft until published.</p></div><button>{notice}</button></section><section className="builderGrid"><aside className="card builderPages"><div className="panelHead"><h2>Pages</h2><button onClick={addPage}>Create</button></div>{pages.map(page => <article className={page.id === selectedId ? 'active' : ''} key={page.id} onClick={() => setSelectedId(page.id)}><div><b>{page.title}</b><small>{page.slug}</small></div><span>{page.status}</span><div className="builderPageActions"><button onClick={event => { event.stopPropagation(); movePage(website.id, page.id, 'up'); refresh(page.id) }}>↑</button><button onClick={event => { event.stopPropagation(); movePage(website.id, page.id, 'down'); refresh(page.id) }}>↓</button></div></article>)}</aside><section className="card builderEditor"><div className="panelHead"><h2>Edit Page</h2><button onClick={() => updateSelected({ status: selected.status === 'Published' ? 'Draft' : 'Published' })}>{selected?.status}</button></div>{selected && <><div className="builderFields"><label>Page Title<input value={selected.title} onChange={event => updateSelected({ title: event.target.value })} /></label><label>Slug<input value={selected.slug} disabled /></label></div><div className="builderActions"><button onClick={duplicateSelected}>Duplicate</button><button onClick={removeSelected}>Delete</button></div><div className="blockAddBar">{blockTypes.map(type => <button key={type} onClick={() => addNewBlock(type)}>{type}</button>)}</div>{selected.blocks?.map(block => <article className="blockEditor" key={block.id}><div className="panelHead"><h3>{block.type}</h3><button onClick={() => removeBlock(block.id)}>Remove</button></div><label>Title<input value={block.title || ''} onChange={event => editBlock(block.id, { title: event.target.value })} /></label><label>Text<textarea value={block.text || ''} onChange={event => editBlock(block.id, { text: event.target.value })} /></label>{block.type !== 'Text' && <label>Button / Label<input value={block.button || ''} onChange={event => editBlock(block.id, { button: event.target.value })} /></label>}</article>)}</>}</section><aside className="card builderPreview"><div className="panelHead"><h2>Live Preview</h2><select value={device} onChange={event => setDevice(event.target.value)}><option>Desktop</option><option>Tablet</option><option>Mobile</option></select></div>{selected && <div className={`previewFrame ${device.toLowerCase()}`}><nav><b>{website.logo}</b><span>{selected.slug}</span></nav>{selected.blocks?.map(block => <PreviewBlock key={block.id} block={block} />)}</div>}</aside></section></Layout>
}
