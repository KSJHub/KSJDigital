import { api } from './api.js'

const WEBSITE_KEY = 'ksjDigitalWebsites'

export async function syncWebsitesFromServer() {
  const websites = await api.getWebsites()
  localStorage.setItem(WEBSITE_KEY, JSON.stringify(websites))
  window.dispatchEvent(new CustomEvent('ksj-websites-updated', { detail: websites }))
  return websites
}

export function getCachedWebsites() {
  try {
    return JSON.parse(localStorage.getItem(WEBSITE_KEY) || '[]')
  } catch {
    return []
  }
}
