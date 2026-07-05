const accounts = [
  { id: 'owner', name: 'Morgan', role: 'owner', label: 'KSJ Digital Owner', home: '/owner', websiteAccess: 'All websites', canPublish: true, canManageClients: true, canEdit: true },
  { id: 'client', name: 'Taj', role: 'client', label: 'TwoToneTaj', home: '/client', websiteAccess: 'TwoToneTaj website', canPublish: false, canManageClients: false, canEdit: true },
]

export function getAccount(type = 'client') {
  return accounts.find(account => account.id === type) || accounts[1]
}

export function getAccountFromPath() {
  if (location.pathname.startsWith('/owner')) return getAccount('owner')
  return getAccount('client')
}

export function canAccessOwner(account) {
  return account?.role === 'owner'
}

export function canEditWebsite(account, websiteName = 'TwoToneTaj') {
  if (!account) return false
  if (account.role === 'owner') return true
  return account.role === 'client' && websiteName === 'TwoToneTaj'
}

export function getPermissionSummary(account) {
  return {
    role: account.role,
    access: account.websiteAccess,
    edit: account.canEdit ? 'Website editing enabled' : 'View only',
    publish: account.canPublish ? 'Final approval enabled' : 'Requests approval',
  }
}
