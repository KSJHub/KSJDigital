import fs from 'node:fs/promises'

const router = await fs.readFile(new URL('../server/configurationRouter.js', import.meta.url), 'utf8')
const service = await fs.readFile(new URL('../server/services/configurationService.js', import.meta.url), 'utf8')
const failures = []

for (const token of [
  "publishConfigurationRealtimeEvent('configuration.validated'",
  "publishConfigurationRealtimeEvent('configuration.deployment-readiness-checked'",
  "publishConfigurationRealtimeEvent('configuration.updated'",
  "publishConfigurationRealtimeEvent('configuration.environment-activated'",
  "publishConfigurationRealtimeEvent('configuration.secret-updated'",
  "publishConfigurationRealtimeEvent('configuration.secret-deleted'",
  'configuredValueCount:',
  'secretCount:',
  'configuredSecretCount:',
  'checkCount:',
  'failedCheckCount:',
  'warningCheckCount:',
  'validationErrorCount:',
  'validationWarningCount:',
  'changedValueCount:',
  'restartRequiredCount:',
]) {
  if (!router.includes(token)) failures.push(`Missing configuration realtime marker: ${token}`)
}

const payloadStart = router.indexOf('function configurationRegistryPayload(')
const payloadEnd = router.indexOf('\n}\n\nasync function publishConfigurationRealtimeEvent', payloadStart)
const payloadSource = payloadStart >= 0 && payloadEnd > payloadStart ? router.slice(payloadStart, payloadEnd) : ''

for (const forbidden of [
  'environment:', 'activeEnvironment:', 'version:', 'values:', 'schema:', 'secrets:', 'updatedAt:',
  'changedKeys:', 'restartRequired:', 'previousEnvironment:', 'activatedAt:', 'secretName:', 'source:',
  'environmentVariable:', 'checkedAt:', 'failedChecks:', 'warningChecks:', 'reference:', 'name:',
  'actor:', 'session', 'email:', 'role:', 'payload:', 'req.body', 'req.params', 'req.query',
  '...configuration', '...details', 'error.message', 'error.details', 'encrypted:', 'ciphertext:',
]) {
  if (payloadSource.includes(forbidden)) failures.push(`Configuration event payload exposes forbidden data: ${forbidden}`)
}

if (!router.includes("async function publishConfigurationRealtimeEvent(topic, payload) {\n  await publishDomainEvent(topic, payload)\n}")) {
  failures.push('Configuration events must use an awaited aggregate-only canonical publisher')
}

const validateOperation = router.indexOf('const validation = await validateConfiguration(')
const validatePublish = router.indexOf("await publishConfigurationRealtimeEvent('configuration.validated'")
if (validateOperation < 0 || validatePublish < validateOperation) failures.push('Configuration validation must complete before publication')

const readinessOperation = router.indexOf('const readiness = await deploymentReadiness(')
const readinessPublish = router.indexOf("await publishConfigurationRealtimeEvent('configuration.deployment-readiness-checked'")
if (readinessOperation < 0 || readinessPublish < readinessOperation) failures.push('Deployment readiness must complete before publication')

const updateGuard = router.indexOf('if (changedValueCount === 0) return res.json(')
const updateMutation = router.indexOf('const configuration = await updateConfiguration(')
const updatePublish = router.indexOf("await publishConfigurationRealtimeEvent('configuration.updated'")
if (updateGuard < 0 || updateMutation < updateGuard || updatePublish < updateMutation) failures.push('Unchanged configuration updates must return before persistence and publication')

const activationGuard = router.indexOf('if (before.activeEnvironment === before.environment) return res.json(')
const activationMutation = router.indexOf('const activation = await activateEnvironment(')
const activationPublish = router.indexOf("await publishConfigurationRealtimeEvent('configuration.environment-activated'")
if (activationGuard < 0 || activationMutation < activationGuard || activationPublish < activationMutation) failures.push('Repeated environment activation must return before persistence and publication')

const secretGuard = router.indexOf("if (req.body?.source === 'environment' && existing?.source === 'environment'")
const secretMutation = router.indexOf('const secret = await setSecret(')
const secretPublish = router.indexOf("await publishConfigurationRealtimeEvent('configuration.secret-updated'")
if (secretGuard < 0 || secretMutation < secretGuard || secretPublish < secretMutation) failures.push('Equivalent secret references must return before persistence and publication')

const deleteGuard = router.indexOf('if (!configuration.secrets.some(secret => secret.name === req.params.name)) return res.json(')
const deleteMutation = router.indexOf('const result = await deleteSecret(')
const deletePublish = router.indexOf("await publishConfigurationRealtimeEvent('configuration.secret-deleted'")
if (deleteGuard < 0 || deleteMutation < deleteGuard || deletePublish < deleteMutation) failures.push('Missing secrets must not be persisted or published')

if (!service.includes('if (result?.__skipWrite === true) return result.value')) failures.push('Configuration storage must support semantic no-write results')
if (!service.includes('if (JSON.stringify(after) === JSON.stringify(before)) return { __skipWrite: true')) failures.push('Equivalent configuration values must not rewrite storage')
if (!service.includes("if (existing?.source === source && existing.environment === environment) return { __skipWrite: true")) failures.push('Equivalent environment-backed secret references must not rewrite storage')
if (!service.includes("if (!registry.secrets[name]) return { __skipWrite: true, value: { deleted: false, name } }")) failures.push('Missing secret deletion must not rewrite storage')
if (!service.includes("if (previous === environment) return { __skipWrite: true, value: { previous, environment, unchanged: true } }")) failures.push('Repeated environment activation must not rewrite storage')

for (const topic of [
  'configuration.validated',
  'configuration.deployment-readiness-checked',
  'configuration.updated',
  'configuration.environment-activated',
  'configuration.secret-updated',
  'configuration.secret-deleted',
]) {
  if (router.includes(`publishDomainEvent('${topic}'`)) failures.push(`Configuration topic must be owned by the canonical publisher: ${topic}`)
}

if (failures.length) {
  console.error('Configuration real-time event check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Configuration real-time event checks passed')
