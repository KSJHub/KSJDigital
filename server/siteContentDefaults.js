export const starterSiteContent = {
  twotonetaj: {
    brand: {
      name: 'TwoToneTaj',
      tagline: 'Average Gamer • Est. 1989',
      shortTagline: 'Average gamer. Legendary vibes.',
      ownerName: 'Taj',
      communityName: 'TajSquad',
      supportCredit: 'Website by KSJ Digital',
    },
    contact: {
      supportEmail: 'support@ksjdigital.co.uk',
      businessEmail: 'media@ksjdigital.co.uk',
    },
    socials: {
      twitch: 'https://www.twitch.tv/twotonetaj',
      youtube: 'https://www.youtube.com/@twotonetaj',
      tiktok: 'https://www.tiktok.com/@twotonetaj',
      kick: 'https://kick.com/twotonetaj',
      instagram: 'https://www.instagram.com/twotonetaj',
      discord: 'https://discord.gg/WcbtQPuByd',
      linktree: 'https://linktr.ee/Twotonetaj',
      paypal: 'https://paypal.me/2tonetaj',
    },
    platforms: {
      twitchChannel: 'twotonetaj',
      youtubeChannelId: 'UC54tVexRR4IXeXpzg2Dq1UA',
    },
    home: {
      heroTitle: 'TwoToneTaj',
      heroText:
        'TwoToneTaj, an average gamer with a passion for games, a pure heart, good laughs, and an awesome community.',
      aboutText:
        'I’ve been gaming since 1989 and I’m here for the fun, the challenge, and the community. You’ll find gameplay, chill streams, and plenty of unforgettable moments with the TajSquad.',
      merchTitle: 'Official TwoToneTaj Merch',
      merchText: 'Hoodies, creator apparel, and exclusive TajSquad merchandise are in development.',
    },
    pages: [],
  },
}

export function getStarterSiteContent(websiteId) {
  return starterSiteContent[websiteId] || { pages: [] }
}
