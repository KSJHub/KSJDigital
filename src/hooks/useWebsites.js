import { useEffect, useState } from 'react'
import { api } from '../services/api.js'

export function useWebsites() {
  const [websites, setWebsites] = useState([])
  const [status, setStatus] = useState('Loading')

  async function refresh() {
    try {
      const records = await api.getWebsites()
      setWebsites(records)
      window.dispatchEvent(new CustomEvent('ksj-websites-updated', { detail: records }))
      setStatus('Server synced')
      return records
    } catch (error) {
      setStatus(error.message || 'API unavailable')
      return []
    }
  }

  useEffect(() => {
    refresh()

    function update(event) {
      if (Array.isArray(event.detail)) setWebsites(event.detail)
    }

    window.addEventListener('ksj-websites-updated', update)
    return () => window.removeEventListener('ksj-websites-updated', update)
  }, [])

  return { websites, setWebsites, refresh, status, setStatus }
}

export function findClientWebsite(websites, account) {
  if (!Array.isArray(websites) || !websites.length) return null
  const siteIds = account?.websiteIds || (account?.websiteId ? [account.websiteId] : [])
  if (account?.role === 'owner') return websites[0] || null
  return websites.find(site => siteIds.includes(site.id)) || null
}
