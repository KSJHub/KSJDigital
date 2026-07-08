export const websiteWorkspace = {
  id: 'twotonetaj',
  name: 'TwoToneTaj',
  status: 'Live',
  domain: 'twotonetaj.ksjdigital.co.uk',
  plan: 'Premium',
  owner: 'Taj',
  lastUpdated: '2 hours ago',
}

export const websiteHealth = [
  ['Website Status', 'Live', 'Online and available'],
  ['SEO Score', '94%', 'Strong search setup'],
  ['Performance', '98%', 'Fast page experience'],
  ['Publishing', 'Ready', 'No blocking issues'],
]

export const websitePages = [
  { title: 'Home', slug: '/', status: 'Published', draft: 'No draft', seo: 96, locked: false },
  {
    title: 'About',
    slug: '/about',
    status: 'Published',
    draft: 'Draft saved',
    seo: 91,
    locked: false,
  },
  {
    title: 'Content',
    slug: '/content',
    status: 'Published',
    draft: 'No draft',
    seo: 87,
    locked: false,
  },
  {
    title: 'Community',
    slug: '/community',
    status: 'Published',
    draft: 'Needs review',
    seo: 89,
    locked: false,
  },
  { title: 'Merch', slug: '/merch', status: 'Draft', draft: 'Coming soon', seo: 72, locked: false },
  {
    title: 'Contact',
    slug: '/contact',
    status: 'Published',
    draft: 'No draft',
    seo: 94,
    locked: false,
  },
]

export const navigationItems = [
  ['Home', '/', 'Visible'],
  ['About', '/about', 'Visible'],
  ['Content', '/content', 'Visible'],
  ['Community', '/community', 'Visible'],
  ['Merch', '/merch', 'Visible'],
  ['Contact', '/contact', 'Visible'],
]

export const seoItems = [
  ['Homepage title', 'TwoToneTaj | Gaming Community', 'Good'],
  ['Meta description', 'Average gamer. Community builder. Good laughs.', 'Good'],
  ['Open Graph image', 'homepage-share.png', 'Ready'],
  ['Canonical URL', 'https://twotonetaj.ksjdigital.co.uk', 'Ready'],
]

export const versionHistory = [
  ['Homepage hero draft', 'Saved draft', 'Today'],
  ['About page wording', 'Published', 'Yesterday'],
  ['Community CTA update', 'Pending review', '2 days ago'],
]

export const quickActions = [
  ['Edit Pages', '/client/editor'],
  ['Open Media', '/client/media'],
  ['View Analytics', '/client/analytics'],
  ['Request Publish', '/client/publish'],
]
