export const publishQueue = [
  { id: 'pub-001', website: 'TwoToneTaj', title: 'Homepage hero update', status: 'Pending Review', requester: 'Taj', updated: 'Today', fields: ['Hero Title', 'Hero Subtitle', 'Primary Button'], risk: 'Low', target: 'TwoToneTaj website content' },
  { id: 'pub-002', website: 'TwoToneTaj', title: 'Community page copy', status: 'Draft Saved', requester: 'Taj', updated: 'Yesterday', fields: ['Community Intro', 'Discord CTA'], risk: 'Low', target: 'TwoToneTaj website content' },
  { id: 'pub-003', website: 'Goliath', title: 'Launch page wording', status: 'Client Editing', requester: 'Goliath Admin', updated: '2 days ago', fields: ['Launch Title', 'Launch Text'], risk: 'Medium', target: 'Goliath website content' },
]

export const deploymentChecklist = [
  ['Validate fields', 'Check only safe content fields changed'],
  ['Preview changes', 'Confirm page still matches approved design'],
  ['Owner approval', 'Owner/admin accepts or rejects request'],
  ['Prepare website update', 'Create safe content update for target website'],
  ['Deploy live', 'Deployment process updates live website'],
]

export const deploymentHistory = [
  ['TwoToneTaj', 'Homepage SEO update', 'Published', '3 days ago'],
  ['TwoToneTaj', 'About card wording', 'Published', 'Last week'],
  ['Goliath', 'Initial landing page draft', 'Draft', 'Last week'],
]
