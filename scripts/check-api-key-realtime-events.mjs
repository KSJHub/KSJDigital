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

function domainEventCalls(code) {
  const calls = []
  const marker = 'publishDomainEvent('
  let start = 0
  while ((start = code.indexOf(marker, start)) !== -1) {
    let depth = 0
    let quote = null
    let escaped = false
    let end = start + marker.length
    for (; end < code.length; end += 1) {
      const character = code[end]
      if (quote) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = null
        continue
      }
      if (character === "'" || character === '"' || character === '`') { quote = character; continue }
      if (character === '(') depth += 1
      else if (character === ')') {
        if (depth === 0) { end += 1; break }
        depth -= 1
      }
    }
    calls.push(code.slice(start, end))
    start = end
  }
  return calls
}

const eventCalls = domainEventCalls(service).join('\n')

for (const forbidden of [
  /\bsecret\b/,
  /\bsecretHash\b/,
  /\bsalt\b/,
  /\bauthorization\b/,
  /\bx-api-key\b/,
  /\boriginalUrl\b/,
  /\bresource\b/,
  /\berror\.message\b/,
]) {
  assert.doesNotMatch(eventCalls, forbidden, `API key events expose forbidden authentication data: ${forbidden}`)
}

console.log('API key real-time event checks passed')