export const contentModel = {
  websiteId: 'twotonetaj',
  websiteName: 'TwoToneTaj',
  lockedDesign: true,
  editableAreas: [
    { id: 'hero', label: 'Hero', description: 'Main homepage heading, subtitle, button and image.' },
    { id: 'about', label: 'About Summary', description: 'Short homepage introduction.' },
    { id: 'schedule', label: 'Live Schedule', description: 'Streaming days and times.' },
    { id: 'socials', label: 'Social Links', description: 'Twitch, YouTube, TikTok, Kick and Instagram.' },
    { id: 'seo', label: 'SEO', description: 'Search engine title and description.' },
  ],
  fields: [
    { key: 'home.hero.title', label: 'Hero Title', type: 'text', value: 'TwoToneTaj', required: true, lockedLayout: true },
    { key: 'home.hero.subtitle', label: 'Hero Subtitle', type: 'text', value: 'Average gamer. Legendary vibes.', required: true, lockedLayout: true },
    { key: 'home.hero.intro', label: 'Intro Text', type: 'textarea', value: 'TwoToneTaj, an average gamer with a passion for games, good laughs, and an awesome community.', required: true, lockedLayout: true },
    { key: 'home.hero.buttonText', label: 'Primary Button', type: 'text', value: 'Join The Squad', required: true, lockedLayout: true },
    { key: 'home.hero.buttonLink', label: 'Button Link', type: 'url', value: 'https://discord.gg/taj', required: false, lockedLayout: true },
    { key: 'site.seo.title', label: 'SEO Title', type: 'text', value: 'TwoToneTaj | Gaming Community', required: true, lockedLayout: true },
    { key: 'site.seo.description', label: 'SEO Description', type: 'textarea', value: 'Average gamer. Community builder. Good laughs, good people and good times.', required: true, lockedLayout: true },
  ],
}

export const draftStatus = {
  currentDraft: 'Homepage content update',
  status: 'Unsaved changes',
  lastSaved: 'Not saved yet',
  publishState: 'Draft only',
  ownerReviewRequired: true,
}

export const contentPipeline = [
  ['Client edits safe fields', 'Only approved text, links and media fields can be changed.'],
  ['Save draft', 'Draft is stored in KSJ Digital before anything goes live.'],
  ['Request publish', 'Client asks KSJ Digital to review the changes.'],
  ['Owner approval', 'Owner/admin reviews and approves the safe content update.'],
  ['Website update', 'Approved content is prepared for the connected website.'],
]
