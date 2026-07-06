const SITE_KEY = 'ksjDigitalSiteEngine'

const defaultSite = {
  navigation: [
    {
      id: 'nav-home',
      label: 'Home',
      target: '/',
      visible: true,
      external: false,
      order: 1,
    },
    {
      id: 'nav-about',
      label: 'About',
      target: '/about',
      visible: true,
      external: false,
      order: 2,
    },
    {
      id: 'nav-community',
      label: 'Community',
      target: '/community',
      visible: true,
      external: false,
      order: 3,
    },
    {
      id: 'nav-contact',
      label: 'Contact',
      target: '/contact',
      visible: true,
      external: false,
      order: 4,
    },
  ],
  theme: {
    mode: 'Dark',
    primary: '#157bff',
    secondary: '#9434e8',
    background: '#05070d',
    text: '#ffffff',
    radius: 18,
    buttonStyle: 'Gradient',
    font: 'Inter',
    spacing: 'Comfortable',
  },
  globals: {
    announcement: 'Welcome to the official website.',
    footerText: 'Powered by KSJ Digital',
    cookieBanner: true,
    maintenanceMode: false,
    notFoundTitle: 'Page not found',
  },
  seo: {
    siteTitle: 'Website managed by KSJ Digital',
    description: 'Official website managed through the KSJ Digital client portal.',
    keywords: 'gaming, community, website',
    ogImage: '',
    robots: 'index,follow',
  },
  settings: {
    domain: '',
    ssl: 'Pending',
    branch: 'main',
    publishMethod: 'GitHub + VPS',
    analyticsId: '',
    backupStatus: 'Ready',
  },
}

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  return value
}

function key(websiteId = 'twotonetaj') {
  return `${SITE_KEY}:${websiteId}`
}

export function getSiteConfig(websiteId) {
  return read(key(websiteId), defaultSite)
}

export function saveSiteConfig(websiteId, config) {
  return write(key(websiteId), config)
}

export function updateSiteSection(websiteId, section, values) {
  const config = getSiteConfig(websiteId)

  return saveSiteConfig(websiteId, {
    ...config,
    [section]: {
      ...config[section],
      ...values,
    },
  })
}

export function addNavigationItem(websiteId) {
  const config = getSiteConfig(websiteId)
  const item = {
    id: `nav-${Date.now()}`,
    label: 'New Link',
    target: '/new-link',
    visible: true,
    external: false,
    order: config.navigation.length + 1,
  }

  return saveSiteConfig(websiteId, {
    ...config,
    navigation: [...config.navigation, item],
  })
}

export function updateNavigationItem(websiteId, id, changes) {
  const config = getSiteConfig(websiteId)

  return saveSiteConfig(websiteId, {
    ...config,
    navigation: config.navigation.map(item =>
      item.id === id ? { ...item, ...changes } : item,
    ),
  })
}

export function deleteNavigationItem(websiteId, id) {
  const config = getSiteConfig(websiteId)

  return saveSiteConfig(websiteId, {
    ...config,
    navigation: config.navigation
      .filter(item => item.id !== id)
      .map((item, index) => ({ ...item, order: index + 1 })),
  })
}

export function moveNavigationItem(websiteId, id, direction) {
  const config = getSiteConfig(websiteId)
  const nav = [...config.navigation].sort((a, b) => a.order - b.order)
  const index = nav.findIndex(item => item.id === id)
  const nextIndex = direction === 'up' ? index - 1 : index + 1

  if (index < 0 || nextIndex < 0 || nextIndex >= nav.length) {
    return config
  }

  const [item] = nav.splice(index, 1)
  nav.splice(nextIndex, 0, item)

  return saveSiteConfig(websiteId, {
    ...config,
    navigation: nav.map((item, index) => ({ ...item, order: index + 1 })),
  })
}

export function buildSiteExport(website, pages = [], config = getSiteConfig(website.id)) {
  return {
    website: {
      id: website.id,
      name: website.name,
      domain: website.domain,
      status: website.status,
    },
    navigation: config.navigation
      .filter(item => item.visible)
      .sort((a, b) => a.order - b.order),
    theme: config.theme,
    globals: config.globals,
    seo: config.seo,
    settings: config.settings,
    pages,
    exportedAt: new Date().toISOString(),
  }
}
