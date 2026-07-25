import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const service = await fs.readFile(path.join(root, 'server/services/serviceAccountService.js'), 'utf8')

assert.match(service, /realtimeDomainEventService\.js/, 'API key authentication must import the real-time domain publisher')

for (const topic of [
  'api-key.authenticated',
  'api-key.authentication-failed',
  'api-key.expired',
  'api-key.rate-limit-exceeded',
]) {
  assert.ok(service.includes(`'${topic}'`), `Missing API key real-time topic: ${topic}`)
}

assert.match(service, /accountId:\s*authenticated\.account\.id/, 'Successful authentication events must identify the service account')
assert.match(service, /keyId:\s*authenticated\.key\.id/, 'Successful authentication events must identify the API key')
assert.match(service, /requiredScope:\s*requiredScope \|\| null/, 'Authentication events must publish only the required scope')
assert.match(service, /reason:\s*failure\.reason/, 'Failure events must use bounded reason codes')
assert.match(service, /retryable:\s*Number\(error\.status\) === 429/, 'Rate-limit events must expose retryability metadata')

for (const forbidden of [
  /publishDomainEvent[\s\S]{0,700}\bsecret\b/,
  /publishDomainEvent[\s\S]{0,700}\bsecretHash\b/,
  /publishDomainEvent[\s\S]{0,700}\bsalt\b/,
  /publishDomainEvent[\s\S]{0,700}\bauthorization\b/,
  /publishDomainEvent[\s\S]{0,700}\bx-api-key\b/,
  /publishDomainEvent[\s\S]{0,700}\boriginalUrl\b/,
  /publishDomainEvent[\s\S]{0,700}\bresource\b/,
  /publishDomainEvent[\s\S]{0,700}\berror\.message\b/,
]) {
  assert.doesNotMatch(service, forbidden, `API key events expose forbidden authentication data: ${forbidden}`)
}

console.log('API key real-time event checks passed')
