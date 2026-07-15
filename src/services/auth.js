import { api } from './api.js'

let currentAccount = null

function normaliseAccount(value) {
  const account = value?.account || value
  if (!account || typeof account !== 'object') return null

  const role = String(account.role || '').trim().toLowerCase()
  const platformOwner = role === 'owner' && account.id === 'morgan'
  const websiteIds = Array.isArray(account.websiteIds)
    ? account.websiteIds
    : account.websiteId
      ? [account.websiteId]
      : []
  const displayName = platformOwner ? 'KSJ Digital' : (account.displayName || account.name)

  return {
    ...account,
    name: displayName,
    displayName,
    role,
    roleLabel: platformOwner ? 'Platform Owner' : (account.roleLabel || 'Website Owner'),
    websiteIds,
    websiteAccess: websiteIds,
    home: platformOwner ? '/owner' : '/client',
  }
}

function setCurrentAccount(account) {
  currentAccount = normaliseAccount(account)
  return currentAccount
}

export async function signIn(email, password) {
  try {
    const result = await api.login({ email, password })
    const account = setCurrentAccount(result)
    if (!account) throw new Error('Login response did not contain an account')
    return { account }
  } catch (error) {
    return { error: error.message || 'Email or password is incorrect.' }
  }
}

export async function signOut() {
  try {
    await api.logout()
  } catch {
    // The portal should still leave the protected area even if the API is unavailable.
  }

  setCurrentAccount(null)
  location.href = '/login'
}

export async function refreshSession() {
  try {
    const result = await api.sessionAccess()
    return setCurrentAccount(result)
  } catch {
    return setCurrentAccount(null)
  }
}

export function getAccount() {
  return currentAccount
}

export function getCurrentAccount() {
  return currentAccount
}

export function getAccountFromPath() {
  return currentAccount
}

export function requireAccount() {
  return currentAccount
}

export function canAccessOwner(account) {
  return account?.role === 'owner' && account?.id === 'morgan'
}

export function canEditWebsite(account, website) {
  if (!account || !website) return false
  const allowed = new Set((account.websiteIds || []).map(String))
  return allowed.has(String(website.id))
}

export function getPermissionSummary(account = {}) {
  const websites = Array.isArray(account.websiteIds) ? account.websiteIds : []
  return {
    role: account.roleLabel || 'Guest',
    access: websites.length ? websites.join(', ') : 'No website assigned',
    edit: account.canEdit ? 'Website editing enabled' : 'View only',
    pages: account.canManagePages ? 'Page management enabled' : 'Page management disabled',
    publish: account.role === 'owner' ? 'Platform approval enabled' : 'Changes require approval',
  }
}
