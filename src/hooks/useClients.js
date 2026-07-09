import { useEffect, useState } from 'react'
import { api } from '../services/api.js'

export function useClients() {
  const [clients, setClients] = useState([])
  const [status, setStatus] = useState('Loading')

  async function refresh() {
    try {
      const records = await api.getClients()
      setClients(records)
      window.dispatchEvent(new CustomEvent('ksj-clients-updated', { detail: records }))
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
      if (Array.isArray(event.detail)) {
        setClients(event.detail)
      }
    }

    window.addEventListener('ksj-clients-updated', update)
    return () => window.removeEventListener('ksj-clients-updated', update)
  }, [])

  return { clients, setClients, refresh, status, setStatus }
}
