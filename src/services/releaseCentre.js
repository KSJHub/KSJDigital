export function getReleaseState() {
  return {
    version: '0.3.0',
    status: 'In Progress',
    lastCheck: new Date().toLocaleString(),
    checks: [
      ['Portal Navigation', 'Ready', 'Owner and client workspaces routed'],
      ['Client Access', 'In Progress', 'Server sessions active; route middleware hardening next'],
      ['Brand Centre', 'Ready', 'Brand assets now use the API asset store'],
      ['Page Builder', 'Ready', 'Pages and blocks save through content API'],
      ['CMS Engine', 'Ready', 'Navigation, theme, globals, SEO and config save through content API'],
      ['Media Library', 'Ready', 'Uploads and asset listing now use the API asset store'],
      ['Form Builder', 'Ready', 'Forms and fields now use server-data through API'],
      ['Publishing', 'In Progress', 'Request, review and history workflow active; GitHub deployment next'],
      ['Operations', 'In Progress', 'Browser backups removed; server backup module next'],
      ['API Server', 'Ready', 'Node API and server-data storage active'],
    ],
  }
}

export function runReleaseCheck() {
  return getReleaseState()
}

export function getCompletionSummary() {
  const state = getReleaseState()
  const ready = state.checks.filter(item => item[1] === 'Ready').length
  const total = state.checks.length

  return {
    ready,
    total,
    percent: Math.round((ready / total) * 100),
  }
}
