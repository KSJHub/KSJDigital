export const portalUsers = [
  {
    id: 'ksj-admin',
    name: 'KSJ Digital Admin',
    email: 'ksj@ksjdigital.co.uk',
    role: 'owner',
    status: 'Active',
    websiteIds: ['twotonetaj'],
    lastLogin: 'Demo session',
  },
  {
    id: 'twotonetaj-client',
    name: 'TwoToneTaj',
    email: 'media@ksjdigital.co.uk',
    role: 'client',
    status: 'Active',
    websiteIds: ['twotonetaj'],
    lastLogin: 'Not connected yet',
  },
];

export function getPortalUserById(userId) {
  return portalUsers.find((user) => user.id === userId) ?? null;
}

export function getPortalUsersByWebsite(websiteId) {
  return portalUsers.filter((user) => user.websiteIds.includes(websiteId));
}
