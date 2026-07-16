import fs from 'node:fs/promises'

const files = {
  capability: await fs.readFile('server/websiteCapabilities.js', 'utf8'),
  identity: await fs.readFile('server/identityAccessRuntime.js', 'utf8'),
  session: await fs.readFile('server/sessionAccess.js', 'utf8'),
  workspace: await fs.readFile('src/services/workspacePolicy.js', 'utf8'),
}

const errors = []

for (const marker of ['website', 'media', 'forms', 'commerce', 'team', 'support']) {
  if (!files.capability.includes(`'${marker}'`)) errors.push(`Missing website capability: ${marker}`)
}

if (!files.identity.includes('normaliseWebsiteCapabilities')) {
  errors.push('Website records are not migrated through the capability contract')
}
if (!files.session.includes('websiteCapabilities') || !files.session.includes('capabilitiesForWebsites')) {
  errors.push('Live sessions do not expose assigned website capabilities')
}
if (!files.workspace.includes('rule.capability')) {
  errors.push('Client workspace routes are not capability-gated')
}
for (const binding of [
  "capability: 'website'",
  "capability: 'media'",
  "capability: 'forms'",
  "capability: 'commerce'",
  "capability: 'team'",
  "capability: 'support'",
]) {
  if (!files.workspace.includes(binding)) errors.push(`Workspace policy is missing ${binding}`)
}

if (errors.length) {
  errors.forEach(error => console.error(`Website capability error: ${error}`))
  process.exit(1)
}

console.log('Website capability check passed.')
