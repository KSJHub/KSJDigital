const DRAFT_KEY = 'ksjDigitalDemoDraft'
const REQUEST_KEY = 'ksjDigitalDemoPublishRequest'

export function getInitialDraft(fields) {
  const defaultDraft = {
    values: Object.fromEntries(fields.map(field => [field.key, field.value])),
    status: 'Clean',
    updatedAt: 'Not saved yet',
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null')
    return saved?.values ? saved : defaultDraft
  } catch {
    return defaultDraft
  }
}

export function saveDraft(values) {
  const draft = {
    values,
    status: 'Draft saved',
    updatedAt: new Date().toLocaleString(),
  }
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  return draft
}

export function clearDraft(fields) {
  window.localStorage.removeItem(DRAFT_KEY)
  return {
    values: Object.fromEntries(fields.map(field => [field.key, field.value])),
    status: 'Clean',
    updatedAt: 'Not saved yet',
  }
}

export function createPublishRequest(values) {
  const request = {
    id: 'demo-request',
    website: 'TwoToneTaj',
    title: 'Homepage content update',
    status: 'Pending Review',
    requester: 'Taj',
    updatedAt: new Date().toLocaleString(),
    values,
  }
  window.localStorage.setItem(REQUEST_KEY, JSON.stringify(request))
  return request
}
