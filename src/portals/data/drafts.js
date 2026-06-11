export const portalDrafts = [
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
];

export function getDraftsByWebsite(websiteId) {
  return portalDrafts.filter((draft) => draft.websiteId === websiteId);
}
