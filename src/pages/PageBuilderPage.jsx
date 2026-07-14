import { useEffect, useMemo, useRef, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { VisualImageControl } from '../components/VisualImageControl.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { FIELD_ACCESS, canEditField, fieldRule, getPathValue, setPathValue, updateFieldRule } from '../services/editorPolicy.js'

function siteUrl(website, editor = false) {
  const raw = website?.editorUrl || website?.previewUrl || website?.domain || ''
  const url = raw.startsWith('http') ? raw : `https://${raw}`
  if (!editor) return url
  return `${url}${url.includes('?') ? '&' : '?'}ksjEditor=1`
}

function FieldInspector({ account, content, selection, value, onChange, onUpload, onRuleChange, onClose }) {
  if (!selection?.fieldId) return null
  const rule = fieldRule(content, selection.fieldId)
  const editable = canEditField(account, content, selection.fieldId)
  const multiline = selection.kind === 'textarea' || String(value || '').length > 80

  return (
    <div className="liveFieldInspector">
      <div className="selectedFieldTitle">
        <div><span>{selection.label || 'Website field'}</span><code>{selection.fieldId}</code></div>
        <button className="inspectorClose" onClick={onClose} aria-label="Close editor">×</button>
      </div>
      {selection.kind === 'image' ? (
        <VisualImageControl value={value} disabled={!editable} onUpload={onUpload} onUrlChange={onChange} />
      ) : (
        <label>Content{multiline ? <textarea value={value ?? ''} disabled={!editable} onChange={event => onChange(event.target.value)} /> : <input value={value ?? ''} disabled={!editable} onChange={event => onChange(event.target.value)} />}</label>
      )}
      {account?.role === 'owner' ? (
        <section className="ownerFieldControls">
          <h3>Client access</h3>
          <label>Access<select value={rule.access} onChange={event => onRuleChange({ access: event.target.value })}><option value={FIELD_ACCESS.EDITABLE}>Client editable</option><option value={FIELD_ACCESS.VIEW_ONLY}>View only</option><option value={FIELD_ACCESS.HIDDEN}>Hidden from client editor</option><option value={FIELD_ACCESS.OWNER_ONLY}>Owner only</option></select></label>
          <label className="formCheck"><input type="checkbox" checked={rule.approvalRequired !== false} onChange={event => onRuleChange({ approvalRequired: event.target.checked })} />Changes require KSJ approval</label>
          <label className="formCheck"><input type="checkbox" checked={rule.movable !== false} onChange={event => onRuleChange({ movable: event.target.checked })} />Client may move this section</label>
          <label className="formCheck"><input type="checkbox" checked={rule.deletable !== false} onChange={event => onRuleChange({ deletable: event.target.checked })} />Client may remove this section</label>
          <label>Lock reason<input value={rule.reason || ''} onChange={event => onRuleChange({ reason: event.target.value })} placeholder="Example: KSJ Digital platform credit" /></label>
        </section>
      ) : !editable && <div className="lockedFieldNotice">🔒 {rule.reason || 'This content is controlled by KSJ Digital.'}</div>}
    </div>
  )
}

export function PageBuilderPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('')
  const website = account?.role === 'owner' ? websites.find(site => site.id === selectedWebsiteId) || websites[0] || null : assignedWebsite
  const websiteId = website?.id
  const frameRef = useRef(null)
  const workspaceRef = useRef(null)
  const [frameReady, setFrameReady] = useState(false)
  const [content, setContent] = useState({ pages: [] })
  const [selection, setSelection] = useState(null)
  const [device, setDevice] = useState('desktop')
  const [notice, setNotice] = useState('Loading website')
  const [focusMode, setFocusMode] = useState(true)
  const [browserFullscreen, setBrowserFullscreen] = useState(false)
  const canRequestUpdates = account?.role === 'owner' || account?.canRequestUpdates
  const selectedValue = useMemo(() => selection?.fieldId ? getPathValue(content, selection.fieldId) ?? selection.value ?? '' : '', [content, selection])

  useEffect(() => { if (account?.role === 'owner' && !selectedWebsiteId && websites[0]?.id) setSelectedWebsiteId(websites[0].id) }, [account?.role, selectedWebsiteId, websites])
  useEffect(() => {
    setSelection(null); setFrameReady(false)
    if (!websiteId) return setNotice('Waiting for assigned website')
    let cancelled = false
    api.getContent(websiteId).then(data => { if (!cancelled) { setContent(data); setNotice('Website ready') } }).catch(error => !cancelled && setNotice(error.message || 'Website unavailable'))
    return () => { cancelled = true }
  }, [websiteId])

  function initialiseFrame() {
    frameRef.current?.contentWindow?.postMessage({ source: 'ksj-portal-editor', type: 'initialise', content, role: account?.role }, '*')
  }

  useEffect(() => {
    function receive(event) {
      if (!event.data || event.data.source !== 'ksj-site-editor') return
      if (event.data.type === 'ready') {
        setFrameReady(true)
        setNotice(event.data.fieldCount ? `${event.data.fieldCount} editable areas ready` : 'Editor connected')
        initialiseFrame()
      }
      if (event.data.type === 'select-field') setSelection(event.data.field)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  })

  useEffect(() => { if (frameReady) initialiseFrame() }, [account?.role, content, frameReady])
  useEffect(() => {
    function changed() { setBrowserFullscreen(document.fullscreenElement === workspaceRef.current) }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  useEffect(() => {
    function closeInspector(event) { if (event.key === 'Escape' && selection) setSelection(null) }
    window.addEventListener('keydown', closeInspector)
    return () => window.removeEventListener('keydown', closeInspector)
  }, [selection])

  function frameLoaded() {
    setFrameReady(false)
    setNotice('Connecting editor…')
    const target = frameRef.current?.contentWindow
    target?.postMessage({ source: 'ksj-portal-editor', type: 'ping' }, '*')
    window.setTimeout(initialiseFrame, 150)
    window.setTimeout(() => target?.postMessage({ source: 'ksj-portal-editor', type: 'ping' }, '*'), 700)
  }

  async function save(nextContent, message) {
    if (!websiteId) return
    setContent(nextContent); setNotice('Saving…')
    try { const saved = await api.saveContent(websiteId, nextContent); setContent(saved); setNotice(message) } catch (error) { setNotice(error.message || 'Save failed') }
  }
  function patchFrame(fieldId, value, nextContent = content) {
    frameRef.current?.contentWindow?.postMessage({ source: 'ksj-portal-editor', type: 'patch-field', fieldId, value, rule: fieldRule(nextContent, fieldId) }, '*')
  }
  function updateSelected(value) {
    if (!selection?.fieldId || !canEditField(account, content, selection.fieldId)) return
    const next = setPathValue(content, selection.fieldId, value)
    patchFrame(selection.fieldId, value, next); save(next, '✓ Draft saved')
  }
  async function uploadSelectedImage(file) {
    if (!file || !selection?.fieldId || !websiteId || !canEditField(account, content, selection.fieldId)) return
    setNotice('Uploading image…')
    try {
      const asset = await api.uploadAsset(website.owner || website.id, websiteId, selection.fieldId, file)
      const next = setPathValue(content, selection.fieldId, asset.url)
      patchFrame(selection.fieldId, asset.url, next)
      await save(next, '✓ Image uploaded')
    } catch (error) { setNotice(error.message || 'Image upload failed') }
  }
  function updateRule(changes) {
    if (account?.role !== 'owner' || !selection?.fieldId) return
    const next = updateFieldRule(content, selection.fieldId, changes)
    patchFrame(selection.fieldId, getPathValue(next, selection.fieldId), next); save(next, '✓ Client access updated')
  }
  async function submitForApproval() {
    if (!websiteId || !canRequestUpdates) return setNotice('Update request permission required')
    setNotice('Submitting…')
    try { await api.createPublishRequest({ websiteId, websiteName: website.name, repository: website.repository, title: 'Visual website edits', createdBy: account?.displayName || account?.name, contentPath: `server-data/content/${websiteId}.json` }); setNotice('✓ Submitted for approval') } catch (error) { setNotice(error.message || 'Submission failed') }
  }
  async function toggleBrowserFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await workspaceRef.current?.requestFullscreen()
  }

  return (
    <Layout client={client} title={client ? 'Edit Website' : 'Website Editor'}>
      <div ref={workspaceRef} className={`editorWorkspace ${focusMode ? 'editorFocusMode' : ''} ${selection ? 'inspectorOpen' : ''}`}>
        <header className="editorTopbar">
          <div className="editorIdentity">
            <button className="editorBack" onClick={() => setFocusMode(false)} aria-label="Exit focus mode">←</button>
            <div><strong>{website?.name || 'Assigned Website'}</strong><small>{notice}</small></div>
            {account?.role === 'owner' && websites.length > 1 && <select value={websiteId || ''} onChange={event => setSelectedWebsiteId(event.target.value)}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select>}
          </div>
          <div className="editorDevices">{['desktop', 'tablet', 'mobile'].map(mode => <button key={mode} className={device === mode ? 'active' : ''} onClick={() => setDevice(mode)}>{mode}</button>)}</div>
          <div className="editorActions">
            {!focusMode && <button onClick={() => setFocusMode(true)}>Focus Editor</button>}
            <button onClick={toggleBrowserFullscreen}>{browserFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
            <button onClick={() => window.open(siteUrl(website), '_blank')}>Preview</button>
            {client && canRequestUpdates && <button className="primary" onClick={submitForApproval}>Submit Changes</button>}
          </div>
        </header>
        <main className="editorStage">
          <div className={`editorCanvas ${device}`}>
            {website?.domain || website?.editorUrl || website?.previewUrl ? <iframe key={websiteId} ref={frameRef} title={`${website.name} visual editor`} src={siteUrl(website, true)} onLoad={frameLoaded} /> : <p className="emptyState">This website does not have a domain or editor URL configured.</p>}
          </div>
          {selection && <aside className="editorInspector"><FieldInspector account={account} content={content} selection={selection} value={selectedValue} onChange={updateSelected} onUpload={uploadSelectedImage} onRuleChange={updateRule} onClose={() => setSelection(null)} /></aside>}
        </main>
      </div>
    </Layout>
  )
}
