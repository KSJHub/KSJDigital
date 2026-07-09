import { api } from './api.js'

export async function syncWebsitesFromServer() {
  const websites = await api.getWebsites()
  window.dispatchEvent(new CustomEvent('ksj-websites-updated', { detail: websites }))
  return websites
}

export function getCachedWebsites() {
  return []
}
