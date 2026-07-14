import { useEffect, useMemo, useRef, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import {
  FIELD_ACCESS,
  canEditField,
  fieldRule,
  getPathValue,
  setPathValue,
  updateFieldRule,
} from '../services/editorPolicy.js'

function siteUrl(website, editor = false) {
  const raw = website?.editorUrl || website?.previewUrl || website?.domain || ''
  const url = raw.startsWith('http') ? raw : `https://${raw}`
  if (!editor) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}ksjEditor=1`
}

function FieldInspector({ account, content, selection, value, onChange, onRuleChange }) {
  if (!selection?.fieldId) return <p>Click an editable area on the website to manage it here.</p>

  const rule = fieldRule(content, selection.fieldId)
  const editable = canEditField(account, content, selection.fieldId)
  const multiline = selection.kind === 'textarea' || String(value || '').length > 80

  return (
    <div className="liveFieldInspector">
      <div className="selectedFieldTitle">
        <span>{selection.label || 'Website field'}</span>
        <code>{selection.fieldId}</code>
      </div>
      <label>
        Content
        {multiline ? (
          <textarea value={value ?? ''} disabled={!editable} onChange={event => onChange(event.target.value)} />
        ) : (
          <input value={value ?? ''} disabled={!editable} onChange={event => onChange(event.target.value)} />
        )}
      </label>

      {account?.role === 'owner' ? (
        <section className="ownerFieldControls">
          <h3>Client access</h3>
          <label>
            Access
            <select value={rule.access} onChange={event => onRuleChange({ access: event.target.value })}>
              <option value={FIELD_ACCESS.EDITABLE}>Client editable</option>
              <option value={FIELD_ACCESS.VIEW_ONLY}>View only</option>
              <option value={FIELD_ACCESS.HIDDEN}>Hidden from client editor</option>
              <option value={FIELD_ACCESS.OWNER_ONLY}>Owner only</option>
            </select>
          </label>
          <label className="formCheck"><input type="checkbox" checked={rule.approvalRequired !== false} onChange={event => onRuleChange({ approvalRequired: event.target.checked })} />Changes require KSJ approval</label>
          <label className="formCheck"><input type="checkbox" checked={rule.movable !== false} onChange={event => onRuleChange({ movable: event.target.checked })} />Client may move this section</label>
          <label className="formCheck"><input type="checkbox" checked={rule.deletable !== false} onChange={event => onRuleChange({ deletable: event.target.checked })} />Client may remove this section</label>
          <label>Lock reason<input value={rule.reason || ''} onChange={event => onRuleChange({ reason: event.target.value })} placeholder="Example: KSJ Digital platform credit" /></label>
        </section>
      ) : (
        !editable && <div className="lockedFieldNotice">🔒 {rule.reason || 'This content is controlled by KSJ Digital.'}</div>
      )}
    </div>
  )
}

export function PageBuilderPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('')
  const website = account?.role === 'owner'
    ? websites.find(site => site.id === selectedWebsiteId) || websites[0] || null
    : assignedWebsite
  const websiteId = website?.id
  const frameRef = useRef(null)
  const [frameReady, setFrameReady] = useState(false)
  const [content, setContent] = useState({ pages: [] })
  const [selection, setSelection] = useState(null)
  const [device, setDevice] = useState('desktop')
  const [notice, setNotice] = useState('Loading website')
  const canRequestUpdates = account?.role === 'owner' || account?.canRequestUpdates
  const selectedValue = useMemo(
    () => selection?.fieldId ? getPathValue(content, selection.fieldId) ?? selection.value ?? '' : '',
    [content, selection],
  )

  useEffect(() => {
    if (account?.role === 'owner' && !selectedWebsiteId && websites[0]?.id) setSelectedWebsiteId(websites[0].id)
  }, [account?.role, selectedWebsiteId, websites])

  useEffect(() => {
    setSelection(null)
    setFrameReady(false)
    if (!websiteId) return setNotice('Waiting for assigned website')
    let cancelled = false
    api.getContent(websiteId)
      .then(data => {
        if (cancelled) return
        setContent(data)
        setNotice('Website ready')
      })
      .catch(error => !cancelled && setNotice(error.message || 'Website unavailable'))
    return () => { cancelled = true }
  }, [websiteId])

  useEffect(() => {
    function receive(event) {
      if (!event.data || event.data.source !== 'ksj-site-editor') return
      if (event.data.type === 'ready') {
        setFrameReady(true)
        setNotice('Click the website to edit')
      }
      if (event.data.type === 'select-field') setSelection(event.data.field)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  useEffect(() => {
    if (!frameReady) return
    frameRef.current?.contentWindow?.postMessage({
      source: 'ksj-portal-editor',
      type: 'initialise',
      content,
      role: account?.role,
    }, '*')
  }, [account?.role, content, frameReady])

  async function save(nextContent, message) {
    if (!websiteId) return
    setContent(nextContent)
    setNotice('Saving draft')
    try {
      const saved = await api.saveContent(websiteId, nextContent)
      setContent(saved)
      setNotice(message)
    } catch (error) {
      setNotice(error.message || 'Save failed')
    }
  }

  function patchFrame(fieldId, value, nextContent = content) {
    frameRef.current?.contentWindow?.postMessage({
      source: 'ksj-portal-editor',
      type: 'patch-field',
      fieldId,
      value,
      rule: fieldRule(nextContent, fieldId),
    }, '*')
  }

  function updateSelected(value) {
    if (!selection?.fieldId || !canEditField(account, content, selection.fieldId)) return
    const next = setPathValue(content, selection.fieldId, value)
    patchFrame(selection.fieldId, value, next)
    save(next, 'Draft saved')
  }

  function updateRule(changes) {
    if (account?.role !== 'owner' || !selection?.fieldId) return
    const next = updateFieldRule(content, selection.fieldId, changes)
    patchFrame(selection.fieldId, getPathValue(next, selection.fieldId), next)
    save(next, 'Client access updated')
  }

  async function submitForApproval() {
    if (!websiteId || !canRequestUpdates) return setNotice('Update request permission required')
    setNotice('Submitting for approval')
    try {
      await api.createPublishRequest({
        websiteId,
        websiteName: website.name,
        repository: website.repository,
        title: 'Visual website edits',
        createdBy: account?.name,
        contentPath: `server-data/content/${websiteId}.json`,
      })
      setNotice('Submitted to KSJ Digital for approval')
    } catch (error) {
      setNotice(error.message || 'Submission failed')
    }
  }

  return (
    <Layout client={client} title={client ? 'Edit Website' : 'Website Editor'}>
      <section className="visualEditorHeader card">
        <div>
          <span>{client ? 'Your live website' : 'Owner editing mode'}</span>
          <h2>{website?.name || 'Assigned Website'}</h2>
          <p>This is the real website visitors see. Click highlighted content to edit it directly.</p>
          {account?.role === 'owner' && websites.length > 0 && (
            <label className="ownerWebsitePicker">Website<select value={websiteId || ''} onChange={event => setSelectedWebsiteId(event.target.value)}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          )}
        </div>
        <div className="visualEditorHeaderActions">
          <button className="secondary" onClick={() => window.open(siteUrl(website), '_blank')}>Open Live Website</button>
          {client && canRequestUpdates && <button onClick={submitForApproval}>Submit Changes</button>}
          <small>{notice}</small>
        </div>
      </section>

      <section className="realSiteEditorShell">
        <div className="card realSiteCanvas">
          <div className="visualCanvasToolbar">
            <strong>Website preview</strong>
            <div>{['desktop', 'tablet', 'mobile'].map(mode => <button key={mode} className={device === mode ? 'active' : ''} onClick={() => setDevice(mode)}>{mode}</button>)}</div>
          </div>
          <div className={`realSiteFrameWrap ${device}`}>
            {website?.domain || website?.editorUrl || website?.previewUrl ? (
              <iframe key={websiteId} ref={frameRef} title={`${website.name} visual editor`} src={siteUrl(website, true)} />
            ) : (
              <p className="emptyState">This website does not have a domain or editor URL configured.</p>
            )}
          </div>
        </div>

        <aside className="card visualInspector realSiteInspector">
          <div className="panelHead"><h2>{selection?.label || 'Edit Website'}</h2>{selection?.locked && <span>🔒</span>}</div>
          <FieldInspector account={account} content={content} selection={selection} value={selectedValue} onChange={updateSelected} onRuleChange={updateRule} />
        </aside>
      </section>
    </Layout>
  )
}
