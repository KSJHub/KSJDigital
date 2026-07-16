import { useEffect, useMemo, useRef, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { VisualImageControl } from '../components/VisualImageControl.jsx'
import { RegistryBlockLibrary } from '../components/RegistryBlockLibrary.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import {
  FIELD_ACCESS,
  canEditField,
  canManageSection,
  fieldRule,
  getPathValue,
  sectionRule,
  setPathValue,
  updateFieldRule,
  updateSectionRule,
} from '../services/editorPolicy.js'

const MAX_HISTORY = 50
const INLINE_SAVE_DELAY = 650
const FALLBACK_PAGES = [
  { label: 'Home', target: '/' },
  { label: 'About', target: '/about' },
  { label: 'Content', target: '/content' },
  { label: 'Community', target: '/community' },
  { label: 'Merch', target: '/merch' },
  { label: 'Contact', target: '/contact' },
  { label: 'Privacy', target: '/privacy' },
  { label: 'Terms', target: '/terms' },
]

function localDevelopment() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function siteUrl(website, editor = false) {
  const raw = editor && localDevelopment() && website?.developmentEditorUrl
    ? website.developmentEditorUrl
    : website?.editorUrl || website?.previewUrl || website?.domain || ''
  const url = raw.startsWith('http') ? raw : `https://${raw}`
  if (!editor) return url
  return `${url}${url.includes('?') ? '&' : '?'}ksjEditor=1`
}

function sameContent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function editorPages(content = {}) {
  const navigation = content.engine?.navigation || content.navigation || []
  const managed = navigation
    .filter(item => item.visible !== false && item.external !== true && typeof item.target === 'string' && item.target.startsWith('/'))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    .map(item => ({ label: item.label || item.target, target: item.target }))
  const result = managed.length ? managed : FALLBACK_PAGES.slice(0, 6)
  const optional = [
    content.contactPage && { label: 'Contact', target: '/contact' },
    content.privacy && { label: 'Privacy', target: '/privacy' },
    content.terms && { label: 'Terms', target: '/terms' },
  ].filter(Boolean)
  return [...result, ...optional].filter((page, index, pages) => pages.findIndex(item => item.target === page.target) === index)
}

function pageKey(pathname = '/') {
  if (pathname === '/') return 'home'
  return pathname.replace(/^\//, '').split('/')[0] || 'home'
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function managedBlockDetails(selection, content) {
  const match = /^pageBlocks\.([^.]+)\.(.+)$/.exec(selection?.sectionId || '')
  if (!match) return null
  const [, key, id] = match
  const blocks = content.engine?.pageBlocks?.[key] || []
  const index = blocks.findIndex(block => block.id === id)
  if (index < 0) return null
  return { key, id, index, block: blocks[index] }
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
      {selection.kind === 'image'
        ? <VisualImageControl value={value} disabled={!editable} onUpload={onUpload} onUrlChange={onChange} />
        : <label>Content{multiline
          ? <textarea value={value ?? ''} disabled={!editable} onChange={event => onChange(event.target.value)} />
          : <input value={value ?? ''} disabled={!editable} onChange={event => onChange(event.target.value)} />}</label>}
      {account?.role === 'owner' ? (
        <section className="ownerFieldControls">
          <h3>Client access</h3>
          <label>Access<select value={rule.access} onChange={event => onRuleChange({ access: event.target.value })}><option value={FIELD_ACCESS.EDITABLE}>Client editable</option><option value={FIELD_ACCESS.VIEW_ONLY}>View only</option><option value={FIELD_ACCESS.HIDDEN}>Hidden from client editor</option><option value={FIELD_ACCESS.OWNER_ONLY}>Owner only</option></select></label>
          <label className="formCheck"><input type="checkbox" checked={rule.approvalRequired !== false} onChange={event => onRuleChange({ approvalRequired: event.target.checked })} /> Changes require KSJ approval</label>
          <label>Lock reason<input value={rule.reason || ''} onChange={event => onRuleChange({ reason: event.target.value })} placeholder="Explain why this field is locked" /></label>
        </section>
      ) : !editable && <div className="lockedFieldNotice">🔒 {rule.reason || 'This content is controlled by KSJ Digital.'}</div>}
    </div>
  )
}

function SectionInspector({ account, content, selection, onRuleChange, onMove, onDuplicate, onDelete, onClose }) {
  if (!selection?.sectionId) return null
  const rule = sectionRule(content, selection.sectionId, selection.defaultOrder || 0)
  const manageable = canManageSection(account, content, selection.sectionId)
  const platformOwner = account?.role === 'owner'
  const managedBlock = managedBlockDetails(selection, content)
  const canMove = platformOwner || (manageable && rule.movable !== false)
  const canHide = platformOwner || manageable
  const canRemove = platformOwner || (manageable && rule.deletable === true)
  return (
    <div className="liveFieldInspector sectionInspector">
      <div className="selectedFieldTitle">
        <div><span>{selection.label || 'Website section'}</span><code>{selection.sectionId}</code></div>
        <button className="inspectorClose" onClick={onClose} aria-label="Close section controls">×</button>
      </div>
      <section className="sectionActionsPanel">
        <h3>Section controls</h3>
        <p className="sectionDragHint">Drag this section directly in the website preview, or use the buttons below.</p>
        <div className="sectionMoveActions">
          <button disabled={!canMove} onClick={() => onMove('up')}>↑ Move Up</button>
          <button disabled={!canMove} onClick={() => onMove('down')}>↓ Move Down</button>
        </div>
        {managedBlock && <button disabled={!manageable && !platformOwner} onClick={onDuplicate}>Duplicate Section</button>}
        <button disabled={!canHide} onClick={() => onRuleChange({ hidden: !rule.hidden })}>{rule.hidden ? 'Restore Section' : 'Hide Section'}</button>
        {managedBlock
          ? <button className="danger" disabled={!canRemove} onClick={onDelete}>Delete Section Permanently</button>
          : <button className="danger" disabled={!canRemove} onClick={() => onRuleChange({ hidden: true, removed: true })}>Remove Section</button>}
        {!manageable && <div className="lockedFieldNotice">🔒 {rule.reason || 'This section is controlled by KSJ Digital.'}</div>}
      </section>
      {platformOwner && (
        <section className="ownerFieldControls">
          <h3>Client section permissions</h3>
          <label>Access<select value={rule.access} onChange={event => onRuleChange({ access: event.target.value })}><option value={FIELD_ACCESS.EDITABLE}>Client manageable</option><option value={FIELD_ACCESS.VIEW_ONLY}>View only</option><option value={FIELD_ACCESS.HIDDEN}>Hidden from client editor</option><option value={FIELD_ACCESS.OWNER_ONLY}>Owner only</option></select></label>
          <label className="formCheck"><input type="checkbox" checked={rule.approvalRequired !== false} onChange={event => onRuleChange({ approvalRequired: event.target.checked })} /> Changes require KSJ approval</label>
          <label className="formCheck"><input type="checkbox" checked={rule.movable !== false} onChange={event => onRuleChange({ movable: event.target.checked })} /> Client may drag or move this section</label>
          <label className="formCheck"><input type="checkbox" checked={rule.deletable === true} onChange={event => onRuleChange({ deletable: event.target.checked })} /> Client may remove this section</label>
          <label>Lock reason<input value={rule.reason || ''} onChange={event => onRuleChange({ reason: event.target.value })} placeholder="Explain why this section is locked" /></label>
        </section>
      )}
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
  const bridgeTimerRef = useRef(null)
  const inlineSaveTimerRef = useRef(null)
  const inlineDraftRef = useRef(null)
  const contentRef = useRef({ pages: [] })
  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)
  const historyBusyRef = useRef(false)
  const [frameReady, setFrameReady] = useState(false)
  const [content, setContentState] = useState({ pages: [] })
  const [selection, setSelection] = useState(null)
  const [device, setDevice] = useState('desktop')
  const [currentPath, setCurrentPath] = useState('/')
  const [notice, setNotice] = useState('Loading website')
  const [focusMode, setFocusMode] = useState(true)
  const [browserFullscreen, setBrowserFullscreen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState(null)
  const [showBlockLibrary, setShowBlockLibrary] = useState(false)
  const [historyState, setHistoryState] = useState({ index: -1, length: 0 })
  const canRequestUpdates = account?.role === 'owner' || account?.canRequestUpdates
  const selectedValue = useMemo(() => selection?.fieldId ? getPathValue(content, selection.fieldId) ?? selection.value ?? '' : '', [content, selection])
  const pages = useMemo(() => editorPages(content), [content])
  const currentPageBlocks = content.engine?.pageBlocks?.[pageKey(currentPath)] || []
  const nextBlockOrder = currentPageBlocks.reduce((maximum, block) => Math.max(maximum, Number(block.order || 0)), 0) + 10
  const capabilities = website?.capabilities || account?.websiteCapabilities || []
  const canUndo = historyState.index > 0
  const canRedo = historyState.index >= 0 && historyState.index < historyState.length - 1

  function setContent(next) {
    contentRef.current = next
    setContentState(next)
  }

  function updateHistoryState() {
    setHistoryState({ index: historyIndexRef.current, length: historyRef.current.length })
  }

  function resetHistory(snapshot) {
    historyRef.current = [structuredClone(snapshot)]
    historyIndexRef.current = 0
    updateHistoryState()
  }

  function recordHistory(snapshot) {
    if (historyBusyRef.current) return
    const current = historyRef.current[historyIndexRef.current]
    if (current && sameContent(current, snapshot)) return
    const retained = historyRef.current.slice(0, historyIndexRef.current + 1)
    retained.push(structuredClone(snapshot))
    if (retained.length > MAX_HISTORY) retained.splice(0, retained.length - MAX_HISTORY)
    historyRef.current = retained
    historyIndexRef.current = retained.length - 1
    updateHistoryState()
  }

  useEffect(() => {
    if (account?.role === 'owner' && !selectedWebsiteId && websites[0]?.id) setSelectedWebsiteId(websites[0].id)
  }, [account?.role, selectedWebsiteId, websites])

  useEffect(() => {
    setSelection(null)
    setFrameReady(false)
    setSubmission(null)
    setShowBlockLibrary(false)
    setCurrentPath('/')
    window.clearTimeout(inlineSaveTimerRef.current)
    inlineDraftRef.current = null
    historyRef.current = []
    historyIndexRef.current = -1
    updateHistoryState()
    if (!websiteId) {
      setNotice('Waiting for assigned website')
      return undefined
    }
    let cancelled = false
    api.getContent(websiteId).then(data => {
      if (cancelled) return
      setContent(data)
      resetHistory(data)
      setNotice('Website ready')
    }).catch(error => !cancelled && setNotice(error.message || 'Website unavailable'))
    return () => { cancelled = true }
  }, [websiteId])

  function initialiseFrame(nextContent = contentRef.current) {
    frameRef.current?.contentWindow?.postMessage({ source: 'ksj-portal-editor', type: 'initialise', content: nextContent, role: account?.role }, '*')
  }

  async function save(nextContent, message, { addHistory = true } = {}) {
    if (!websiteId) return false
    if (addHistory) recordHistory(nextContent)
    setSubmission(null)
    setContent(nextContent)
    initialiseFrame(nextContent)
    setNotice('Saving…')
    try {
      const saved = await api.saveContent(websiteId, nextContent)
      setContent(saved)
      initialiseFrame(saved)
      setNotice(message)
      return true
    } catch (error) {
      setNotice(error.message || 'Save failed')
      return false
    }
  }

  async function flushInlineDraft(message = '✓ Draft autosaved') {
    window.clearTimeout(inlineSaveTimerRef.current)
    const draft = inlineDraftRef.current
    if (!draft) return true
    inlineDraftRef.current = null
    return save(draft, message)
  }

  function queueInlineEdit(field) {
    if (!field?.fieldId || !canEditField(account, contentRef.current, field.fieldId)) return
    const source = inlineDraftRef.current || contentRef.current
    const next = setPathValue(source, field.fieldId, field.value)
    inlineDraftRef.current = next
    setSelection({ type: 'field', ...field })
    setSubmission(null)
    setNotice('Editing…')
    window.clearTimeout(inlineSaveTimerRef.current)
    inlineSaveTimerRef.current = window.setTimeout(() => flushInlineDraft(), INLINE_SAVE_DELAY)
  }

  async function reorderSections(sourceSection, targetSection) {
    if (!sourceSection?.sectionId || !targetSection?.sectionId || sourceSection.sectionId === targetSection.sectionId) return
    const current = inlineDraftRef.current || contentRef.current
    if (!canManageSection(account, current, sourceSection.sectionId) || !canManageSection(account, current, targetSection.sectionId)) return
    const sourceRule = sectionRule(current, sourceSection.sectionId, sourceSection.defaultOrder || 0)
    const targetRule = sectionRule(current, targetSection.sectionId, targetSection.defaultOrder || 0)
    if (account?.role !== 'owner' && (sourceRule.movable === false || targetRule.movable === false)) return
    await flushInlineDraft('✓ Text saved before moving section')
    let next = updateSectionRule(contentRef.current, sourceSection.sectionId, { order: Number(targetRule.order ?? targetSection.order ?? targetSection.defaultOrder ?? 0) })
    next = updateSectionRule(next, targetSection.sectionId, { order: Number(sourceRule.order ?? sourceSection.order ?? sourceSection.defaultOrder ?? 0) })
    setSelection({ type: 'section', ...sourceSection })
    await save(next, '✓ Section order saved')
  }

  useEffect(() => {
    function receive(event) {
      if (!event.data || event.data.source !== 'ksj-site-editor') return
      if (event.data.type === 'ready' || event.data.type === 'page-change') {
        window.clearTimeout(bridgeTimerRef.current)
        setFrameReady(true)
        setCurrentPath(event.data.pathname || '/')
        if (event.data.type === 'page-change') setSelection(null)
        setNotice(event.data.fieldCount ? `${event.data.fieldCount} editable areas ready` : 'Editor connected')
        initialiseFrame(inlineDraftRef.current || contentRef.current)
      }
      if (event.data.type === 'select-field') setSelection({ type: 'field', ...event.data.field })
      if (event.data.type === 'select-section') setSelection({ type: 'section', ...event.data.section })
      if (event.data.type === 'section-reorder') reorderSections(event.data.sourceSection, event.data.targetSection)
      if (event.data.type === 'inline-change') queueInlineEdit(event.data.field)
      if (event.data.type === 'inline-commit') {
        queueInlineEdit(event.data.field)
        window.setTimeout(() => flushInlineDraft('✓ Inline edit saved'), 0)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  })

  useEffect(() => {
    if (frameReady && !inlineDraftRef.current) initialiseFrame()
  }, [account?.role, content, frameReady])

  useEffect(() => {
    function changed() { setBrowserFullscreen(document.fullscreenElement === workspaceRef.current) }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  useEffect(() => {
    function keyboard(event) {
      if (event.key === 'Escape') {
        if (showBlockLibrary) setShowBlockLibrary(false)
        else if (selection) setSelection(null)
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [selection, canUndo, canRedo, showBlockLibrary])

  function frameLoaded() {
    setFrameReady(false)
    setNotice('Connecting editor…')
    const target = frameRef.current?.contentWindow
    target?.postMessage({ source: 'ksj-portal-editor', type: 'ping' }, '*')
    window.setTimeout(initialiseFrame, 150)
    window.setTimeout(() => target?.postMessage({ source: 'ksj-portal-editor', type: 'ping' }, '*'), 700)
    window.clearTimeout(bridgeTimerRef.current)
    bridgeTimerRef.current = window.setTimeout(() => {
      setNotice(localDevelopment()
        ? `No editor bridge found at ${siteUrl(website, true)} — confirm that website's dev server is running.`
        : 'This live website build does not yet contain the KSJ visual editor bridge.')
    }, 3000)
  }

  async function navigateFrame(pathname) {
    if (!pathname || pathname === currentPath) return
    const saved = await flushInlineDraft('✓ Draft saved before changing page')
    if (!saved) return
    setSelection(null)
    setShowBlockLibrary(false)
    setNotice('Opening page…')
    frameRef.current?.contentWindow?.postMessage({ source: 'ksj-portal-editor', type: 'navigate', pathname }, '*')
  }

  async function navigateHistory(direction) {
    const saved = await flushInlineDraft('✓ Draft saved before changing page')
    if (!saved) return
    setSelection(null)
    setShowBlockLibrary(false)
    setNotice(direction === 'back' ? 'Going back…' : 'Going forward…')
    frameRef.current?.contentWindow?.postMessage({ source: 'ksj-portal-editor', type: direction === 'back' ? 'history-back' : 'history-forward' }, '*')
  }

  async function applyHistory(index, message) {
    if (historyBusyRef.current || index < 0 || index >= historyRef.current.length) return
    await flushInlineDraft()
    historyBusyRef.current = true
    const previousIndex = historyIndexRef.current
    const snapshot = structuredClone(historyRef.current[index])
    historyIndexRef.current = index
    updateHistoryState()
    const saved = await save(snapshot, message, { addHistory: false })
    if (!saved) {
      historyIndexRef.current = previousIndex
      updateHistoryState()
    }
    historyBusyRef.current = false
  }

  function undo() {
    if (canUndo) applyHistory(historyIndexRef.current - 1, '↶ Previous draft restored')
  }

  function redo() {
    if (canRedo) applyHistory(historyIndexRef.current + 1, '↷ Draft change restored')
  }

  function patchFrame(fieldId, value, nextContent = contentRef.current) {
    frameRef.current?.contentWindow?.postMessage({ source: 'ksj-portal-editor', type: 'patch-field', fieldId, value, rule: fieldRule(nextContent, fieldId) }, '*')
  }

  function updateSelected(value) {
    if (!selection?.fieldId || !canEditField(account, contentRef.current, selection.fieldId)) return
    const next = setPathValue(contentRef.current, selection.fieldId, value)
    patchFrame(selection.fieldId, value, next)
    save(next, '✓ Draft saved')
  }

  async function uploadSelectedImage(file) {
    if (!file || !selection?.fieldId || !websiteId || !canEditField(account, contentRef.current, selection.fieldId)) return
    setNotice('Uploading image…')
    try {
      const asset = await api.uploadAsset(website.owner || website.id, websiteId, selection.fieldId, file)
      const next = setPathValue(contentRef.current, selection.fieldId, asset.url)
      patchFrame(selection.fieldId, asset.url, next)
      await save(next, '✓ Image uploaded')
    } catch (error) {
      setNotice(error.message || 'Image upload failed')
    }
  }

  function updateRule(changes) {
    if (account?.role !== 'owner' || !selection?.fieldId) return
    const next = updateFieldRule(contentRef.current, selection.fieldId, changes)
    patchFrame(selection.fieldId, getPathValue(next, selection.fieldId), next)
    save(next, '✓ Client access updated')
  }

  function updateSelectedSection(changes) {
    if (!selection?.sectionId || !canManageSection(account, contentRef.current, selection.sectionId)) return
    const current = sectionRule(contentRef.current, selection.sectionId, selection.defaultOrder || 0)
    if (changes.removed === true && account?.role !== 'owner' && current.deletable !== true) return
    save(updateSectionRule(contentRef.current, selection.sectionId, changes), changes.hidden ? '✓ Section hidden' : '✓ Section settings saved')
  }

  function moveSelectedSection(direction) {
    if (!selection?.sectionId || !canManageSection(account, contentRef.current, selection.sectionId)) return
    const current = sectionRule(contentRef.current, selection.sectionId, selection.defaultOrder || 0)
    if (account?.role !== 'owner' && current.movable === false) return
    const step = direction === 'up' ? -10 : 10
    save(updateSectionRule(contentRef.current, selection.sectionId, { order: Number(current.order || 0) + step }), direction === 'up' ? '✓ Section moved up' : '✓ Section moved down')
  }

  async function addBlock(block, definition) {
    await flushInlineDraft('✓ Text saved before adding section')
    const key = pageKey(currentPath)
    const next = structuredClone(contentRef.current)
    next.engine = { ...(next.engine || {}) }
    next.engine.pageBlocks = { ...(next.engine.pageBlocks || {}) }
    const blocks = Array.isArray(next.engine.pageBlocks[key]) ? [...next.engine.pageBlocks[key]] : []
    blocks.push(block)
    next.engine.pageBlocks[key] = blocks
    const sectionId = `pageBlocks.${key}.${block.id}`
    const withPolicy = updateSectionRule(next, sectionId, { access: FIELD_ACCESS.EDITABLE, approvalRequired: true, movable: true, deletable: true, order: block.order, reason: '' })
    setShowBlockLibrary(false)
    setSelection({ type: 'section', sectionId, label: block.title || definition?.title || 'Section', defaultOrder: block.order })
    await save(withPolicy, `✓ ${definition?.title || 'Section'} added`)
  }

  async function duplicateSelectedBlock() {
    const details = managedBlockDetails(selection, contentRef.current)
    if (!details) return
    const rule = sectionRule(contentRef.current, selection.sectionId, selection.defaultOrder || 0)
    if (account?.role !== 'owner' && rule.access !== FIELD_ACCESS.EDITABLE) return
    await flushInlineDraft('✓ Text saved before duplicating section')
    const next = structuredClone(contentRef.current)
    const blocks = [...(next.engine?.pageBlocks?.[details.key] || [])]
    const duplicate = { ...structuredClone(details.block), id: makeId(), title: `${details.block.title || 'Section'} Copy`, order: Number(details.block.order || 0) + 5 }
    blocks.splice(details.index + 1, 0, duplicate)
    next.engine = { ...(next.engine || {}), pageBlocks: { ...(next.engine?.pageBlocks || {}), [details.key]: blocks } }
    const sectionId = `pageBlocks.${details.key}.${duplicate.id}`
    const withPolicy = updateSectionRule(next, sectionId, { access: FIELD_ACCESS.EDITABLE, approvalRequired: true, movable: true, deletable: true, order: duplicate.order, reason: '' })
    setSelection({ type: 'section', sectionId, label: duplicate.title, defaultOrder: duplicate.order })
    await save(withPolicy, '✓ Section duplicated')
  }

  async function deleteSelectedBlock() {
    const details = managedBlockDetails(selection, contentRef.current)
    if (!details) return
    const rule = sectionRule(contentRef.current, selection.sectionId, selection.defaultOrder || 0)
    if (account?.role !== 'owner' && rule.deletable !== true) return
    if (!window.confirm(`Delete “${details.block.title || 'this section'}” permanently?`)) return
    await flushInlineDraft('✓ Text saved before deleting section')
    const next = structuredClone(contentRef.current)
    const blocks = [...(next.engine?.pageBlocks?.[details.key] || [])]
    blocks.splice(details.index, 1)
    next.engine = { ...(next.engine || {}), pageBlocks: { ...(next.engine?.pageBlocks || {}), [details.key]: blocks } }
    if (next.editorPolicy?.sections) delete next.editorPolicy.sections[selection.sectionId]
    setSelection(null)
    await save(next, '✓ Section deleted')
  }

  async function submitForApproval() {
    if (!websiteId || !canRequestUpdates || submitting || submission?.type === 'success') return
    setSubmitting(true)
    setNotice('Submitting…')
    setSubmission(null)
    try {
      await flushInlineDraft('✓ Draft saved before submission')
      const result = await api.createPublishRequest({ websiteId, websiteName: website.name, repository: website.repository, title: 'Visual website edits', createdBy: account?.displayName || account?.name, contentPath: `server-data/content/${websiteId}.json` })
      setNotice('✓ Submitted for approval')
      setSubmission({
        type: 'success',
        title: result.duplicate ? 'Already waiting for review' : 'Changes submitted successfully',
        message: result.duplicate ? 'This exact draft was already submitted. No duplicate request was created.' : 'KSJ Digital can now review the exact version you submitted.',
        requestId: result.id,
      })
    } catch (error) {
      setNotice('Submission failed')
      setSubmission({ type: 'error', title: 'Could not submit changes', message: error.message || 'Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleBrowserFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await workspaceRef.current?.requestFullscreen()
  }

  function openSiteSettings() {
    location.href = client ? '/client/branding' : '/owner/branding'
  }

  return (
    <Layout client={client} title={client ? 'Edit Website' : 'Website Editor'}>
      <div ref={workspaceRef} className={`editorWorkspace ${focusMode ? 'editorFocusMode' : ''} ${selection ? 'inspectorOpen' : ''}`}>
        <header className="editorTopbar">
          <div className="editorIdentity"><button className="editorBack" onClick={() => setFocusMode(false)} aria-label="Exit focus mode">←</button><div><strong>{website?.name || 'Assigned Website'}</strong><small>{notice}</small></div>{account?.role === 'owner' && websites.length > 1 && <select value={websiteId || ''} onChange={event => setSelectedWebsiteId(event.target.value)}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select>}</div>
          <div className="editorDevices editorPageNavigator">
            <button onClick={() => navigateHistory('back')} title="Previous page">←</button>
            <button onClick={() => navigateHistory('forward')} title="Next page">→</button>
            <select aria-label="Page being edited" value={pages.some(page => page.target === currentPath) ? currentPath : ''} onChange={event => navigateFrame(event.target.value)}>
              {!pages.some(page => page.target === currentPath) && <option value="">Current: {currentPath}</option>}
              {pages.map(page => <option key={page.target} value={page.target}>{page.label}</option>)}
            </select>
            {['desktop', 'tablet', 'mobile'].map(mode => <button key={mode} className={device === mode ? 'active' : ''} onClick={() => setDevice(mode)}>{mode}</button>)}
          </div>
          <div className="editorActions">
            <button className="addSectionButton" onClick={() => { setSelection(null); setShowBlockLibrary(true) }}>＋ Add Section</button>
            <button disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button>
            <button disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">↷ Redo</button>
            {!focusMode && <button onClick={() => setFocusMode(true)}>Focus Editor</button>}
            <button onClick={openSiteSettings}>Site Settings</button>
            <button onClick={toggleBrowserFullscreen}>{browserFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
            <button onClick={() => window.open(siteUrl(website), '_blank')}>Preview</button>
            {client && canRequestUpdates && <button className="primary" disabled={submitting || submission?.type === 'success'} onClick={submitForApproval}>{submitting ? 'Submitting…' : submission?.type === 'success' ? 'Submitted' : 'Submit Changes'}</button>}
          </div>
        </header>
        <main className="editorStage">
          <div className={`editorCanvas ${device}`}>{website?.domain || website?.editorUrl || website?.previewUrl || website?.developmentEditorUrl ? <iframe key={websiteId} ref={frameRef} title={`${website.name} visual editor`} src={siteUrl(website, true)} onLoad={frameLoaded} /> : <p className="emptyState">This website does not have an editor URL configured.</p>}</div>
          {showBlockLibrary && <RegistryBlockLibrary capabilities={capabilities} pathname={currentPath} nextOrder={nextBlockOrder} onAdd={addBlock} onClose={() => setShowBlockLibrary(false)} />}
          {selection?.type === 'field' && <aside className="editorInspector"><FieldInspector account={account} content={content} selection={selection} value={selectedValue} onChange={updateSelected} onUpload={uploadSelectedImage} onRuleChange={updateRule} onClose={() => setSelection(null)} /></aside>}
          {selection?.type === 'section' && <aside className="editorInspector"><SectionInspector account={account} content={content} selection={selection} onRuleChange={updateSelectedSection} onMove={moveSelectedSection} onDuplicate={duplicateSelectedBlock} onDelete={deleteSelectedBlock} onClose={() => setSelection(null)} /></aside>}
          {submission && <div className={`editorSubmission ${submission.type}`} role="status"><button onClick={() => setSubmission(null)} aria-label="Dismiss notification">×</button><strong>{submission.title}</strong><span>{submission.message}</span>{submission.requestId && <small>Request: {submission.requestId}</small>}</div>}
        </main>
      </div>
    </Layout>
  )
}
