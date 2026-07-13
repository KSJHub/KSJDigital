function developmentCredential(environmentName, fallback) {
  const configured = String(process.env[environmentName] || '').trim()
  if (configured) return configured
  return process.env.NODE_ENV === 'production' ? '' : fallback
}

export const starterWebsites = [
  {
    id: 'ksjdigital',
    name: 'KSJ Digital',
    domain: 'https://ksjdigital.co.uk/',
    status: 'Live',
    pageCount: 0,
    mediaCount: 0,
    owner: 'Morgan',
    logo: 'KSJ',
    orderPrefix: 'KSJ',
    plan: 'Owner',
    seo: 0,
    performance: 0,
    repository: 'KSJHub/KSJDigital',
    notes: 'KSJ Digital owner website',
  },
  {
    id: 'twotonetaj',
    name: 'TwoToneTaj',
    domain: 'https://twotonetaj.ksjdigital.co.uk/',
    status: 'Live',
    pageCount: 7,
    mediaCount: 8,
    owner: 'Taj',
    logo: 'TAJ',
    orderPrefix: 'TAJ',
    plan: 'Premium',
    seo: 94,
    performance: 98,
    repository: 'KSJHub/TwoToneTaj',
    notes: 'Main live client website',
  },
]

export const starterClients = [
  {
    id: 'taj',
    name: 'Taj',
    email: 'taj@twotonetaj.com',
    accessCode: developmentCredential('TWOTONETAJ_CLIENT_PASSWORD', 'client-access'),
    role: 'Client',
    websiteIds: ['twotonetaj'],
    status: 'Active',
    access: 'Website editor',
    canEdit: true,
    canRequestUpdates: true,
    canManageMedia: true,
    canViewSupport: true,
  },
  {
    id: 'morgan',
    name: 'Morgan',
    email: 'ksj@ksjdigital.co.uk',
    accessCode: developmentCredential('KSJ_OWNER_PASSWORD', 'owner-access'),
    role: 'Owner',
    websiteIds: ['ksjdigital', 'twotonetaj'],
    status: 'Active',
    access: 'Full owner access',
    canEdit: true,
    canRequestUpdates: true,
    canManageMedia: true,
    canViewSupport: true,
  },
]
