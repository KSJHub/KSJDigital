const ownerWorkspace = {
  home: { path: '/owner', label: 'Dashboard', group: 'Overview' },
  websites: { path: '/owner/websites', label: 'Websites', group: 'Overview' },
  clients: { path: '/owner/clients', label: 'Website Access', group: 'Overview' },
  editor: { path: '/owner/editor', label: 'Website Editor', group: 'Website Management' },
  branding: { path: '/owner/branding', label: 'Branding', group: 'Website Management' },
  forms: { path: '/owner/forms', label: 'Forms', group: 'Website Management' },
  merch: { path: '/owner/merch', label: 'Merch', group: 'Website Management' },
  inventory: { path: '/owner/inventory', label: 'Inventory', group: 'Commerce' },
  orders: { path: '/owner/orders', label: 'Orders', group: 'Commerce' },
  commerce: { path: '/owner/commerce', label: 'Payments', group: 'Commerce' },
  'checkout-test': { path: '/owner/checkout-test', label: 'Checkout Test', group: 'Commerce' },
  'publish-requests': { path: '/owner/publish-requests', label: 'Approvals', group: 'Operations' },
  support: { path: '/owner/support', label: 'Support', group: 'Operations' },
  operations: { path: '/owner/operations', label: 'Operations', group: 'Operations' },
  settings: { path: '/owner/settings', label: 'Settings', group: 'Operations' },
}

const clientWorkspace = {
  home: { path: '/client', label: 'Home', group: 'My Website' },
  editor: { path: '/client/editor', label: 'Edit Website', group: 'My Website', any: ['canEdit'] },
  branding: { path: '/client/branding', label: 'Header, Footer & Brand', group: 'My Website', any: ['canManageMedia', 'canManagePages'] },
  media: { path: '/client/media', label: 'Media', group: 'My Website', any: ['canManageMedia'] },
  forms: { path: '/client/forms', label: 'Forms', group: 'My Website', any: ['canEdit'] },
  merch: { path: '/client/merch', label: 'Products', group: 'Business', any: ['canEdit'] },
  inventory: { path: '/client/inventory', label: 'Stock', group: 'Business', any: ['canEdit'] },
  orders: { path: '/client/orders', label: 'Orders', group: 'Business', any: ['canEdit'] },
  commerce: { path: '/client/commerce', label: 'Payments', group: 'Business', any: ['canEdit'] },
  team: { path: '/client/team', label: 'Team', group: 'Account' },
  publish: { path: '/client/publish', label: 'Website Updates', group: 'Account', any: ['canRequestUpdates'] },
  support: { path: '/client/support', label: 'Help', group: 'Account', any: ['canViewSupport'] },
  settings: { path: '/client/settings', label: 'Settings', group: 'Account' },
}

function allowedByRule(account, rule = {}) {
  if (!account) return false
  if (account.role === 'owner') return true
  if (!rule.any?.length) return true
  return rule.any.some(permission => account[permission] === true)
}

export function canAccessClientWorkspace(account, type) {
  const rule = clientWorkspace[type]
  return Boolean(rule && allowedByRule(account, rule))
}

export function workspaceGroups({ client = false, account = null } = {}) {
  const source = client ? clientWorkspace : ownerWorkspace
  const groups = []

  Object.entries(source).forEach(([type, rule]) => {
    if (client && !allowedByRule(account, rule)) return
    let group = groups.find(item => item.label === rule.group)
    if (!group) {
      group = { label: rule.group, items: [] }
      groups.push(group)
    }
    group.items.push({ type, path: rule.path, label: rule.label })
  })

  return groups
}

export function defaultWorkspacePath(account) {
  return account?.role === 'owner' ? '/owner' : '/client'
}
