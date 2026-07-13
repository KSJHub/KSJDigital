import { api } from './api.js'

let currentAccount = null

function normaliseAccount(value) {
  const account = value?.account || value
  if (!account || typeof account !== 'object') return null

  const role = String(account.role || '').trim().toLowerCase()
  const websiteIds = Array.isArray(account.websiteIds)
    ? account.websiteIds
    : account.websiteId
      ? [account.websiteId]
      : []

  return {
    ...account,
    role,
    websiteIds,
    websiteAccess: account.websiteAccess || websiteIds,
    home: account.home || (role === 'owner' ? '/owner' : '/client'),
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
    const result = await api.me()
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
  return account?.role === 'owner'
}

export function canEditWebsite(account, websiteName = 'TwoToneTaj') {
  if (!account) return false
  if (account.role === 'owner') return true
  return account.websiteAccess?.includes(websiteName)
}

export function getPermissionSummary(account = {}) {
  return {
    role: account.role || 'guest',
    access: account.websiteAccess || 'No website assigned',
    edit: account.canEdit ? 'Website editing enabled' : 'View only',
    publish: account.canPublish ? 'Final approval enabled' : 'Requests approval',
  }
}
