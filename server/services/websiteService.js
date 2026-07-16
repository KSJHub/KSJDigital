import { normaliseOrderPrefix } from '../commerceSettingsRouter.js'
import { starterWebsites } from '../defaults.js'
import { paths, readJson, safeName, writeJson } from '../storage.js'
import { normaliseWebsiteCapabilities } from '../websiteCapabilities.js'

const PLATFORM_WEBSITE_ID = 'ksjdigital'
const EDITABLE_FIELDS = [
  'name',
  'domain',
  'developmentEditorUrl',
  'status',
  'pageCount',
  'mediaCount',
  'owner',
  'logo',
  'orderPrefix',
  'plan',
  'seo',
  'performance',
  'repository',
  'notes',
]

export class WebsiteServiceError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'WebsiteServiceError'
    this.status = status
  }
}

function cleanText(value = '') {
  return String(value ?? '').trim()
}

function cleanUrl(value = '') {
  const text = cleanText(value)
  if (!text) return ''
  try {
    return new URL(text).toString()
  } catch {
    throw new WebsiteServiceError('Website URLs must be valid')
  }
}

function wholeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback
}

function normaliseId(value = '') {
  return safeName(value).replace(/[._]+/g, '-')
}

function normaliseRecord(input = {}, existing = null) {
  const now = new Date().toISOString()
  const base = existing || {}
  const id = existing?.id || normaliseId(input.id || input.name || `website-${Date.now()}`)
  if (!id) throw new WebsiteServiceError('Website name or id is required')

  const record = { ...base }
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) record[field] = input[field]
  }

  return {
    ...record,
    id,
    name: cleanText(record.name) || 'New Website',
    domain: cleanUrl(record.domain),
    developmentEditorUrl: cleanUrl(record.developmentEditorUrl),
    status: cleanText(record.status) || 'Draft',
    pageCount: wholeNumber(record.pageCount),
    mediaCount: wholeNumber(record.mediaCount),
    owner: cleanText(record.owner),
    logo: cleanText(record.logo),
    orderPrefix: normaliseOrderPrefix(record.orderPrefix),
    plan: cleanText(record.plan) || 'Build',
    seo: wholeNumber(record.seo),
    performance: wholeNumber(record.performance),
    repository: cleanText(record.repository),
    notes: cleanText(record.notes),
    capabilities: normaliseWebsiteCapabilities(input.capabilities ?? existing?.capabilities),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

function assertUnique(websites, candidate, ignoredId = '') {
  const candidateDomain = candidate.domain.toLowerCase().replace(/\/$/, '')
  const candidatePrefix = normaliseOrderPrefix(candidate.orderPrefix)

  for (const website of websites) {
    if (website.id === ignoredId) continue
    if (website.id === candidate.id) throw new WebsiteServiceError('A website with this id already exists', 409)

    const domain = cleanText(website.domain).toLowerCase().replace(/\/$/, '')
    if (candidateDomain && domain === candidateDomain) {
      throw new WebsiteServiceError('A website with this domain already exists', 409)
    }

    const prefix = normaliseOrderPrefix(website.orderPrefix)
    if (candidatePrefix && prefix === candidatePrefix) {
      throw new WebsiteServiceError('A website with this order prefix already exists', 409)
    }
  }
}

export async function listWebsites() {
  const stored = await readJson(paths.websites(), null)
  if (Array.isArray(stored)) return stored
  await writeJson(paths.websites(), starterWebsites)
  return starterWebsites
}

export function websitesForSession(websites, session = {}) {
  if (session.role === 'owner') return websites
  const allowed = new Set((session.websiteIds || (session.websiteId ? [session.websiteId] : [])).map(safeName))
  return websites.filter(website => allowed.has(safeName(website.id)))
}

export async function createWebsite(input = {}) {
  const websites = await listWebsites()
  const website = normaliseRecord(input)
  assertUnique(websites, website)
  await writeJson(paths.websites(), [...websites, website])
  return website
}

export async function updateWebsite(id, input = {}) {
  const websiteId = normaliseId(id)
  const websites = await listWebsites()
  const existing = websites.find(website => normaliseId(website.id) === websiteId)
  if (!existing) throw new WebsiteServiceError('Website not found', 404)

  const website = normaliseRecord(input, existing)
  assertUnique(websites, website, existing.id)
  const next = websites.map(item => item.id === existing.id ? website : item)
  await writeJson(paths.websites(), next)
  return website
}

export async function deleteWebsite(id) {
  const websiteId = normaliseId(id)
  if (websiteId === PLATFORM_WEBSITE_ID) {
    throw new WebsiteServiceError('The KSJ Digital platform website cannot be deleted', 403)
  }

  const websites = await listWebsites()
  if (!websites.some(website => normaliseId(website.id) === websiteId)) {
    throw new WebsiteServiceError('Website not found', 404)
  }

  const next = websites.filter(website => normaliseId(website.id) !== websiteId)
  await writeJson(paths.websites(), next)
  return next
}
