export const githubConnections = [
  {
    id: 'twotonetaj',
    website: 'TwoToneTaj',
    repository: 'KSJHub/TwoToneTaj',
    branch: 'main',
    status: 'Connected',
    access: 'Content updates prepared',
    deployTarget: 'TwoToneTaj VPS production',
  },
  {
    id: 'goliath',
    website: 'Goliath',
    repository: 'KSJHub/Goliath',
    branch: 'main',
    status: 'Planned',
    access: 'Pending setup',
    deployTarget: 'Preview environment',
  },
  {
    id: 'ksjdiamondgaming',
    website: 'KSJ Diamond Gaming',
    repository: 'KSJHub/KSJDiamondGaming',
    branch: 'main',
    status: 'Planned',
    access: 'Pending setup',
    deployTarget: 'Staging environment',
  },
]

export const contentTargets = [
  ['Homepage Content', 'src/content/pages/home.json', 'Hero, intro, buttons and SEO'],
  ['About Content', 'src/content/pages/about.json', 'Story cards, intro text and CTA'],
  ['Site Settings', 'src/content/site.json', 'Branding, socials and navigation'],
  ['Media Manifest', 'src/content/media.json', 'Approved website media references'],
]

export const integrationFlow = [
  ['Client edits content', 'Client changes safe fields inside KSJ Digital'],
  ['Draft saved', 'KSJ Digital stores a draft before anything touches the website'],
  ['Owner approves', 'Owner checks the change and approves publishing'],
  ['Content files updated', 'KSJ Digital prepares structured content updates for the website'],
  ['Deployment runs', 'Website build and VPS live process starts'],
]

export const integrationChecks = [
  ['Repository access', 'Ready'],
  ['Content file mapping', 'Ready'],
  ['Owner approval rule', 'Ready'],
  ['Deployment handoff', 'Planned'],
]
