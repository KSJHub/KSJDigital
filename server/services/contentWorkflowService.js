import crypto from 'node:crypto'
import path from 'node:path'
import { getContentType } from './contentTypeRegistry.js'
import { DATA_DIR, readJson, safeName, writeJson } from '../storage.js'
import { publishDomainEvent } from './realtimeDomainEventService.js'

const MAX_WORKFLOW_EVENTS_PER_RECORD = 500

export class ContentWorkflowError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'ContentWorkflowError'
    this.status = status
    this.details = details
  }
}

function workflowPath(websiteId, typeId, recordId) {
  return path.join(
    DATA_DIR,
    'content-workflows',
    safeName(websiteId),
    safeName(typeId),
    `${safeName(recordId)}.json`,
  )
}

function workflowDefinition(typeId) {
  const definition = getContentType(typeId)
  if (!definition) throw new ContentWorkflowError(`Unknown content type: ${typeId}`, 404)
  if (!definition.workflow) throw new ContentWorkflowError(`Content type ${typeId} does not define a workflow`, 409)
  return definition.workflow
}

function actorRole(actor = {}) {
  if (actor.role === 'owner') return 'owner'
  if (actor.role === 'approver' || actor.canApprove) return 'approver'
  if (actor.canEdit) return 'editor'
  return 'viewer'
}

function actorSnapshot(actor = {}) {
  return {
    id: String(actor.id || actor.userId || actor.email || 'system'),
    name: String(actor.name || actor.displayName || actor.email || 'System'),
    role: actorRole(actor),
  }
}

function transitionAllowed(transition, actor) {
  const roles = Array.isArray(transition.roles) ? transition.roles : []
  return roles.length === 0 || roles.includes(actorRole(actor)) || actorRole(actor) === 'owner'
}

async function publishContentWorkflowEvent(topic, payload) {
  await publishDomainEvent(topic, payload)
}

export function describeWorkflow(typeId) {
  const workflow = workflowDefinition(typeId)
  return {
    field: workflow.field,
    initialState: workflow.initialState,
    states: workflow.states.map(state => ({ ...state })),
    transitions: workflow.transitions.map(transition => ({ ...transition, from: [...transition.from], roles: [...transition.roles] })),
  }
}

export function listAvailableWorkflowTransitions(typeId, record, actor = {}) {
  const workflow = workflowDefinition(typeId)
  const currentState = String(record?.[workflow.field] || workflow.initialState)
  return workflow.transitions
    .filter(transition => transition.from.includes(currentState) && transitionAllowed(transition, actor))
    .map(transition => ({ ...transition, from: [...transition.from], roles: [...transition.roles] }))
}

export function applyWorkflowTransition(typeId, record, transitionId, actor = {}, input = {}) {
  const workflow = workflowDefinition(typeId)
  const currentState = String(record?.[workflow.field] || workflow.initialState)
  const transition = workflow.transitions.find(item => item.id === transitionId)
  if (!transition) throw new ContentWorkflowError('Workflow transition not found', 404)
  if (!transition.from.includes(currentState)) {
    throw new ContentWorkflowError('Workflow transition is not available from the current state', 409, {
      currentState,
      transition: transition.id,
      allowedFrom: transition.from,
    })
  }
  if (!transitionAllowed(transition, actor)) {
    throw new ContentWorkflowError('Workflow transition permission denied', 403, {
      transition: transition.id,
      requiredRoles: transition.roles,
    })
  }

  const now = new Date().toISOString()
  const next = {
    ...record,
    [workflow.field]: transition.to,
  }

  if (transition.to === 'Scheduled') {
    const scheduledAt = new Date(input.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new ContentWorkflowError('A future scheduled publication time is required', 422, {
        field: 'scheduledAt',
        code: 'future_date_required',
      })
    }
    next.scheduledAt = scheduledAt.toISOString()
    next.publishedAt = null
  } else {
    next.scheduledAt = null
  }

  if (transition.to === 'Published') next.publishedAt = record.publishedAt || now
  if (transition.to === 'Draft') next.publishedAt = null

  return {
    record: next,
    event: {
      id: crypto.randomUUID(),
      transition: transition.id,
      label: transition.label,
      from: currentState,
      to: transition.to,
      note: String(input.note || '').trim(),
      actor: actorSnapshot(actor),
      createdAt: now,
    },
  }
}

export async function listWorkflowHistory(websiteId, typeId, recordId) {
  const events = await readJson(workflowPath(websiteId, typeId, recordId), [])
  return Array.isArray(events) ? events : []
}

export async function appendWorkflowHistory(websiteId, typeId, recordId, event) {
  const events = await listWorkflowHistory(websiteId, typeId, recordId)
  const existing = event?.id ? events.find(item => item?.id === event.id) : null
  if (existing) return existing

  const next = [event, ...events].slice(0, MAX_WORKFLOW_EVENTS_PER_RECORD)
  await writeJson(workflowPath(websiteId, typeId, recordId), next)
  await publishContentWorkflowEvent('content-workflow.history-appended', {
    historyCount: next.length,
    retentionLimitReached: events.length >= MAX_WORKFLOW_EVENTS_PER_RECORD,
    historyPruned: events.length + 1 > next.length,
    hasNote: Boolean(String(event?.note || '').trim()),
    automaticActor: event?.actor?.id === 'system',
  })
  return event
}

export function scheduledPublicationIsDue(typeId, record, now = new Date()) {
  const workflow = workflowDefinition(typeId)
  if (record?.[workflow.field] !== 'Scheduled' || !record.scheduledAt) return false
  const scheduledAt = new Date(record.scheduledAt)
  return !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() <= now.getTime()
}
