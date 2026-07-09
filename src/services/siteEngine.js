export const defaultSiteEngine = {
  navigation: [
    { id: 'nav-home', label: 'Home', target: '/', visible: true, external: false, order: 1 },
    { id: 'nav-about', label: 'About', target: '/about', visible: true, external: false, order: 2 },
    { id: 'nav-community', label: 'Community', target: '/community', visible: true, external: false, order: 3 },
    { id: 'nav-contact', label: 'Contact', target: '/contact', visible: true, external: false, order: 4 },
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

export function normaliseSiteEngine(content = {}) {
  return {
    ...defaultSiteEngine,
    ...(content.engine || {}),
    navigation: content.engine?.navigation || content.navigation || defaultSiteEngine.navigation,
    theme: { ...defaultSiteEngine.theme, ...(content.engine?.theme || content.theme || {}) },
    globals: { ...defaultSiteEngine.globals, ...(content.engine?.globals || content.globals || {}) },
    seo: { ...defaultSiteEngine.seo, ...(content.engine?.seo || content.seo || {}) },
    settings: { ...defaultSiteEngine.settings, ...(content.engine?.settings || content.settings || {}) },
  }
}

export function buildSiteExport(website, content = {}, config = normaliseSiteEngine(content)) {
  return {
    website: {
      id: website?.id,
      name: website?.name,
      domain: website?.domain,
      status: website?.status,
    },
    navigation: (config.navigation || []).filter(item => item.visible).sort((a, b) => a.order - b.order),
    theme: config.theme,
    globals: config.globals,
    seo: config.seo,
    settings: config.settings,
    pages: content.pages || [],
    exportedAt: new Date().toISOString(),
  }
}
