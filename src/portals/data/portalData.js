export const initialPortalData = {
  meta: {
    version: 2,
    name: 'KSJ Digital Portals',
    storageMode: 'frontend-json-demo',
  },

  websiteRegistry: {
    ksjdigital: {
      websiteId: 'ksjdigital',
      name: 'KSJ Digital',
      schemaId: 'business',
      lockedCode: true,
      cmsEnabled: true,
      editablePages: ['homepage', 'about', 'contact'],
      note: 'Internal KSJ Digital website used as the first CMS test site before client websites are connected.',
    },
    twotonetaj: {
      websiteId: 'twotonetaj',
      name: 'TwoToneTaj',
      schemaId: 'creator',
      lockedCode: true,
      cmsEnabled: true,
      editablePages: ['homepage', 'about', 'community', 'merch', 'contact'],
      note: 'Creator website registry entry. Do not connect live TwoToneTaj deployment until the KSJ Digital CMS flow is proven.',
    },
  },

  contentSchemas: {
    business: {
      label: 'Business Website',
      pages: [
        {
          id: 'homepage',
          title: 'Homepage',
          description: 'Main landing page content controlled through approved CMS fields.',
          fields: [
            { id: 'heroTitle', label: 'Hero Title', type: 'text' },
            { id: 'heroSubtitle', label: 'Hero Subtitle', type: 'textarea' },
            { id: 'primaryButtonText', label: 'Primary Button Text', type: 'text' },
            { id: 'primaryButtonUrl', label: 'Primary Button URL', type: 'text' },
          ],
        },
        {
          id: 'about',
          title: 'About',
          description: 'Short company overview and positioning copy.',
          fields: [
            { id: 'headline', label: 'Headline', type: 'text' },
            { id: 'bodyCopy', label: 'Body Copy', type: 'textarea' },
          ],
        },
        {
          id: 'contact',
          title: 'Contact',
          description: 'Public contact details and primary enquiry route.',
          fields: [
            { id: 'email', label: 'Public Email', type: 'text' },
            { id: 'supportEmail', label: 'Support Email', type: 'text' },
          ],
        },
      ],
    },
    creator: {
      label: 'Creator Website',
      pages: [
        {
          id: 'homepage',
          title: 'Homepage',
          description: 'Creator landing page and hero content.',
          fields: [
            { id: 'heroTitle', label: 'Hero Title', type: 'text' },
            { id: 'heroSubtitle', label: 'Hero Subtitle', type: 'text' },
            { id: 'heroSummary', label: 'Hero Summary', type: 'textarea' },
            { id: 'buttonText', label: 'Button Text', type: 'text' },
            { id: 'buttonUrl', label: 'Button URL', type: 'text' },
          ],
        },
        {
          id: 'about',
          title: 'About',
          description: 'Creator story and community positioning.',
          fields: [
            { id: 'headline', label: 'Headline', type: 'text' },
            { id: 'storyCopy', label: 'Story Copy', type: 'textarea' },
            { id: 'quote', label: 'Quote', type: 'text' },
          ],
        },
        {
          id: 'community',
          title: 'Community',
          description: 'Community page copy and call-to-action details.',
          fields: [
            { id: 'headline', label: 'Headline', type: 'text' },
            { id: 'bodyCopy', label: 'Body Copy', type: 'textarea' },
            { id: 'discordUrl', label: 'Discord URL', type: 'text' },
          ],
        },
        {
          id: 'merch',
          title: 'Merch',
          description: 'Merch page copy and coming-soon messaging.',
          fields: [
            { id: 'merchIntro', label: 'Merch Intro', type: 'textarea' },
            { id: 'comingSoonMessage', label: 'Coming Soon Message', type: 'text' },
          ],
        },
        {
          id: 'contact',
          title: 'Contact',
          description: 'Public creator contact and social links.',
          fields: [
            { id: 'publicEmail', label: 'Public Email', type: 'text' },
            { id: 'discordUrl', label: 'Discord URL', type: 'text' },
            { id: 'linktreeUrl', label: 'Linktree URL', type: 'text' },
          ],
        },
      ],
    },
  },

  content: {
    ksjdigital: {
      homepage: {
        live: {
          heroTitle: 'KSJ Digital',
          heroSubtitle: 'Professional website management, portals, and digital systems.',
          primaryButtonText: 'Contact KSJ Digital',
          primaryButtonUrl: '/contact',
        },
        draft: {},
        backup: null,
      },
      about: {
        live: {
          headline: 'Websites managed with control, approval, and safety.',
          bodyCopy: 'KSJ Digital builds managed website systems where clients can request updates without editing code.',
        },
        draft: {},
        backup: null,
      },
      contact: {
        live: {
          email: 'enquiries@ksjdigital.co.uk',
          supportEmail: 'support@ksjdigital.co.uk',
        },
        draft: {},
        backup: null,
      },
    },
    twotonetaj: {
      homepage: {
        live: {
          heroTitle: 'TwoToneTaj',
          heroSubtitle: 'Average Gamer • Est. 1989',
          heroSummary: 'Gaming, laughs, community moments, and TajSquad updates.',
          buttonText: 'Join TajSquad',
          buttonUrl: '#community',
        },
        draft: {},
        backup: null,
      },
      about: {
        live: {
          headline: 'Average gamer. Community builder. Professional scoreboard victim.',
          storyCopy: 'Gaming was never about the scoreboard. It was always about the people.',
          quote: 'It’s all about the 💩 and giggles, folks.',
        },
        draft: {},
        backup: null,
      },
      community: {
        live: {
          headline: 'Welcome to TajSquad',
          bodyCopy: 'A community built around good people, good laughs, and good times.',
          discordUrl: '',
        },
        draft: {},
        backup: null,
      },
      merch: {
        live: {
          merchIntro: 'TwoToneTaj merch is being prepared and will launch when the store is ready.',
          comingSoonMessage: 'Merch coming soon.',
        },
        draft: {},
        backup: null,
      },
      contact: {
        live: {
          publicEmail: 'enquiries@ksjdigital.co.uk',
          discordUrl: '',
          linktreeUrl: '',
        },
        draft: {},
        backup: null,
      },
    },
  },

  users: [
    {
      id: 'ksj-admin',
      name: 'KSJ Digital Admin',
      email: 'enquiries@ksjdigital.co.uk',
      role: 'owner',
      status: 'Active',
      websiteIds: ['ksjdigital', 'twotonetaj'],
      lastLogin: 'Demo session',
    },
    {
      id: 'twotonetaj-client',
      name: 'TwoToneTaj',
      email: 'support@ksjdigital.co.uk',
      role: 'clientAdmin',
      status: 'Active',
      websiteIds: ['twotonetaj'],
      lastLogin: 'Not connected yet',
    },
  ],

  websites: [
    {
      id: 'ksjdigital',
      name: 'KSJ Digital',
      type: 'Business Website',
      domain: 'ksjdigital.co.uk',
      additionalDomains: ['www.ksjdigital.co.uk'],
      url: 'https://ksjdigital.co.uk/',
      status: 'Live',
      hostingStatus: 'Live',
      portalStatus: 'Active',
      sslStatus: 'Active',
      access: 'Owner Management',
      publishMode: 'Owner Controlled',
      plan: 'KSJ Internal',
      ownerUserId: 'ksj-admin',
      assignedUserIds: ['ksj-admin'],
      storageUsedMb: 128,
      storageLimitMb: 1024,
      analytics: { enabled: false, monthlyViews: 0, monthlyVisitors: 0, lastChecked: 'Not connected yet' },
      backup: { enabled: true, retentionHours: 48, status: 'No active backup', expiresAt: '', lastCreatedAt: '' },
      deployment: { provider: 'VPS / Nginx', vpsPath: 'Not connected yet', buildCommand: 'npm run build', lastBuild: 'Not built through portal yet', lastDeployment: 'Not deployed through portal yet', lastDeploymentStatus: 'Not Connected', lastCommitSha: '' },
      lastPublish: 'Not published through portal yet',
      lastEditor: 'KSJ Digital Admin',
      description: 'Internal KSJ Digital website and portal management access for the owner/admin account.',
    },
    {
      id: 'twotonetaj',
      name: 'TwoToneTaj',
      type: 'Creator Website',
      domain: 'twotonetaj.ksjdigital.co.uk',
      additionalDomains: [],
      url: 'https://twotonetaj.ksjdigital.co.uk/',
      status: 'Live',
      hostingStatus: 'Live',
      portalStatus: 'Active',
      sslStatus: 'Active',
      access: 'Website Management',
      publishMode: 'Approval Required',
      plan: 'Managed Website',
      ownerUserId: 'twotonetaj-client',
      assignedUserIds: ['twotonetaj-client'],
      storageUsedMb: 286,
      storageLimitMb: 2048,
      analytics: { enabled: false, monthlyViews: 0, monthlyVisitors: 0, lastChecked: 'Not connected yet' },
      backup: { enabled: true, retentionHours: 48, status: 'Active restore backup available', expiresAt: '48 hours after next publish', lastCreatedAt: 'Demo backup point' },
      deployment: { provider: 'VPS / Nginx', vpsPath: '/home/twotonetaj/site', buildCommand: 'npm run build', lastBuild: 'Not built through portal yet', lastDeployment: 'Not deployed through portal yet', lastDeploymentStatus: 'Queued For Portal Integration', lastCommitSha: '' },
      lastPublish: 'Not published through portal yet',
      lastEditor: 'TwoToneTaj',
      description: 'Client creator website managed through KSJ Digital Portals with draft-first publishing approval.',
    },
  ],

  drafts: [
    {
      id: 'twotonetaj-homepage-draft',
      websiteId: 'twotonetaj',
      pageId: 'homepage',
      section: 'Homepage',
      status: 'Draft Ready',
      updatedBy: 'TwoToneTaj',
      summary: 'Homepage content is ready to be edited through the portal editor.',
      currentVersion: 'Live homepage content currently published on the website.',
      draftVersion: 'Updated homepage content waiting for KSJ Digital review.',
      submittedAt: 'Not submitted yet',
    },
    {
      id: 'twotonetaj-about-draft',
      websiteId: 'twotonetaj',
      pageId: 'about',
      section: 'About',
      status: 'Needs Review',
      updatedBy: 'TwoToneTaj',
      summary: 'About page story content is prepared for draft editing.',
      currentVersion: 'Current About page content.',
      draftVersion: 'Revised About page draft for review.',
      submittedAt: 'Not submitted yet',
    },
  ],

  publishRequests: [
    {
      id: 'request-homepage-draft',
      websiteId: 'twotonetaj',
      draftId: 'twotonetaj-homepage-draft',
      pageId: 'homepage',
      title: 'Homepage draft review',
      requestedBy: 'TwoToneTaj',
      status: 'Draft',
      updatedAt: 'Awaiting first portal draft',
      summary: 'No live publish request has been submitted yet.',
    },
  ],

  supportTickets: [
    {
      id: 'ticket-001',
      websiteId: 'twotonetaj',
      clientId: 'twotonetaj-client',
      subject: 'Homepage content update question',
      status: 'Open',
      priority: 'Normal',
      assignedTo: 'ksj-admin',
      createdAt: 'Demo ticket',
      updatedAt: 'Awaiting staff reply',
      summary: 'Client needs help understanding how homepage edits will be reviewed before publishing.',
      messages: [
        { id: 'message-001', author: 'TwoToneTaj', type: 'client', body: 'Can you confirm if homepage edits are saved as drafts before anything goes live?', createdAt: 'Demo message' },
        { id: 'message-002', author: 'KSJ Digital Admin', type: 'staff', body: 'Yes. Content edits are saved as drafts first, then submitted for approval before publishing.', createdAt: 'Demo reply' },
      ],
      internalNotes: [
        { id: 'note-001', author: 'KSJ Digital Admin', body: 'Use this ticket as the default demo for the Support System V1 layout.', createdAt: 'Internal demo note' },
      ],
    },
    {
      id: 'ticket-002',
      websiteId: 'ksjdigital',
      clientId: 'ksj-admin',
      subject: 'SSL and domain check',
      status: 'Waiting On Staff',
      priority: 'High',
      assignedTo: 'ksj-admin',
      createdAt: 'Demo ticket',
      updatedAt: 'Needs review',
      summary: 'Internal check for SSL/domain status display in the portal.',
      messages: [
        { id: 'message-003', author: 'KSJ Digital Admin', type: 'staff', body: 'Review the domain and SSL controls once backend hosting actions are connected.', createdAt: 'Demo message' },
      ],
      internalNotes: [],
    },
  ],

  backups: [],

  deploymentQueue: [],

  deploymentHistory: [],

  activityLogs: [
    { id: 'activity-001', type: 'website.updated', label: 'Website settings updated', actor: 'KSJ Digital Admin', target: 'TwoToneTaj', timestamp: 'Just now' },
    { id: 'activity-002', type: 'support.updated', label: 'Support ticket updated', actor: 'KSJ Digital Admin', target: 'Homepage content update question', timestamp: 'Demo activity' },
    { id: 'activity-003', type: 'backup.ready', label: '48-hour restore backup available', actor: 'Portal System', target: 'TwoToneTaj', timestamp: 'Demo activity' },
    { id: 'activity-004', type: 'publish.pending', label: 'Publish request waiting for review', actor: 'TwoToneTaj', target: 'Homepage draft review', timestamp: 'Demo activity' },
  ],

  notifications: [
    { id: 'notice-001', type: 'publish', level: 'warning', message: '1 publish request is waiting for review.' },
    { id: 'notice-002', type: 'ticket', level: 'info', message: 'There are open support tickets requiring staff attention.' },
    { id: 'notice-003', type: 'backup', level: 'success', message: 'TwoToneTaj has a restore backup available for 48 hours after publish.' },
  ],

  settings: {
    backupRetentionHours: 48,
    defaultPublishMode: 'Approval Required',
    deploymentStatuses: ['Queued', 'Running', 'Success', 'Failed', 'Cancelled'],
    clientBackupWarning: 'A restore backup is kept for 48 hours after publishing. After 48 hours, the backup is permanently deleted and cannot be recovered.',
    contactEmails: {
      enquiries: 'enquiries@ksjdigital.co.uk',
      support: 'support@ksjdigital.co.uk',
      billing: 'billing@ksjdigital.co.uk',
      gaming: 'gaming@ksjdigital.co.uk',
    },
  },
};
