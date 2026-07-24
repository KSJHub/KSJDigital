import fs from 'node:fs/promises'

const files = {
  types: await fs.readFile('server/services/contentTypeRegistry.js', 'utf8'),
  workflow: await fs.readFile('server/services/contentWorkflowService.js', 'utf8'),
  scheduler: await fs.readFile('server/services/contentWorkflowScheduler.js', 'utf8'),
  records: await fs.readFile('server/services/contentRecordService.js', 'utf8'),
  dynamicRouter: await fs.readFile('server/dynamicContentRouter.js', 'utf8'),
  cmsRouter: await fs.readFile('server/cmsRouter.js', 'utf8'),
  start: await fs.readFile('server/start.js', 'utf8'),
}

const errors = []

for (const method of [
  'describeWorkflow',
  'listAvailableWorkflowTransitions',
  'applyWorkflowTransition',
  'listWorkflowHistory',
  'appendWorkflowHistory',
  'scheduledPublicationIsDue',
]) {
  if (!files.workflow.includes(`function ${method}`)) errors.push(`Workflow service is missing ${method}`)
}

for (const method of ['transitionContentRecord', 'processScheduledContentRecords']) {
  if (!files.records.includes(`function ${method}`)) errors.push(`Content record service is missing ${method}`)
}

if (!files.types.includes('workflowDefinition') || !files.types.includes("initialState: 'Draft'")) {
  errors.push('Content workflows are not registered through content type schema metadata')
}
if (!files.types.includes("id: 'In Review'") || !files.types.includes("id: 'Scheduled'") || !files.types.includes("id: 'Published'")) {
  errors.push('Article workflow states are incomplete')
}
if (!files.types.includes("id: 'submit'") || !files.types.includes("id: 'approve'") || !files.types.includes("id: 'schedule'")) {
  errors.push('Article workflow transitions are incomplete')
}
if (!files.records.includes('workflowProtectedInput') || !files.records.includes("'scheduledAt', 'publishedAt'")) {
  errors.push('Direct record updates do not protect workflow-managed fields')
}
if (!files.records.includes('saveContentRevision') || !files.records.includes('appendWorkflowHistory')) {
  errors.push('Workflow transitions do not preserve revisions and audit history')
}
if (!files.dynamicRouter.includes("/transitions/:transitionId") || !files.cmsRouter.includes("/transitions/:transitionId")) {
  errors.push('Workflow transition endpoints are not available across content APIs')
}
if (!files.scheduler.includes('setInterval') || !files.scheduler.includes('processScheduledContentRecords')) {
  errors.push('Scheduled publication processor is not persistent')
}
if (!files.start.includes('startContentWorkflowScheduler()')) {
  errors.push('Workflow scheduler does not start with the server')
}

const {
  applyWorkflowTransition,
  listAvailableWorkflowTransitions,
  scheduledPublicationIsDue,
} = await import('../server/services/contentWorkflowService.js')
const { describeContentType } = await import('../server/services/contentTypeRegistry.js')

const article = describeContentType('article')
if (article?.workflow?.initialState !== 'Draft') errors.push('Article workflow discovery does not expose its initial state')
if (!article?.workflow?.transitions?.some(transition => transition.id === 'approve' && transition.to === 'Published')) {
  errors.push('Article workflow discovery does not expose approval transitions')
}

const draft = { id: 'record-1', status: 'Draft', scheduledAt: null, publishedAt: null }
const editorTransitions = listAvailableWorkflowTransitions('article', draft, { canEdit: true })
if (!editorTransitions.some(transition => transition.id === 'submit')) {
  errors.push('Editors cannot discover the submit-for-review transition')
}
if (editorTransitions.some(transition => transition.id === 'approve')) {
  errors.push('Editors can discover an approval transition they cannot perform')
}

const submitted = applyWorkflowTransition('article', draft, 'submit', { canEdit: true }, { note: 'Ready' })
if (submitted.record.status !== 'In Review' || submitted.event.from !== 'Draft' || submitted.event.to !== 'In Review') {
  errors.push('Submit transition did not produce the expected state and audit event')
}

try {
  applyWorkflowTransition('article', submitted.record, 'approve', { canEdit: true })
  errors.push('Editor approval was accepted')
} catch (error) {
  if (error.status !== 403) errors.push('Editor approval did not return a permission error')
}

const scheduled = applyWorkflowTransition(
  'article',
  submitted.record,
  'schedule',
  { canApprove: true },
  { scheduledAt: new Date(Date.now() + 60_000).toISOString() },
)
if (scheduled.record.status !== 'Scheduled' || !scheduled.record.scheduledAt) {
  errors.push('Schedule transition did not store a future publication time')
}
if (!scheduledPublicationIsDue('article', { ...scheduled.record, scheduledAt: new Date(Date.now() - 1000).toISOString() })) {
  errors.push('Scheduled publication due detection failed')
}

const published = applyWorkflowTransition(
  'article',
  { ...scheduled.record, scheduledAt: new Date(Date.now() - 1000).toISOString() },
  'publish-scheduled',
  { role: 'owner' },
)
if (published.record.status !== 'Published' || !published.record.publishedAt || published.record.scheduledAt !== null) {
  errors.push('Scheduled publication transition did not finalise publication metadata')
}

if (errors.length) {
  errors.forEach(error => console.error(`Content workflow error: ${error}`))
  process.exit(1)
}

console.log('Content workflow check passed.')
