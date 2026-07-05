export const twoToneTajRepo = {
  owner: 'KSJHub',
  name: 'TwoToneTaj',
  fullName: 'KSJHub/TwoToneTaj',
  branch: 'main',
  liveDomain: 'twotonetaj.ksjdigital.co.uk',
  repoUrl: 'https://github.com/KSJHub/TwoToneTaj',
}

export const twoToneTajPages = [
  { title: 'Home', route: '/', source: 'src/pages/Home.jsx', status: 'Synced', editable: true, sections: ['Hero', 'About', 'Twitch', 'YouTube', 'Schedule', 'Socials', 'Merch'] },
  { title: 'About', route: '/about', source: 'src/pages/About.jsx', status: 'Synced', editable: true, sections: ['Hero', 'Story Cards', 'Avatar', 'Final CTA'] },
  { title: 'Content', route: '/content', source: 'src/pages/Content.jsx', status: 'Pending Scan', editable: true, sections: ['Videos', 'Clips', 'Feeds'] },
  { title: 'Community', route: '/community', source: 'src/pages/Community.jsx', status: 'Pending Scan', editable: true, sections: ['Discord', 'Rules', 'Join CTA'] },
  { title: 'Merch', route: '/merch', source: 'src/pages/Merch.jsx', status: 'Pending Scan', editable: true, sections: ['Products', 'Coming Soon', 'CTA'] },
  { title: 'Contact', route: '/contact', source: 'src/pages/Contact.jsx', status: 'Pending Scan', editable: true, sections: ['Form', 'Social Links', 'Business Contact'] },
]

export const twoToneTajAssets = [
  { name: 'dragon.png', folder: 'src/assets/home', usage: 'Home hero dragon', status: 'Synced' },
  { name: 'setup.png', folder: 'src/assets/home', usage: 'Home setup panel', status: 'Synced' },
  { name: 'taj-avatar.png', folder: 'src/assets/about', usage: 'About hero avatar', status: 'Synced' },
  { name: 'squad.png', folder: 'src/assets/about', usage: 'About story card', status: 'Synced' },
  { name: 'controller.png', folder: 'src/assets/about', usage: 'About story card', status: 'Synced' },
  { name: 'logo.png', folder: 'src/assets', usage: 'Brand logo', status: 'Synced' },
]

export const twoToneTajContentMap = {
  identity: {
    brand: 'TwoToneTaj',
    tagline: 'Average gamer. Legendary vibes.',
    motto: "It's all about the 💩 and giggles, folks.",
    schedule: ['Mon 7-11 PM', 'Tue 7-11 PM', 'Wed Offline', 'Thu 7-11 PM', 'Fri 7-12 AM', 'Sat 12-12', 'Sun 12-10'],
  },
  socials: {
    twitch: 'https://www.twitch.tv/twotonetaj',
    youtube: 'https://www.youtube.com/@twotonetaj',
    tiktok: 'https://www.tiktok.com/@twotonetaj',
    kick: 'https://kick.com/twotonetaj',
    instagram: 'https://www.instagram.com/twotonetaj',
  },
}
