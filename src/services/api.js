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

async function refreshForms(websiteId) {
  return request(`/forms/${websiteId}`)
}

export const api = {
  health: () => request('/health'),
  login: payload => request('/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request('/logout', { method: 'POST', body: JSON.stringify({}) }),
  me: () => request('/me'),
  sessionAccess: () => request('/session-access'),
  getWebsites: () => request('/websites'),
  createWebsite: payload => request('/websites', { method: 'POST', body: JSON.stringify(payload) }),
  updateWebsite: (id, payload) => request(`/websites/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWebsite: id => request(`/websites/${id}`, { method: 'DELETE' }),
  getClients: () => request('/clients'),
  createClient: payload => request('/clients', { method: 'POST', body: JSON.stringify(payload) }),
  updateClient: (id, payload) => request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteClient: id => request(`/clients/${id}`, { method: 'DELETE' }),
  getTeam: () => request('/team'),
  createTeamMember: payload => request('/team', { method: 'POST', body: JSON.stringify(payload) }),
  updateTeamMember: (id, payload) => request(`/team/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTeamMember: id => request(`/team/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  storage: ownerId => request(`/storage/${ownerId}`),
  assets: (ownerId, websiteId) => request(`/assets/${ownerId}/${websiteId}`),
  uploadAsset: (ownerId, websiteId, slotId, file) => { const body = new FormData(); body.append('file', file); return request(`/assets/${ownerId}/${websiteId}/${slotId}`, { method: 'POST', body }) },
  deleteLegacyAsset: (ownerId, websiteId, assetId) => request(`/asset-library/legacy/${encodeURIComponent(ownerId)}/${encodeURIComponent(websiteId)}/${encodeURIComponent(assetId)}`, { method: 'DELETE' }),
  getComponents: () => request('/content/components'),
  getContent: websiteId => request(`/content/${websiteId}`),
  saveContent: (websiteId, content) => request(`/content/${websiteId}`, { method: 'PUT', body: JSON.stringify(content) }),
  getArticles: websiteId => request(`/cms/${encodeURIComponent(websiteId)}`),
  createArticle: (websiteId, payload = {}) => request(`/cms/${encodeURIComponent(websiteId)}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateArticle: (websiteId, articleId, payload) => request(`/cms/${encodeURIComponent(websiteId)}/${encodeURIComponent(articleId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  transitionArticle: (websiteId, articleId, transitionId, payload = {}) => request(`/cms/${encodeURIComponent(websiteId)}/${encodeURIComponent(articleId)}/transitions/${encodeURIComponent(transitionId)}`, { method: 'POST', body: JSON.stringify(payload) }),
  restoreArticleRevision: (websiteId, articleId, revisionId) => request(`/cms/${encodeURIComponent(websiteId)}/${encodeURIComponent(articleId)}/restore/${encodeURIComponent(revisionId)}`, { method: 'POST', body: JSON.stringify({}) }),
  deleteArticle: (websiteId, articleId) => request(`/cms/${encodeURIComponent(websiteId)}/${encodeURIComponent(articleId)}`, { method: 'DELETE' }),
  getCommerceSettings: websiteId => request(`/commerce-settings/${websiteId}`),
  getCommerceReadiness: websiteId => request(`/commerce-settings/${websiteId}/readiness`),
  saveCommerceSettings: (websiteId, settings) => request(`/commerce-settings/${websiteId}`, { method: 'PUT', body: JSON.stringify(settings) }),
  createBasketCheckout: (provider, payload) => request(`/checkout/basket/${provider}`, { method: 'POST', body: JSON.stringify(payload) }),
  getForms: refreshForms,
  getPublicForms: websiteId => request(`/public/forms/${encodeURIComponent(websiteId)}`),
  submitPublicForm: (websiteId, formId, payload) => request(`/public/forms/${encodeURIComponent(websiteId)}/${encodeURIComponent(formId)}/submissions`, { method: 'POST', body: JSON.stringify(payload) }),
  getFormDeliveryStatuses: (websiteId, formId) => request(`/notifications/form-deliveries?websiteId=${encodeURIComponent(websiteId)}&formId=${encodeURIComponent(formId)}`),
  getEmailReadiness: () => request('/notifications/email-readiness'),
  sendEmailTest: to => request('/notifications/email-test', { method: 'POST', body: JSON.stringify({ to }) }),
  saveForms: (websiteId, forms) => request(`/forms/${websiteId}`, { method: 'PUT', body: JSON.stringify({ forms }) }),
  createForm: async (websiteId, payload = {}) => {
    const form = await request(`/forms/${websiteId}`, { method: 'POST', body: JSON.stringify(payload) })
    return { form, forms: await refreshForms(websiteId) }
  },
  updateForm: async (websiteId, formId, payload) => {
    await request(`/forms/${websiteId}/${formId}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return refreshForms(websiteId)
  },
  deleteForm: async (websiteId, formId) => {
    await request(`/forms/${websiteId}/${formId}`, { method: 'DELETE' })
    return refreshForms(websiteId)
  },
  addField: async (websiteId, formId, payload) => {
    await request(`/forms/${websiteId}/${formId}/fields`, { method: 'POST', body: JSON.stringify(payload) })
    return refreshForms(websiteId)
  },
  updateField: (websiteId, formId, fieldId, payload) => request(`/forms/${websiteId}/${formId}/fields/${fieldId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteField: (websiteId, formId, fieldId) => request(`/forms/${websiteId}/${formId}/fields/${fieldId}`, { method: 'DELETE' }),
  moveField: (websiteId, formId, fieldId, direction) => request(`/forms/${websiteId}/${formId}/fields/${fieldId}/move`, { method: 'POST', body: JSON.stringify({ direction }) }),
  submitTestForm: (websiteId, formId) => request(`/forms/${websiteId}/${formId}/test-submission`, { method: 'POST', body: JSON.stringify({}) }),
  getOrders: () => request('/orders'),
  getOrder: id => request(`/orders/${id}`),
  getInventory: websiteId => request(`/inventory/${encodeURIComponent(websiteId)}`),
  invoiceUrl: id => `${API_BASE}/orders/${encodeURIComponent(id)}/invoice`,
  updateOrderStatus: (id, payload) => request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
  refundOrder: (id, payload) => request(`/order-refunds/${id}`, { method: 'POST', body: JSON.stringify(payload) }),
  purgeTestOrders: (websiteId = '') => request('/orders/test-data', { method: 'DELETE', body: JSON.stringify({ websiteId }) }),
  getTickets: () => request('/support/tickets'),
  createTicket: payload => request('/support/tickets', { method: 'POST', body: JSON.stringify(payload) }),
  updateTicket: (id, payload) => request(`/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  replyTicket: (id, payload) => request(`/support/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify(payload) }),
  getPublishRequests: () => request('/publish/requests'),
  getPublishRequestReview: id => request(`/publish/requests/${id}/review`),
  createPublishRequest: payload => request('/publish/requests', { method: 'POST', body: JSON.stringify(payload) }),
  approvePublishRequest: id => request(`/publish/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  rejectPublishRequest: (id, reason = '') => request(`/publish/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getPublishHistory: () => request('/publish/history'),
  getPublishHistoryReview: id => request(`/publish/history/${id}/review`),
  rollbackPublishHistory: id => request(`/publish/history/${id}/rollback`, { method: 'POST', body: JSON.stringify({}) }),
}