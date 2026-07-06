import { getClients, getOwnerWebsites } from './platform.js'

const SESSION_KEY = 'ksjDigitalSession'

function buildSession(account) {
  const websites = getOwnerWebsites()
  const role = account.role?.toLowerCase() === 'owner' ? 'owner' : 'client'
  const websiteIds = role === 'owner' ? websites.map(site => site.id) : account.websiteIds || []
  const websiteAccess = role === 'owner' ? 'All websites' : websiteIds.map(id => websites.find(site => site.id === id)?.name).filter(Boolean).join(', ') || 'No website assigned'
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role,
    label: role === 'owner' ? 'KSJ Digital' : account.websiteName || account.name,
    home: role === 'owner' ? '/owner' : '/client',
    websiteId: websiteIds[0],
    websiteIds,
    websiteAccess,
    canPublish: role === 'owner',
    canManageClients: role === 'owner',
    canEdit: !!account.canEdit,
    canManageMedia: !!account.canManageMedia,
    canRequestUpdates: !!account.canRequestUpdates,
    canViewSupport: !!account.canViewSupport,
  }
}

export function signIn(email, password) {
  const account = getClients().find(user => user.email?.toLowerCase() === email.toLowerCase() && user.password === password && user.status !== 'Suspended')
  if (!account) return { error: 'Email or password is incorrect.' }
  const session = buildSession(account)
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return { account: session }
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY)
  location.href = '/login'
}

export function switchAccount(id) {
  const account = getClients().find(user => user.id === id)
  if (!account) return null
  const session = buildSession(account)
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  location.href = session.home
  return session
}

export function getAccount(type = 'client') {
  const account = getClients().find(user => user.id === type || user.role?.toLowerCase() === type) || getClients()[0]
  return buildSession(account)
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
  return account.websiteAccess.includes(websiteName)
}

export function getPermissionSummary(account) {
  return {
    role: account.role,
    access: account.websiteAccess,
    edit: account.canEdit ? 'Website editing enabled' : 'View only',
    publish: account.canPublish ? 'Final approval enabled' : 'Requests approval',
  }
}
