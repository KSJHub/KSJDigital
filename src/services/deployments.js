export const deploymentTargets = [
  { id: 'twotonetaj', website: 'TwoToneTaj', status: 'Live', environment: 'Production', branch: 'main', domain: 'twotonetaj.com', lastDeploy: '3 days ago', health: 'Healthy' },
  { id: 'ksjdiamondgaming', website: 'KSJ Diamond Gaming', status: 'Preparing', environment: 'Staging', branch: 'main', domain: 'ksjdiamondgaming.com', lastDeploy: 'Not deployed', health: 'Pending' },
  { id: 'goliath', website: 'Goliath', status: 'In Build', environment: 'Preview', branch: 'main', domain: 'goliath.gg', lastDeploy: 'Last week', health: 'Review' },
]

export const deploymentSteps = [
  ['Content approved', 'Owner/admin approves the client request'],
  ['Website package prepared', 'Safe content update is prepared for the connected website'],
  ['Build started', 'Website build process begins'],
  ['VPS update', 'Live server receives the new build'],
  ['Live verification', 'KSJ Digital confirms the website is online'],
]

export const deploymentLogs = [
  ['TwoToneTaj', 'Homepage SEO update', 'Success', '3 days ago'],
  ['TwoToneTaj', 'About wording update', 'Success', 'Last week'],
  ['Goliath', 'Preview build prepared', 'Success', 'Last week'],
  ['KSJ Diamond Gaming', 'Initial deployment pending', 'Pending', 'Not started'],
]
