export const portalWebsites = [
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
  },
];

export function getPortalWebsiteById(websiteId) {
  return portalWebsites.find((website) => website.id === websiteId) ?? null;
}

export function getPortalWebsitesByUser(user) {
  if (!user?.websiteIds) return [];
  return portalWebsites.filter((website) => user.websiteIds.includes(website.id));
}
