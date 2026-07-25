import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/abuseProtectionRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/abuseProtectionService.js', import.meta.url), 'utf8')

const requiredTopics = [
  'abuse-protection.policy-updated',
  'abuse-protection.policy-deleted',
  'abuse-protection.trusted-proxies-updated',
  'abuse-protection.override-created',
  'abuse-protection.override-removed',
  'abuse-protection.request-blocked',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('Abuse protection router must publish through the canonical real-time domain event service')
}
if (!service.includes("import { publishDomainEvent } from './realtimeDomainEventService.js'")) {
  throw new Error('Abuse protection service must publish through the canonical real-time domain event service')
}

const source = `${router}\n${service}`
for (const topic of requiredTopics) {
  if (!source.includes(`'${topic}'`)) throw new Error(`Missing abuse protection real-time event: ${topic}`)
}

function callsFor(code, marker) {
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

const events = [
  ...callsFor(router, 'publishAbuseEvent('),
  ...callsFor(service, 'publishDomainEvent('),
].join('\n')

const forbiddenPayloads = [
  'subjectId:',
  'trustedProxies:',
  'req.body',
  'req.headers',
  'x-forwarded-for',
  'ip:',
  'sessionId:',
  'accountId:',
  'apiKeyId:',
  'error.message',
  'error.details',
]
for (const fragment of forbiddenPayloads) {
  if (events.includes(fragment)) throw new Error(`Abuse protection events expose forbidden subject data: ${fragment}`)
}

if (!events.includes('trustedProxyCount: trustedProxies.length')) {
  throw new Error('Trusted proxy events must publish only an aggregate count')
}
if (!events.includes('methodCount: result.methods.length') || !events.includes('subjectTypeCount: result.subjectTypes.length')) {
  throw new Error('Policy events must publish bounded configuration counts')
}
if (!events.includes('subjectType: decision.subjectType') || !events.includes('retryAfterMs: decision.retryAfterMs')) {
  throw new Error('Blocked-request events must publish safe enforcement metadata')
}

console.log('Abuse protection real-time event checks passed')
