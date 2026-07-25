import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/authenticationAdminRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'authentication.session-revoked',
  'authentication.account-sessions-revoked',
  'authentication.password-reset-issued',
  'authentication.password-reset-completed',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Authentication administration must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing authentication real-time event: ${topic}`)
}

function eventCalls(code, marker) {
  const calls = []
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

const events = eventCalls(router, 'publishAuthenticationEvent(').join('\n')
const forbiddenPayloads = [
  'token:',
  'password:',
  'accountId:',
  'sessionId:',
  'email:',
  'cookie:',
  'authorization:',
  'ip:',
  'userAgent:',
  'req.body',
  'req.params',
  'error.message',
]

for (const fragment of forbiddenPayloads) {
  if (events.includes(fragment)) throw new Error(`Authentication events expose forbidden security data: ${fragment}`)
}

if (!events.includes('revokedCount: result.revoked')) {
  throw new Error('Authentication account and password-reset events must publish aggregate revoked-session counts')
}
if (!events.includes('expiresAt: result.expiresAt')) {
  throw new Error('Password reset issuance must publish expiry metadata without the reset token')
}
if (!events.includes('assuranceLevel: 2')) {
  throw new Error('Privileged authentication administration events must identify the required assurance level')
}
if (events.includes('result.token')) {
  throw new Error('Password reset tokens must never be included in authentication events')
}

console.log('Authentication administration real-time event checks passed')
