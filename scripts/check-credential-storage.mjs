import fs from 'node:fs/promises'

const files = {
  store: await fs.readFile('server/credentialStore.js', 'utf8'),
  guard: await fs.readFile('server/authLoginGuard.js', 'utf8'),
  storage: await fs.readFile('server/storage.js', 'utf8'),
  runtime: await fs.readFile('server/runtimeGlobals.js', 'utf8'),
  start: await fs.readFile('server/start.js', 'utf8'),
  team: await fs.readFile('server/teamRouter.js', 'utf8'),
}

const errors = []

for (const marker of ['scrypt-v1', 'timingSafeEqual', 'migratePlaintextCredentials', 'setPassword', 'removeCredential']) {
  if (!files.store.includes(marker)) errors.push(`credentialStore.js is missing ${marker}`)
}

if (!files.guard.includes('verifyPassword(password, credential.passwordHash)')) {
  errors.push('Login guard is not verifying the protected password hash')
}
if (!files.guard.includes('runVerifiedLogin')) errors.push('Login compatibility context is not active')
if (!files.storage.includes('currentVerifiedLogin')) errors.push('Stored accounts are not protected from plaintext login persistence')
if (!files.runtime.includes('await migratePlaintextCredentials()')) errors.push('Credential migration is not run during startup')
if (files.start.includes('next.accessCode = desired')) errors.push('start.js can still write plaintext starter credentials')
if (!files.start.includes('synchroniseConfiguredCredentials')) errors.push('Configured credentials are not synchronised into the protected store')
if (files.team.includes('accessCode,\n      role:')) errors.push('Team creation still stores a plaintext access code')
if (!files.team.includes('await setPassword(member.id, temporaryPassword)')) errors.push('Team creation does not store a protected password')

if (errors.length) {
  errors.forEach(error => console.error(`Credential storage error: ${error}`))
  process.exit(1)
}

console.log('Credential storage hardening check passed.')
