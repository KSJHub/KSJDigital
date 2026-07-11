const API_BASE = import.meta.env.VITE_KSJ_API_URL || 'http://localhost:4174/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
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
  login: payload => request('/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request('/logout', { method: 'POST', body: JSON.stringify({}) }),
  me: () => request('/me'),
  getWebsites: () => request('/websites'),
  createWebsite: payload => request('/websites', { method: 'POST', body: JSON.stringify(payload) }),
  updateWebsite: (id, payload) =>
    request(`/websites/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWebsite: id => request(`/websites/${id}`, { method: 'DELETE' }),
  getClients: () => request('/clients'),
  createClient: payload => request('/clients', { method: 'POST', body: JSON.stringify(payload) }),
  updateClient: (id, payload) =>
    request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteClient: id => request(`/clients/${id}`, { method: 'DELETE' }),
  storage: ownerId => request(`/storage/${ownerId}`),
  assets: (ownerId, websiteId) => request(`/assets/${ownerId}/${websiteId}`),
  uploadAsset: (ownerId, websiteId, slotId, file) => {
    const body = new FormData()
    body.append('file', file)
    return request(`/assets/${ownerId}/${websiteId}/${slotId}`, { method: 'POST', body })
  },
  getContent: websiteId => request(`/content/${websiteId}`),
  saveContent: (websiteId, content) =>
    request(`/content/${websiteId}`, { method: 'PUT', body: JSON.stringify(content) }),
  getCommerceSettings: websiteId => request(`/commerce-settings/${websiteId}`),
  saveCommerceSettings: (websiteId, settings) =>
    request(`/commerce-settings/${websiteId}`, { method: 'PUT', body: JSON.stringify(settings) }),
  getForms: websiteId => request(`/forms/${websiteId}`),
  saveForms: (websiteId, forms) =>
    request(`/forms/${websiteId}`, { method: 'PUT', body: JSON.stringify({ forms }) }),
  createForm: (websiteId, payload = {}) =>
    request(`/forms/${websiteId}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateForm: (websiteId, formId, payload) =>
    request(`/forms/${websiteId}/${formId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteForm: (websiteId, formId) => request(`/forms/${websiteId}/${formId}`, { method: 'DELETE' }),
  addField: (websiteId, formId, payload) =>
    request(`/forms/${websiteId}/${formId}/fields`, { method: 'POST', body: JSON.stringify(payload) }),
  updateField: (websiteId, formId, fieldId, payload) =>
    request(`/forms/${websiteId}/${formId}/fields/${fieldId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteField: (websiteId, formId, fieldId) =>
    request(`/forms/${websiteId}/${formId}/fields/${fieldId}`, { method: 'DELETE' }),
  moveField: (websiteId, formId, fieldId, direction) =>
    request(`/forms/${websiteId}/${formId}/fields/${fieldId}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
  submitTestForm: (websiteId, formId) =>
    request(`/forms/${websiteId}/${formId}/test-submission`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  getOrders: () => request('/orders'),
  getOrder: id => request(`/orders/${id}`),
  invoiceUrl: id => `${API_BASE}/orders/${encodeURIComponent(id)}/invoice`,
  updateOrderStatus: (id, payload) =>
    request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
  purgeTestOrders: (websiteId = '') =>
    request('/orders/test-data', {
      method: 'DELETE',
      body: JSON.stringify({ websiteId }),
    }),
  getTickets: () => request('/support/tickets'),
  createTicket: payload => request('/support/tickets', { method: 'POST', body: JSON.stringify(payload) }),
  updateTicket: (id, payload) =>
    request(`/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  replyTicket: (id, payload) =>
    request(`/support/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify(payload) }),
  getPublishRequests: () => request('/publish/requests'),
  createPublishRequest: payload =>
    request('/publish/requests', { method: 'POST', body: JSON.stringify(payload) }),
  approvePublishRequest: id =>
    request(`/publish/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  rejectPublishRequest: (id, reason = '') =>
    request(`/publish/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getPublishHistory: () => request('/publish/history'),
}
