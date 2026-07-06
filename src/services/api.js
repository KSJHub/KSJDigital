const API_BASE = import.meta.env.VITE_KSJ_API_URL || 'http://localhost:4174/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `API error ${response.status}`)
  return data
}

export const api = {
  health: () => request('/health'),
  storage: ownerId => request(`/storage/${ownerId}`),
  assets: (ownerId, websiteId) => request(`/assets/${ownerId}/${websiteId}`),
  uploadAsset: (ownerId, websiteId, slotId, file) => {
    const body = new FormData()
    body.append('file', file)
    return request(`/assets/${ownerId}/${websiteId}/${slotId}`, { method: 'POST', body })
  },
  getContent: websiteId => request(`/content/${websiteId}`),
  saveContent: (websiteId, content) => request(`/content/${websiteId}`, { method: 'PUT', body: JSON.stringify(content) }),
  getPublishRequests: () => request('/publish/requests'),
  createPublishRequest: payload => request('/publish/requests', { method: 'POST', body: JSON.stringify(payload) }),
  approvePublishRequest: id => request(`/publish/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  rejectPublishRequest: (id, reason = '') => request(`/publish/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getPublishHistory: () => request('/publish/history'),
}
