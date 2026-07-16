export const WEBSITE_CAPABILITIES = Object.freeze([
  'website',
  'media',
  'forms',
  'commerce',
  'team',
  'support',
])

export function normaliseWebsiteCapabilities(value, fallback = WEBSITE_CAPABILITIES) {
  const source = Array.isArray(value) && value.length ? value : fallback
  const allowed = new Set(WEBSITE_CAPABILITIES)
  return [...new Set(source.map(item => String(item || '').trim().toLowerCase()).filter(item => allowed.has(item)))]
}

export function capabilitiesForWebsites(websites = [], websiteIds = []) {
  const assigned = new Set(websiteIds.map(id => String(id || '').trim()).filter(Boolean))
  const capabilities = new Set()
  websites.forEach(website => {
    if (!assigned.has(String(website?.id || '').trim())) return
    normaliseWebsiteCapabilities(website?.capabilities).forEach(capability => capabilities.add(capability))
  })
  return [...capabilities]
}
