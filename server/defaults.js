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
    developmentEditorUrl: 'http://localhost:5173/',
    status: 'Live',
    pageCount: 0,
    mediaCount: 0,
    owner: 'KSJ Digital',
    logo: 'KSJ',
    orderPrefix: 'KSJ',
    plan: 'Platform',
    seo: 0,
    performance: 0,
    repository: 'KSJHub/KSJDigital',
    notes: 'KSJ Digital platform website',
  },
  {
    id: 'twotonetaj',
    name: 'TwoToneTaj',
    domain: 'https://twotonetaj.ksjdigital.co.uk/',
    developmentEditorUrl: 'http://localhost:5174/',
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
    displayName: 'Taj',
    email: 'taj@twotonetaj.com',
    accessCode: developmentCredential('TWOTONETAJ_CLIENT_PASSWORD', 'client-access'),
    role: 'client',
    roleLabel: 'Website Owner',
    websiteIds: ['twotonetaj'],
    status: 'Active',
    access: 'Full website access',
    canEdit: true,
    canManagePages: true,
    canRequestUpdates: true,
    canManageMedia: true,
    canViewSupport: true,
  },
  {
    id: 'morgan',
    name: 'KSJ Digital',
    displayName: 'KSJ Digital',
    email: 'ksj@ksjdigital.co.uk',
    accessCode: developmentCredential('KSJ_OWNER_PASSWORD', 'owner-access'),
    role: 'owner',
    roleLabel: 'Platform Owner',
    websiteIds: ['ksjdigital', 'twotonetaj'],
    status: 'Active',
    access: 'Platform administration',
    canEdit: true,
    canManagePages: true,
    canRequestUpdates: true,
    canManageMedia: true,
    canViewSupport: true,
  },
]
