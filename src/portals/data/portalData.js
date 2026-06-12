export const initialPortalData = {
  meta: {
    version: 1,
    name: 'KSJ Digital Portals',
    storageMode: 'frontend-json-demo',
  },

  users: [
    {
      id: 'ksj-admin',
      name: 'KSJ Digital Admin',
      email: 'ksj@ksjdigital.co.uk',
      role: 'owner',
      status: 'Active',
      websiteIds: ['ksjdigital', 'twotonetaj'],
      lastLogin: 'Demo session',
    },
    {
      id: 'twotonetaj-client',
      name: 'TwoToneTaj',
      email: 'media@ksjdigital.co.uk',
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
      url: 'https://ksjdigital.co.uk/',
      status: 'Live',
      access: 'Owner Management',
      publishMode: 'Owner Controlled',
      plan: 'KSJ Internal',
      assignedUserIds: ['ksj-admin'],
      description: 'Internal KSJ Digital website and portal management access for the owner/admin account.',
    },
    {
      id: 'twotonetaj',
      name: 'TwoToneTaj',
      type: 'Creator Website',
      domain: 'twotonetaj.ksjdigital.co.uk',
      url: 'https://twotonetaj.ksjdigital.co.uk/',
      status: 'Live',
      access: 'Website Management',
      publishMode: 'Approval Required',
      plan: 'Managed Website',
      assignedUserIds: ['twotonetaj-client'],
      description: 'Client creator website managed through KSJ Digital Portals with draft-first publishing approval.',
    },
  ],

  drafts: [
    {
      id: 'twotonetaj-homepage-draft',
      websiteId: 'twotonetaj',
      section: 'Homepage',
      status: 'Draft Ready',
      updatedBy: 'TwoToneTaj',
      summary: 'Homepage content is ready to be edited through the portal editor.',
    },
    {
      id: 'twotonetaj-about-draft',
      websiteId: 'twotonetaj',
      section: 'About',
      status: 'Needs Review',
      updatedBy: 'TwoToneTaj',
      summary: 'About page story content is prepared for draft editing.',
    },
  ],

  publishRequests: [
    {
      id: 'request-homepage-draft',
      websiteId: 'twotonetaj',
      title: 'Homepage draft review',
      requestedBy: 'TwoToneTaj',
      status: 'Draft',
      updatedAt: 'Awaiting first portal draft',
      summary: 'No live publish request has been submitted yet.',
    },
  ],

  supportTickets: [],
  backups: [],
  activityLogs: [],

  settings: {
    backupRetentionHours: 48,
    defaultPublishMode: 'Approval Required',
    clientBackupWarning: 'A restore backup is kept for 48 hours after publishing. After 48 hours, the backup is permanently deleted and cannot be recovered.',
  },
};
