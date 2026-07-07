import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { getClients } from '../services/platform.js'

const CLIENT_KEY = 'ksjDigitalClients'

export function useClients() {
  const [clients, setClients] = useState(getClients)
  const [status, setStatus] = useState('Loading')

  async function refresh() {
    try {
      const records = await api.getClients()
      localStorage.setItem(CLIENT_KEY, JSON.stringify(records))
      setClients(records)
      window.dispatchEvent(new CustomEvent('ksj-clients-updated', { detail: records }))
      setStatus('Server synced')
      return records
    } catch {
      const records = getClients()
      setClients(records)
      setStatus('Local fallback')
      return records
    }
  }

  useEffect(() => {
    refresh()

    function update(event) {
      if (Array.isArray(event.detail)) {
        setClients(event.detail)
      } else {
        setClients(getClients())
      }
    }

    window.addEventListener('ksj-clients-updated', update)
    return () => window.removeEventListener('ksj-clients-updated', update)
  }, [])

  return { clients, setClients, refresh, status, setStatus }
}
