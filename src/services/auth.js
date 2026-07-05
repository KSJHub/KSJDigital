export const demoAccounts = [
  { id: 'owner', name: 'Morgan', role: 'owner', label: 'KSJ Digital Owner', home: '/owner', websiteAccess: 'All websites', canPublish: true, canManageClients: true },
  { id: 'admin', name: 'KSJ Admin', role: 'admin', label: 'KSJ Digital Admin', home: '/owner', websiteAccess: 'Assigned admin websites', canPublish: true, canManageClients: true },
  { id: 'client', name: 'Taj', role: 'client', label: 'TwoToneTaj Client', home: '/client', websiteAccess: 'TwoToneTaj only', canPublish: false, canManageClients: false },
  { id: 'viewer', name: 'Viewer', role: 'viewer', label: 'Read-only Viewer', home: '/client', websiteAccess: 'Assigned website only', canPublish: false, canManageClients: false },
]

export function getDemoAccount(type = 'client') {
  return demoAccounts.find(account => account.id === type) || demoAccounts[2]
}

export function canAccessOwner(account) {
  return account?.role === 'owner' || account?.role === 'admin'
}

export function canEditWebsite(account, websiteName = 'TwoToneTaj') {
  if (!account) return false
  if (account.role === 'owner' || account.role === 'admin') return true
  if (account.role === 'viewer') return false
  return account.role === 'client' && websiteName === 'TwoToneTaj'
}
