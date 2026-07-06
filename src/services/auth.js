const SESSION_KEY = 'ksjDigitalSession'

export const accounts = [
  { id: 'owner', email: 'ksj@ksjdigital.co.uk', password: 'ksj123', name: 'Morgan', role: 'owner', label: 'KSJ Digital', home: '/owner', websiteAccess: 'All websites', canPublish: true, canManageClients: true, canEdit: true },
  { id: 'twotonetaj', email: 'taj@twotonetaj.com', password: 'taj123', name: 'Taj', role: 'client', label: 'TwoToneTaj', home: '/client', websiteId: 'twotonetaj', websiteAccess: 'TwoToneTaj website', canPublish: false, canManageClients: false, canEdit: true },
]

export function signIn(email, password) {
  const account = accounts.find(user => user.email.toLowerCase() === email.toLowerCase() && user.password === password)
  if (!account) return { error: 'Email or password is incorrect.' }
  const { password: _password, ...session } = account
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return { account: session }
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY)
  location.href = '/login'
}

export function switchAccount(id) {
  const account = accounts.find(user => user.id === id)
  if (!account) return null
  const { password: _password, ...session } = account
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  location.href = session.home
  return session
}

export function getAccount(type = 'client') {
  const account = accounts.find(user => user.id === type || user.role === type) || accounts[1]
  const { password: _password, ...session } = account
  return session
}

export function getCurrentAccount() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    return session || null
  } catch {
    return null
  }
}

export function getAccountFromPath() {
  return getCurrentAccount()
}

export function requireAccount() {
  return getCurrentAccount()
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
