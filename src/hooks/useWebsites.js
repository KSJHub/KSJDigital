import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { getWebsites } from '../services/websites.js'

export function useWebsites() {
  const [websites, setWebsites] = useState(getWebsites)
  const [status, setStatus] = useState('Loading')

  async function refresh() {
    try {
      const records = await api.getWebsites()
      setWebsites(records)
      localStorage.setItem('ksjDigitalWebsites', JSON.stringify(records))
      window.dispatchEvent(new CustomEvent('ksj-websites-updated', { detail: records }))
      setStatus('Server synced')
      return records
    } catch {
      const records = getWebsites()
      setWebsites(records)
      setStatus('Local fallback')
      return records
    }
  }

  useEffect(() => {
    refresh()

    function update(event) {
      if (Array.isArray(event.detail)) {
        setWebsites(event.detail)
      } else {
        setWebsites(getWebsites())
      }
    }

    window.addEventListener('ksj-websites-updated', update)
    return () => window.removeEventListener('ksj-websites-updated', update)
  }, [])

  return { websites, setWebsites, refresh, status, setStatus }
}

export function findClientWebsite(websites, account) {
  const siteId = account?.websiteId || account?.websiteIds?.[0] || 'twotonetaj'
  return websites.find(site => site.id === siteId) || websites[0]
}
