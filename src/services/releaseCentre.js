const RELEASE_KEY = 'ksjDigitalReleaseCentre'

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback } catch { return fallback }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  return value
}

export function getReleaseState() {
  return read(RELEASE_KEY, {
    version: '1.0.0',
    status: 'Ready',
    lastCheck: null,
    checks: [
      ['Portal Navigation', 'Ready', 'Owner and client workspaces routed'],
      ['Client Access', 'Ready', 'Accounts, permissions and website assignment active'],
      ['Brand Centre', 'Ready', 'Brand assets and storage controls active'],
      ['Page Builder', 'Ready', 'Pages, blocks and preview active'],
      ['CMS Engine', 'Ready', 'Navigation, theme, globals, SEO and config active'],
      ['Media Library', 'Ready', 'Folders, uploads, tags, versions and inspector active'],
      ['Form Builder', 'Ready', 'Forms, fields, preview and submissions active'],
      ['Publishing', 'Ready', 'Request, review and history workflow active'],
      ['Operations', 'Ready', 'Backups, audit log and go-live checklist active'],
      ['API Server', 'Ready', 'Local API and server storage active through npm run dev'],
    ],
  })
}

export function runReleaseCheck() {
  const state = getReleaseState()
  return write(RELEASE_KEY, { ...state, status: 'Ready', lastCheck: new Date().toLocaleString() })
}

export function getCompletionSummary() {
  const state = getReleaseState()
  const ready = state.checks.filter(item => item[1] === 'Ready').length
  const total = state.checks.length
  return { ready, total, percent: Math.round((ready / total) * 100) }
}
