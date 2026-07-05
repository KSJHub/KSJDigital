export const inspectorWebsite = {
  id: 'twotonetaj',
  name: 'TwoToneTaj',
  client: 'Taj',
  status: 'Live',
  plan: 'Premium',
  domain: 'twotonetaj.ksjdigital.co.uk',
  access: 'Client can edit approved content fields only',
}

export const inspectorControls = [
  ['Open Client View', 'Preview exactly what the assigned client can see'],
  ['Impersonate Client', 'Check permissions and client-only workflows'],
  ['Lock Website', 'Pause client edits while owner reviews changes'],
  ['Force Publish', 'Owner-only publish action for approved urgent updates'],
  ['Restore Version', 'Rollback to a previous approved website version'],
  ['Archive Website', 'Disable access and remove from active client list'],
]

export const accessAudit = [
  ['Client access', 'Taj', 'Editor, media, analytics, support'],
  ['Publish access', 'Taj', 'Request only'],
  ['Owner access', 'Morgan', 'Full control'],
  ['Viewer access', 'None', 'Not enabled'],
]

export const websiteLocks = [
  ['Layout', 'Locked', 'Client cannot change layout or CSS'],
  ['Brand system', 'Owner controlled', 'Logo, fonts and theme rules protected'],
  ['Pages', 'Editable', 'Safe fields only'],
  ['Publishing', 'Owner approved', 'Client cannot deploy directly'],
]

export const inspectorTimeline = [
  ['Client edited homepage draft', 'Today'],
  ['Draft saved in editor', 'Today'],
  ['Community update requested', 'Yesterday'],
  ['About page version published', 'Last week'],
]
