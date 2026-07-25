import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/mfaRouter.js', import.meta.url), 'utf8')

const requiredTopics = [
  'mfa.enrollment-started',
  'mfa.enabled',
  'mfa.verified',
  'mfa.verification-failed',
  'mfa.trusted-device-verified',
  'mfa.disabled',
  'mfa.login-risk-evaluated',
  'mfa.step-up-created',
  'mfa.step-up-completed',
  'mfa.trusted-device-revoked',
]

if (!router.includes("import { publishDomainEvent } from './services/realtimeDomainEventService.js'")) {
  throw new Error('MFA router must publish through the canonical real-time domain event service')
}

for (const topic of requiredTopics) {
  if (!router.includes(`'${topic}'`)) throw new Error(`Missing MFA real-time event: ${topic}`)
}

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

const events = domainEventCalls(router).join('\n')
const forbiddenPayloads = [
  'secret:',
  'otpauthUri:',
  'recoveryCodes:',
  'recoveryCode:',
  'trustedDeviceToken:',
  'token:',
  'code:',
  'userAgent:',
  'ip:',
  'req.body',
  'error.message',
]
for (const fragment of forbiddenPayloads) {
  if (events.includes(fragment)) throw new Error(`MFA events expose forbidden authentication data: ${fragment}`)
}

if (!events.includes("reason: 'verification-failed'")) throw new Error('Failed MFA events must publish a bounded reason code')
if (!events.includes('recoveryCodesRemaining:')) throw new Error('MFA enabled events must publish only the remaining recovery-code count')
if (!events.includes('trustedDeviceCreated: Boolean(result.trustedDevice)')) throw new Error('MFA verification events must publish only a trusted-device creation signal')

console.log('MFA real-time event checks passed')
