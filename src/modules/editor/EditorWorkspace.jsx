import { useState } from 'react'
import { pages } from '../../services/mockData.js'
import { contentModel, contentPipeline } from '../../services/contentModel.js'
import { clearDraft, createPublishRequest, getInitialDraft, saveDraft } from '../../services/draftStore.js'
import { Layout } from '../../layouts/Shell.jsx'

const sectionStatuses = ['Ready', 'Ready', 'Needs review', 'Ready', 'Draft']

function FieldInput({ field, value, onChange }) {
  if (field.type === 'textarea') return <textarea value={value} onChange={event => onChange(field.key, event.target.value)} />
  return <input value={value} onChange={event => onChange(field.key, event.target.value)} />
}

export function EditorWorkspace({ client = false }) {
  const [draft, setDraft] = useState(() => getInitialDraft(contentModel.fields))
  const [notice, setNotice] = useState('Ready to edit')
  const updateField = (key, value) => {
    setDraft(current => ({ ...current, status: 'Unsaved changes', values: { ...current.values, [key]: value } }))
    setNotice('Unsaved changes')
  }
  const handleSave = () => {
    const saved = saveDraft(draft.values)
    setDraft(saved)
    setNotice('Draft saved')
  }
  const handleDiscard = () => {
    const reset = clearDraft(contentModel.fields)
    setDraft(reset)
    setNotice('Draft discarded')
  }
  const handlePublish = () => {
    createPublishRequest(draft.values)
    setNotice('Publish request sent for owner review')
  }
  return <Layout client={client} title="Pages / Editor"><section className="editorTopbar card"><div><span>Editing {contentModel.websiteName}</span><h2>Homepage</h2><p>Change safe website content fields. KSJ Digital protects the layout, design, code and publishing process.</p></div><div><button onClick={handleSave}>Save Draft</button><button onClick={handlePublish}>Request Publish</button></div></section><section className="draftStatusGrid"><article className="card draftStatus"><span>Draft</span><strong>{notice}</strong><small>{draft.status} · Last saved: {draft.updatedAt}</small></article><article className="card draftStatus"><span>Review Rule</span><strong>Owner Approval</strong><small>Required before changes go live</small></article><article className="card draftStatus"><span>Protected Layout</span><strong>Locked</strong><small>Content only editing enabled</small></article></section><section className="editorGrid advanced"><div className="card pageList"><div className="panelHead"><h2>Pages</h2><button>Add Page</button></div>{pages.map((page, index) => <button className={index === 0 ? 'selected' : ''} key={page}>{page}<small>{index < 5 ? 'Published' : 'Draft'}</small></button>)}</div><div className="card sectionList"><div className="panelHead"><h2>Editable Areas</h2><button>Preview</button></div>{contentModel.editableAreas.map((section, index) => <article key={section.id}><div><b>{section.label}</b><small>{section.description}</small></div><span>{sectionStatuses[index]}</span></article>)}</div><div className="card editorPanel"><div className="panelHead"><h2>Safe Content Fields</h2><button>{draft.status}</button></div>{contentModel.fields.map(field => <label key={field.key}>{field.label}<FieldInput field={field} value={draft.values[field.key] ?? ''} onChange={updateField} /><small>{field.lockedLayout ? 'Layout locked by KSJ Digital' : 'Editable'}</small></label>)}<div className="editorActions"><button onClick={handleDiscard}>Discard</button><button onClick={handleSave}>Save Draft</button></div></div></section><section className="editorPreviewGrid"><div className="card protectedNotice"><h2>Content Pipeline</h2>{contentPipeline.map((step, index) => <article className="pipelineStep" key={step[0]}><b>0{index + 1}. {step[0]}</b><p>{step[1]}</p></article>)}</div><div className="card clientPreview"><div className="mockNav"><b>TAJ</b><span>HOME</span><span>ABOUT</span><span>COMMUNITY</span><span>MERCH</span></div><div className="mockHero compact"><p>WELCOME TO</p><h2>{draft.values['home.hero.title'] || 'TwoToneTaj'}</h2><h4>{draft.values['home.hero.subtitle']}</h4><button>{draft.values['home.hero.buttonText'] || 'Join The Squad'}</button></div></div></section></Layout>
}
