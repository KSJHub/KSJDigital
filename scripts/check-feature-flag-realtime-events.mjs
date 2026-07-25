import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const router = await fs.readFile(path.join(root, 'server/featureFlagRouter.js'), 'utf8')

assert.match(router, /realtimeDomainEventService\.js/, 'Feature flag router must import the real-time domain publisher')

for (const topic of [
  'feature-flag.updated',
  'feature-flag.deleted',
  'feature-flag.kill-switch-changed',
  'feature-flag.evaluated',
  'feature-flag.batch-evaluated',
]) {
  assert.ok(router.includes(`'${topic}'`), `Missing feature flag real-time topic: ${topic}`)
}

assert.match(router, /accountId:\s*currentActor\.id/, 'Feature flag events must identify the authenticated account')
assert.match(router, /role:\s*req\.session\?\.role/, 'Feature flag event actors must include the authenticated role')
assert.match(router, /websiteTargetCount:\s*flag\.websiteIds\.length/, 'Feature flag events must publish website target counts only')
assert.match(router, /userTargetCount:\s*flag\.userIds\.length/, 'Feature flag events must publish user target counts only')
assert.match(router, /hasWebsiteContext:\s*Boolean\(evaluation\.context\.websiteId\)/, 'Evaluation events must reduce website context to presence metadata')
assert.match(router, /hasUserContext:\s*Boolean\(evaluation\.context\.userId\)/, 'Evaluation events must reduce user context to presence metadata')

for (const forbidden of [
  /publishDomainEvent[\s\S]{0,500}\bsalt\b/,
  /publishDomainEvent[\s\S]{0,500}\bbucket\b/,
  /publishDomainEvent[\s\S]{0,500}\bsubject\b/,
  /publishDomainEvent[\s\S]{0,500}\bwebsiteIds\b\s*[,}]/,
  /publishDomainEvent[\s\S]{0,500}\buserIds\b\s*[,}]/,
  /publishDomainEvent[\s\S]{0,500}\bexcludedWebsiteIds\b/,
  /publishDomainEvent[\s\S]{0,500}\bexcludedUserIds\b/,
]) {
  assert.doesNotMatch(router, forbidden, `Feature flag events expose forbidden targeting metadata: ${forbidden}`)
}

console.log('Feature flag real-time event checks passed')
