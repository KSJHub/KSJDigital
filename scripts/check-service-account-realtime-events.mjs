import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const router = await fs.readFile(path.join(root, 'server/serviceAccountRouter.js'), 'utf8')

assert.match(router, /realtimeDomainEventService\.js/, 'Service account router must import the real-time domain publisher')

for (const topic of [
  'service-account.updated',
  'service-account.disabled',
  'service-account.key-issued',
  'service-account.key-rotated',
  'service-account.key-revoked',
]) {
  assert.ok(router.includes(`'${topic}'`), `Missing service account real-time topic: ${topic}`)
}

assert.match(router, /actorAccountId:\s*currentActor\.id/, 'Service account events must identify the authenticated account')
assert.match(router, /role:\s*req\.session\?\.role/, 'Service account event actors must include the authenticated role')
assert.match(router, /scopeCount:\s*issued\.key\.scopes\.length/, 'Issued key events must publish scope counts only')
assert.match(router, /metadataKeyCount:\s*Object\.keys\(account\.metadata \|\| \{\}\)\.length/, 'Service account events must reduce metadata to a count')

for (const forbidden of [
  /publishDomainEvent[\s\S]{0,600}\btoken\b/,
  /publishDomainEvent[\s\S]{0,600}\bsecretHash\b/,
  /publishDomainEvent[\s\S]{0,600}\bsalt\b/,
  /publishDomainEvent[\s\S]{0,600}\bscopes\b\s*[,}]/,
  /publishDomainEvent[\s\S]{0,600}\breason\b\s*[,}]/,
  /publishDomainEvent[\s\S]{0,600}\bmetadata\b\s*[,}]/,
]) {
  assert.doesNotMatch(router, forbidden, `Service account events expose forbidden credential metadata: ${forbidden}`)
}

console.log('Service account real-time event checks passed')
