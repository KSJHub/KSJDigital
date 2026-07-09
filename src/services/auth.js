import { api } from './api.js'

const SESSION_KEY = 'ksjDigitalSession'

function cacheSession(account) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(account))
  return account
}

export async function signIn(email, password) {
  try {
    const result = await api.login({ email, password })
    return { account: cacheSession(result.account) }
  } catch (error) {
    return { error: error.message || 'Email or password is incorrect.' }
  }
}

export async function signOut() {
  try {
    await api.logout()
  } catch {
    // The local portal session should still be cleared even if the API is unavailable.
  }

  localStorage.removeItem(SESSION_KEY)
  location.href = '/login'
}

export async function refreshSession() {
  try {
    const result = await api.me()
    return cacheSession(result.account)
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function switchAccount() {
  return null
}

export function getAccount() {
  return getCurrentAccount()
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
