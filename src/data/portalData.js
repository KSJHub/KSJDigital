export const portalUser = {
  name: 'TwoToneTaj',
  initials: 'TT',
  role: 'Client',
  email: 'media@ksjdigital.co.uk',
};

export const portalProject = {
  id: 'twotonetaj',
  name: 'TwoToneTaj',
  type: 'Creator Website',
  domain: 'twotonetaj.ksjdigital.co.uk',
  url: 'https://twotonetaj.ksjdigital.co.uk/',
  status: 'Live',
  access: 'Website Management',
  publishMode: 'Approval Required',
  plan: 'Managed Website',
  lastPublished: 'Awaiting first portal publish',
  owner: 'KSJ Digital',
  description: 'Creator website and community platform managed through KSJ Digital Portals.',
};

export const portalQuickActions = [
  {
    icon: '⌂',
    title: 'Edit Homepage',
    text: 'Update hero content, featured sections, and calls to action.',
  },
  {
    icon: '✎',
    title: 'Edit About',
    text: 'Manage biography, story sections, images, and page copy.',
  },
  {
    icon: '✉',
    title: 'Edit Contact',
    text: 'Update contact details, support email, and external links.',
  },
  {
    icon: '◉',
    title: 'Preview Website',
    text: 'Review changes before requesting a live publish.',
  },
];

export const portalEditorTabs = ['Homepage', 'About', 'Social Links', 'Schedule', 'Contact', 'Site Settings'];

export const portalEditableSections = [
  {
    id: 'hero',
    title: 'Hero Section',
    text: 'Headline, intro copy, hero buttons, and featured image.',
    status: 'Draft Ready',
    fields: ['Hero title', 'Subtitle', 'Primary button', 'Secondary button', 'Hero image'],
  },
  {
    id: 'about',
    title: 'About Section',
    text: 'Creator story, highlight cards, images, and community message.',
    status: 'Needs Review',
    fields: ['Intro copy', 'Story cards', 'Quote', 'Avatar image'],
  },
  {
    id: 'social-links',
    title: 'Social Links',
    text: 'Discord, Twitch, YouTube, TikTok, PayPal, and Linktree destinations.',
    status: 'Ready',
    fields: ['Discord invite', 'Twitch URL', 'YouTube URL', 'TikTok URL', 'Support links'],
  },
  {
    id: 'schedule',
    title: 'Schedule',
    text: 'Streaming days, availability text, and community event notes.',
    status: 'Draft Ready',
    fields: ['Weekly schedule', 'Timezone', 'Stream notes'],
  },
  {
    id: 'contact',
    title: 'Contact Page',
    text: 'Public contact email, form messaging, and creator/business enquiries.',
    status: 'Ready',
    fields: ['Public email', 'Business text', 'Support text'],
  },
  {
    id: 'merch',
    title: 'Merch Section',
    text: 'Coming soon text, product previews, and shop messaging.',
    status: 'Coming Soon',
    fields: ['Merch intro', 'Product cards', 'Payment notice'],
  },
];

export const portalContentSnapshot = {
  homepage: {
    heroTitle: 'TwoToneTaj',
    tagline: 'Average Gamer • Est. 1989',
    summary: 'Creator website, community hub, content links, music player, and future merch area.',
  },
  about: {
    headline: 'Average gamer. Community builder. Professional scoreboard victim.',
    quote: 'It’s all about the 💩 and giggles, folks.',
  },
  contact: {
    email: 'media@ksjdigital.co.uk',
    supportEmail: 'support@ksjdigital.co.uk',
  },
  publish: {
    draftStatus: 'Unpublished changes',
    nextStep: 'Save draft, preview, then request KSJ Digital approval.',
  },
};

export const portalRecentActivity = [
  'Homepage draft prepared',
  'Social links ready for review',
  'Contact information checked',
];
