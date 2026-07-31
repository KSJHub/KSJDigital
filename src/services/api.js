const API_BASE = import.meta.env.VITE_KSJ_API_URL || 'http://localhost:4174/api'
const FORM_REVISION_LIMIT = 30
const FORM_PUBLISH_HISTORY_LIMIT = 20
const FORM_RELEASE_METADATA_HISTORY_LIMIT = 20

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `API error ${response.status}`)
  return data
}

async function currentActorLabel(fallback = 'Unknown user') {
  try {
    const account = await request('/me')
    return String(account?.displayName || account?.name || account?.id || fallback).trim().slice(0, 120) || fallback
  } catch {
    return fallback
  }
}

async function refreshStoredForms(websiteId) {
  return request(`/forms/${websiteId}`)
}

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function formRevisionSnapshot(form = {}) {
  const {
    submissions: _submissions,
    revisions: _revisions,
    publishHistory: _publishHistory,
    draftConfig: _draftConfig,
    publishedAt: _publishedAt,
    publication: _publication,
    ...config
  } = form || {}
  return cloneValue(config) || {}
}

function sameSnapshot(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {})
}

function isPublishedForm(form = {}) {
  return form.status === 'Active' || Boolean(form.publishedAt)
}

function publishHistoryRecord(snapshot, label = 'Published form', publishedAt = new Date().toISOString(), note = '', publishedBy = '') {
  return {
    id: `pub-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`,
    publishedAt,
    publishedBy: String(publishedBy || '').trim().slice(0, 120) || 'Unknown user',
    label: String(label || 'Published form').trim().slice(0, 120) || 'Published form',
    note: String(note || '').trim().slice(0, 500),
    snapshot: cloneValue(snapshot) || {},
  }
}

function collectionRollbackChanges(currentItems = [], releaseItems = [], singular = 'item') {
  const current = new Map((Array.isArray(currentItems) ? currentItems : []).filter(item => item?.id).map(item => [item.id, item]))
  const release = new Map((Array.isArray(releaseItems) ? releaseItems : []).filter(item => item?.id).map(item => [item.id, item]))
  const added = [...release.keys()].filter(id => !current.has(id)).length
  const removed = [...current.keys()].filter(id => !release.has(id)).length
  const changed = [...release.keys()].filter(id => current.has(id) && !sameSnapshot(current.get(id), release.get(id))).length
  const changes = []
  if (added) changes.push(`${added} ${singular}${added === 1 ? '' : 's'} added`)
  if (removed) changes.push(`${removed} ${singular}${removed === 1 ? '' : 's'} removed`)
  if (changed) changes.push(`${changed} ${singular}${changed === 1 ? '' : 's'} changed`)
  return changes
}

function publishReleaseComparison(current = {}, release = {}) {
  const changes = []
  if (current.name !== release.name) changes.push('Name changed')
  if (current.destination !== release.destination) changes.push('Email destination changed')
  if (current.spamProtection !== release.spamProtection) changes.push('Spam protection changed')
  if (current.successMessage !== release.successMessage) changes.push('Success message changed')
  changes.push(...collectionRollbackChanges(current.sections, release.sections, 'section'))
  changes.push(...collectionRollbackChanges(current.fields, release.fields, 'field'))
  return changes
}

function editorForm(stored = {}) {
  const draft = stored?.draftConfig && typeof stored.draftConfig === 'object' && !Array.isArray(stored.draftConfig)
    ? cloneValue(stored.draftConfig)
    : null
  const live = formRevisionSnapshot(stored)
  const editable = draft ? { ...stored, ...draft, id: stored.id } : { ...stored }
  const editableSnapshot = formRevisionSnapshot(editable)
  const publishHistory = (Array.isArray(stored.publishHistory) ? stored.publishHistory : []).map(release => {
    const attribution = release?.publishedBy ? `Published by ${release.publishedBy}` : ''
    const rollbackSource = release?.rollbackSourcePublishedAt
      ? `Rollback source: ${release.rollbackSourceLabel || 'Published form'} · ${release.rollbackSourcePublishedAt}`
      : ''
    const note = [release?.note, attribution, rollbackSource].filter(Boolean).join(' · ')
    return {
      ...release,
      note,
      comparison: isPublishedForm(stored) && release?.snapshot ? publishReleaseComparison(live, release.snapshot) : [],
    }
  })
  return {
    ...editable,
    submissions: Array.isArray(stored.submissions) ? stored.submissions : [],
    revisions: Array.isArray(stored.revisions) ? stored.revisions : [],
    publishHistory,
    publication: {
      isPublished: isPublishedForm(stored),
      publishedAt: stored.publishedAt || null,
      hasUnpublishedChanges: Boolean(draft && !sameSnapshot(live, editableSnapshot)),
      liveStatus: stored.status || 'Draft',
      liveConfig: isPublishedForm(stored) ? cloneValue(live) : null,
    },
  }
}

function editorForms(forms = []) {
  return (Array.isArray(forms) ? forms : []).map(editorForm)
}

async function refreshForms(websiteId) {
  return editorForms(await refreshStoredForms(websiteId))
}

function revisionChanges(previous = {}, next = {}) {
  const changes = []
  if (previous.name !== next.name) changes.push('Name')
  if (previous.destination !== next.destination) changes.push('Destination')
  if (previous.status !== next.status) changes.push('Status')
  if (previous.spamProtection !== next.spamProtection) changes.push('Spam protection')
  if (previous.successMessage !== next.successMessage) changes.push('Success message')
  if (JSON.stringify(previous.sections || []) !== JSON.stringify(next.sections || [])) changes.push('Sections')
  if (JSON.stringify(previous.fields || []) !== JSON.stringify(next.fields || [])) changes.push('Fields')
  return changes.length ? changes : ['Form configuration']
}

function revisionRecord(previousForm, nextForm, label = 'Saved form changes') {
  const previous = formRevisionSnapshot(previousForm)
  const next = formRevisionSnapshot(nextForm)
  return {
    id: `rev-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`,
    createdAt: new Date().toISOString(),
    label: String(label || 'Saved form changes').slice(0, 120),
    changes: revisionChanges(previous, next),
    snapshot: previous,
  }
}

function prepareStoredForm(previousStored, nextEditor, publicationAction = '', publication = {}) {
  const nextSnapshot = formRevisionSnapshot(nextEditor)
  const submissions = Array.isArray(nextEditor?.submissions)
    ? cloneValue(nextEditor.submissions)
    : Array.isArray(previousStored?.submissions) ? previousStored.submissions : []
  const revisions = Array.isArray(previousStored?.revisions) ? previousStored.revisions : []
  const publishHistory = Array.isArray(previousStored?.publishHistory) ? previousStored.publishHistory : []

  if (!previousStored) {
    return { ...nextSnapshot, submissions, revisions, publishHistory, ...(nextSnapshot.status === 'Active' ? { publishedAt: new Date().toISOString() } : {}) }
  }

  if (publicationAction === 'publish') {
    const publishedAt = new Date().toISOString()
    const liveSnapshot = { ...nextSnapshot, status: 'Active' }
    const defaultLabel = isPublishedForm(previousStored) ? 'Published form changes' : 'Initial publish'
    const releaseLabel = String(publication.releaseLabel || '').trim().slice(0, 120) || defaultLabel
    const releaseNote = String(publication.releaseNote || '').trim().slice(0, 500)
    const publishedBy = String(publication.publishedBy || '').trim().slice(0, 120)
    return {
      ...liveSnapshot,
      submissions,
      revisions,
      publishHistory: [publishHistoryRecord(liveSnapshot, releaseLabel, publishedAt, releaseNote, publishedBy), ...publishHistory].slice(0, FORM_PUBLISH_HISTORY_LIMIT),
      publishedAt,
    }
  }

  if (publicationAction === 'unpublish') {
    const { publishedAt: _publishedAt, draftConfig: _draftConfig, ...rest } = previousStored
    return { ...rest, ...nextSnapshot, submissions, revisions, publishHistory }
  }

  if (!isPublishedForm(previousStored)) {
    const { draftConfig: _draftConfig, publication: _publication, ...rest } = previousStored
    return { ...rest, ...nextSnapshot, submissions, revisions, publishHistory }
  }

  const liveSnapshot = formRevisionSnapshot(previousStored)
  if (sameSnapshot(liveSnapshot, nextSnapshot)) {
    const { draftConfig: _draftConfig, publication: _publication, ...rest } = previousStored
    return { ...rest, submissions, revisions, publishHistory }
  }

  return {
    ...previousStored,
    submissions,
    revisions,
    publishHistory,
    draftConfig: nextSnapshot,
  }
}

async function persistFormsWithRevisions(websiteId, previousStoredForms, nextEditorForms, label, publication = {}) {
  const previousById = new Map((Array.isArray(previousStoredForms) ? previousStoredForms : []).filter(form => form?.id).map(form => [form.id, form]))
  const prepared = (Array.isArray(nextEditorForms) ? nextEditorForms : []).map(nextEditor => {
    const previousStored = previousById.get(nextEditor?.id)
    const previousEditor = previousStored ? editorForm(previousStored) : null
    const action = publication.formId === nextEditor?.id ? publication.action || '' : ''
    const stored = prepareStoredForm(previousStored, nextEditor, action, publication)
    const revisions = Array.isArray(previousStored?.revisions) ? previousStored.revisions : []
    const changed = previousEditor && !sameSnapshot(formRevisionSnapshot(previousEditor), formRevisionSnapshot(nextEditor))
    stored.revisions = changed
      ? [revisionRecord(previousEditor, nextEditor, label), ...revisions].slice(0, FORM_REVISION_LIMIT)
      : revisions.slice(0, FORM_REVISION_LIMIT)
    return stored
  })
  await request(`/forms/${websiteId}`, { method: 'PUT', body: JSON.stringify({ forms: prepared }) })
  return editorForms(prepared)
}

async function saveEditorForms(websiteId, nextForms, label = 'Saved form changes', publication = {}) {
  const previousStored = await refreshStoredForms(websiteId)
  return persistFormsWithRevisions(websiteId, previousStored, nextForms, label, publication)
}

async function updateEditorForm(websiteId, formId, updater, label, publication = {}) {
  const forms = await refreshForms(websiteId)
  const next = forms.map(form => form.id === formId ? updater(form) : form)
  return saveEditorForms(websiteId, next, label, publication)
}

async function discardStoredFormDraft(websiteId, formId) {
  const storedForms = await refreshStoredForms(websiteId)
  const stored = storedForms.find(item => item?.id === formId)
  if (!stored) throw new Error('Form not found')
  if (!stored.draftConfig || typeof stored.draftConfig !== 'object' || Array.isArray(stored.draftConfig)) return editorForms(storedForms)

  const { draftConfig: discardedDraft, ...live } = stored
  const revision = {
    id: `rev-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`,
    createdAt: new Date().toISOString(),
    label: 'Discarded unpublished draft',
    changes: ['Discarded draft'],
    snapshot: cloneValue(discardedDraft),
  }
  const next = storedForms.map(item => item?.id === formId
    ? { ...live, submissions: Array.isArray(stored.submissions) ? stored.submissions : [], revisions: [revision, ...(Array.isArray(stored.revisions) ? stored.revisions : [])].slice(0, FORM_REVISION_LIMIT), publishHistory: Array.isArray(stored.publishHistory) ? stored.publishHistory : [] }
    : item)
  await request(`/forms/${websiteId}`, { method: 'PUT', body: JSON.stringify({ forms: next }) })
  return editorForms(next)
}

async function updateStoredFormPublishDetails(websiteId, formId, publishId, details = {}) {
  const storedForms = await refreshStoredForms(websiteId)
  const stored = storedForms.find(item => item?.id === formId)
  if (!stored) throw new Error('Form not found')
  const publishHistory = Array.isArray(stored.publishHistory) ? stored.publishHistory : []
  const release = publishHistory.find(item => item?.id === publishId)
  if (!release) throw new Error('Published form version not found')
  const label = String(details?.label || '').trim().slice(0, 120) || 'Published form'
  const note = String(details?.note || '').trim().slice(0, 500)
  if (release.label === label && (release.note || '') === note) return editorForms(storedForms)
  const metadataEditedAt = new Date().toISOString()
  const metadataEditedBy = String(details?.editedBy || '').trim().slice(0, 120) || 'Unknown user'
  const metadataEntry = {
    editedAt: metadataEditedAt,
    editedBy: metadataEditedBy,
    previousLabel: String(release.label || 'Published form').slice(0, 120),
    previousNote: String(release.note || '').slice(0, 500),
    newLabel: label,
    newNote: note,
  }
  const next = storedForms.map(item => item?.id === formId
    ? {
        ...item,
        publishHistory: publishHistory.map(entry => entry?.id === publishId
          ? { ...entry, label, note, metadataEditedAt, metadataEditedBy, metadataHistory: [metadataEntry, ...(Array.isArray(entry.metadataHistory) ? entry.metadataHistory : [])].slice(0, FORM_RELEASE_METADATA_HISTORY_LIMIT) }
          : entry),
      }
    : item)
  await request(`/forms/${websiteId}`, { method: 'PUT', body: JSON.stringify({ forms: next }) })
  return editorForms(next)
}

async function rollbackStoredFormPublish(websiteId, formId, publishId, details = {}) {
  const storedForms = await refreshStoredForms(websiteId)
  const stored = storedForms.find(item => item?.id === formId)
  if (!stored) throw new Error('Form not found')
  const publishHistory = Array.isArray(stored.publishHistory) ? stored.publishHistory : []
  const release = publishHistory.find(item => item?.id === publishId)
  if (!release?.snapshot) throw new Error('Published form version not found')

  const publishedAt = new Date().toISOString()
  const rolledBackSnapshot = { ...cloneValue(release.snapshot), id: stored.id, status: 'Active' }
  if (sameSnapshot(formRevisionSnapshot(stored), rolledBackSnapshot)) throw new Error('Selected published version already matches Current Live')
  const submissions = Array.isArray(stored.submissions) ? stored.submissions : []
  const revisions = Array.isArray(stored.revisions) ? stored.revisions : []
  const existingDraft = stored?.draftConfig && typeof stored.draftConfig === 'object' && !Array.isArray(stored.draftConfig) ? cloneValue(stored.draftConfig) : null
  const rolledBackBy = String(details?.rolledBackBy || '').trim().slice(0, 120)
  const rollbackRelease = publishHistoryRecord(
    rolledBackSnapshot,
    `Rollback to ${release.label || 'published version'}`,
    publishedAt,
    `Restored the Live form to the release published ${release.publishedAt || 'previously'}.`,
    rolledBackBy,
  )
  rollbackRelease.rollbackSourceId = release.id
  rollbackRelease.rollbackSourcePublishedAt = release.publishedAt || null
  rollbackRelease.rollbackSourceLabel = release.label || 'Published form'
  const next = storedForms.map(item => item?.id === formId
    ? {
        ...rolledBackSnapshot,
        submissions,
        revisions,
        publishHistory: [rollbackRelease, ...publishHistory].slice(0, FORM_PUBLISH_HISTORY_LIMIT),
        publishedAt,
        ...(existingDraft ? { draftConfig: existingDraft } : {}),
      }
    : item)
  await request(`/forms/${websiteId}`, { method: 'PUT', body: JSON.stringify({ forms: next }) })
  return editorForms(next)
}

function nextFieldId(fields = [], type = 'field') {
  const base = String(type || 'field').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'field'
  const ids = new Set(fields.map(field => String(field?.id || '')))
  if (!ids.has(base)) return base
  let index = 2
  while (ids.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

export const api = {
  health: () => request('/health'),
  login: payload => request('/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request('/logout', { method: 'POST', body: JSON.stringify({}) }),
  me: () => request('/me'),
  sessionAccess: () => request('/session-access'),
  getWebsites: () => request('/websites'),
  createWebsite: payload => request('/websites', { method: 'POST', body: JSON.stringify(payload) }),
  updateWebsite: (id, payload) => request(`/websites/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWebsite: id => request(`/websites/${id}`, { method: 'DELETE' }),
  getClients: () => request('/clients'),
  createClient: payload => request('/clients', { method: 'POST', body: JSON.stringify(payload) }),
  updateClient: (id, payload) => request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteClient: id => request(`/clients/${id}`, { method: 'DELETE' }),
  getTeam: () => request('/team'),
  createTeamMember: payload => request('/team', { method: 'POST', body: JSON.stringify(payload) }),
  updateTeamMember: (id, payload) => request(`/team/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTeamMember: id => request(`/team/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  storage: ownerId => request(`/storage/${ownerId}`),
  assets: (ownerId, websiteId) => request(`/assets/${ownerId}/${websiteId}`),
  uploadAsset: (ownerId, websiteId, slotId, file) => { const body = new FormData(); body.append('file', file); return request(`/assets/${ownerId}/${websiteId}/${slotId}`, { method: 'POST', body }) },
  deleteLegacyAsset: (ownerId, websiteId, assetId) => request(`/asset-library/legacy/${encodeURIComponent(ownerId)}/${encodeURIComponent(websiteId)}/${encodeURIComponent(assetId)}`, { method: 'DELETE' }),
  getComponents: () => request('/content/components'),
  getContent: websiteId => request(`/content/${websiteId}`),
  saveContent: (websiteId, content) => request(`/content/${websiteId}`, { method: 'PUT', body: JSON.stringify(content) }),
  getArticles: websiteId => request(`/cms/${encodeURIComponent(websiteId)}`),
  createArticle: (websiteId, payload = {}) => request(`/cms/${encodeURIComponent(websiteId)}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateArticle: (websiteId, articleId, payload) => request(`/cms/${encodeURIComponent(websiteId)}/${encodeURIComponent(articleId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  transitionArticle: (websiteId, articleId, transitionId, payload = {}) => request(`/cms/${encodeURIComponent(websiteId)}/${encodeURIComponent(articleId)}/transitions/${encodeURIComponent(transitionId)}`, { method: 'POST', body: JSON.stringify(payload) }),
  restoreArticleRevision: (websiteId, articleId, revisionId) => request(`/cms/${encodeURIComponent(websiteId)}/${encodeURIComponent(articleId)}/restore/${encodeURIComponent(revisionId)}`, { method: 'POST', body: JSON.stringify({}) }),
  deleteArticle: (websiteId, articleId) => request(`/cms/${encodeURIComponent(websiteId)}/${encodeURIComponent(articleId)}`, { method: 'DELETE' }),
  getCommerceSettings: websiteId => request(`/commerce-settings/${websiteId}`),
  getCommerceReadiness: websiteId => request(`/commerce-settings/${websiteId}/readiness`),
  saveCommerceSettings: (websiteId, settings) => request(`/commerce-settings/${websiteId}`, { method: 'PUT', body: JSON.stringify(settings) }),
  createBasketCheckout: (provider, payload) => request(`/checkout/basket/${provider}`, { method: 'POST', body: JSON.stringify(payload) }),
  getForms: refreshForms,
  getPublicForms: websiteId => request(`/public/forms/${encodeURIComponent(websiteId)}`),
  getPublicFormConfig: websiteId => request(`/public/form-config/${encodeURIComponent(websiteId)}`),
  submitPublicForm: (websiteId, formId, payload) => request(`/public/forms/${encodeURIComponent(websiteId)}/${encodeURIComponent(formId)}/submissions`, { method: 'POST', body: payload instanceof FormData ? payload : JSON.stringify(payload) }),
  getFormDeliveryStatuses: (websiteId, formId) => request(`/notifications/form-deliveries?websiteId=${encodeURIComponent(websiteId)}&formId=${encodeURIComponent(formId)}`),
  formAttachmentUrl: (websiteId, formId, submissionId, attachmentId) => `${API_BASE}/forms/${encodeURIComponent(websiteId)}/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}/attachments/${encodeURIComponent(attachmentId)}`,
  getEmailReadiness: () => request('/notifications/email-readiness'),
  sendEmailTest: to => request('/notifications/email-test', { method: 'POST', body: JSON.stringify({ to }) }),
  saveForms: (websiteId, forms, label = 'Saved form changes') => saveEditorForms(websiteId, forms, label),
  createForm: async (websiteId, payload = {}) => {
    const form = await request(`/forms/${websiteId}`, { method: 'POST', body: JSON.stringify(payload) })
    const forms = await refreshForms(websiteId)
    return { form: forms.find(item => item.id === form.id) || editorForm(form), forms }
  },
  updateForm: async (websiteId, formId, payload = {}) => {
    const hasStatus = Object.prototype.hasOwnProperty.call(payload, 'status')
    if (hasStatus && payload.status === 'Active') throw new Error('Use Publish Form or Publish Changes to make a form live')
    const action = hasStatus && ['Draft', 'Archived'].includes(payload.status) ? 'unpublish' : ''
    return updateEditorForm(
      websiteId,
      formId,
      form => ({ ...form, ...payload }),
      action === 'unpublish' ? `Changed form status to ${payload.status}` : 'Updated form settings',
      action ? { formId, action } : {},
    )
  },
  publishForm: async (websiteId, formId, release = {}) => {
    const publishedBy = String(release?.publishedBy || '').trim().slice(0, 120) || await currentActorLabel()
    return updateEditorForm(
      websiteId,
      formId,
      form => ({ ...form, status: 'Active' }),
      'Published form changes',
      {
        formId,
        action: 'publish',
        releaseLabel: String(release?.label || '').trim().slice(0, 120),
        releaseNote: String(release?.note || '').trim().slice(0, 500),
        publishedBy,
      },
    )
  },
  updateFormPublishDetails: (websiteId, formId, publishId, details = {}) => updateStoredFormPublishDetails(websiteId, formId, publishId, details),
  rollbackFormPublish: async (websiteId, formId, publishId, details = {}) => {
    const rolledBackBy = String(details?.rolledBackBy || '').trim().slice(0, 120) || await currentActorLabel()
    return rollbackStoredFormPublish(websiteId, formId, publishId, { ...details, rolledBackBy })
  },
  discardFormDraft: (websiteId, formId) => discardStoredFormDraft(websiteId, formId),
  deleteForm: async (websiteId, formId) => {
    await request(`/forms/${websiteId}/${formId}`, { method: 'DELETE' })
    return refreshForms(websiteId)
  },
  addField: (websiteId, formId, payload = {}) => updateEditorForm(
    websiteId,
    formId,
    form => {
      const fields = Array.isArray(form.fields) ? form.fields : []
      const type = payload.type || 'Text'
      const field = {
        id: payload.id || nextFieldId(fields, type),
        label: payload.label || type,
        type,
        required: payload.required === true,
        placeholder: payload.placeholder || '',
      }
      return { ...form, fields: [...fields, field] }
    },
    'Added form field',
  ),
  updateField: (websiteId, formId, fieldId, payload) => updateEditorForm(
    websiteId,
    formId,
    form => ({ ...form, fields: (Array.isArray(form.fields) ? form.fields : []).map(field => field.id === fieldId ? { ...field, ...payload } : field) }),
    'Updated form field',
  ),
  deleteField: (websiteId, formId, fieldId) => updateEditorForm(
    websiteId,
    formId,
    form => ({ ...form, fields: (Array.isArray(form.fields) ? form.fields : []).filter(field => field.id !== fieldId) }),
    'Removed form field',
  ),
  moveField: (websiteId, formId, fieldId, direction) => updateEditorForm(
    websiteId,
    formId,
    form => {
      const fields = [...(Array.isArray(form.fields) ? form.fields : [])]
      const index = fields.findIndex(field => field.id === fieldId)
      const target = direction === 'up' ? index - 1 : index + 1
      if (index >= 0 && target >= 0 && target < fields.length) [fields[index], fields[target]] = [fields[target], fields[index]]
      return { ...form, fields }
    },
    'Reordered form fields',
  ),
  createFormRestorePoint: async (websiteId, formId, label = 'Manual restore point') => {
    const storedForms = await refreshStoredForms(websiteId)
    const stored = storedForms.find(item => item.id === formId)
    if (!stored) throw new Error('Form not found')
    const form = editorForm(stored)
    const revision = {
      id: `rev-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`,
      createdAt: new Date().toISOString(),
      label: String(label || 'Manual restore point').slice(0, 120),
      changes: ['Manual restore point'],
      snapshot: formRevisionSnapshot(form),
    }
    const next = storedForms.map(item => item.id === formId ? { ...item, revisions: [revision, ...(Array.isArray(item.revisions) ? item.revisions : [])].slice(0, FORM_REVISION_LIMIT) } : item)
    await request(`/forms/${websiteId}`, { method: 'PUT', body: JSON.stringify({ forms: next }) })
    return editorForms(next)
  },
  restoreFormRevision: async (websiteId, formId, revisionId) => {
    const storedForms = await refreshStoredForms(websiteId)
    const stored = storedForms.find(item => item.id === formId)
    if (!stored) throw new Error('Form not found')
    const revision = (Array.isArray(stored.revisions) ? stored.revisions : []).find(item => item.id === revisionId)
    if (!revision?.snapshot) throw new Error('Form revision not found')
    const forms = editorForms(storedForms)
    const next = forms.map(form => form.id === formId
      ? { ...form, ...cloneValue(revision.snapshot), id: form.id, submissions: form.submissions, revisions: form.revisions, publishHistory: form.publishHistory }
      : form)
    return persistFormsWithRevisions(websiteId, storedForms, next, `Restored ${revision.label || 'form revision'}`)
  },
  submitTestForm: async (websiteId, formId) => {
    await request(`/forms/${websiteId}/${formId}/test-submission`, { method: 'POST', body: JSON.stringify({}) })
    return refreshForms(websiteId)
  },
  getOrders: () => request('/orders'),
  getOrder: id => request(`/orders/${id}`),
  getInventory: websiteId => request(`/inventory/${encodeURIComponent(websiteId)}`),
  invoiceUrl: id => `${API_BASE}/orders/${encodeURIComponent(id)}/invoice`,
  updateOrderStatus: (id, payload) => request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
  refundOrder: (id, payload) => request(`/order-refunds/${id}`, { method: 'POST', body: JSON.stringify(payload) }),
  purgeTestOrders: (websiteId = '') => request('/orders/test-data', { method: 'DELETE', body: JSON.stringify({ websiteId }) }),
  getTickets: () => request('/support/tickets'),
  createTicket: payload => request('/support/tickets', { method: 'POST', body: JSON.stringify(payload) }),
  updateTicket: (id, payload) => request(`/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  replyTicket: (id, payload) => request(`/support/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify(payload) }),
  getPublishRequests: () => request('/publish/requests'),
  getPublishRequestReview: id => request(`/publish/requests/${id}/review`),
  createPublishRequest: payload => request('/publish/requests', { method: 'POST', body: JSON.stringify(payload) }),
  approvePublishRequest: id => request(`/publish/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  rejectPublishRequest: (id, reason = '') => request(`/publish/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getPublishHistory: () => request('/publish/history'),
  getPublishHistoryReview: id => request(`/publish/history/${id}/review`),
  rollbackPublishHistory: id => request(`/publish/history/${id}/rollback`, { method: 'POST', body: JSON.stringify({}) }),
}
