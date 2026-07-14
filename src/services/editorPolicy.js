export const FIELD_ACCESS = {
  EDITABLE: 'editable',
  VIEW_ONLY: 'view-only',
  HIDDEN: 'hidden',
  OWNER_ONLY: 'owner-only',
}

export function normaliseEditorPolicy(content = {}) {
  const policy = content.editorPolicy || {}
  return {
    fields: policy.fields && typeof policy.fields === 'object' ? policy.fields : {},
    sections: policy.sections && typeof policy.sections === 'object' ? policy.sections : {},
  }
}

function defaultFieldRule(fieldId) {
  if (fieldId === 'brand.supportCredit' || fieldId === 'globals.platformCredit') {
    return { access: FIELD_ACCESS.OWNER_ONLY, approvalRequired: true, movable: false, deletable: false, reason: 'KSJ Digital platform credit' }
  }
  return { access: FIELD_ACCESS.EDITABLE, approvalRequired: true, movable: true, deletable: true, reason: '' }
}

function defaultSectionRule(order = 0) {
  return { access: FIELD_ACCESS.EDITABLE, approvalRequired: true, movable: true, deletable: false, hidden: false, order, reason: '' }
}

export function fieldRule(content, fieldId) {
  const policy = normaliseEditorPolicy(content)
  return { ...defaultFieldRule(fieldId), ...(policy.fields[fieldId] || {}) }
}

export function sectionRule(content, sectionId, order = 0) {
  const policy = normaliseEditorPolicy(content)
  return { ...defaultSectionRule(order), ...(policy.sections[sectionId] || {}) }
}

export function canEditField(account, content, fieldId) {
  if (account?.role === 'owner') return true
  if (!account?.canEdit) return false
  return fieldRule(content, fieldId).access === FIELD_ACCESS.EDITABLE
}

export function canManageSection(account, content, sectionId) {
  if (account?.role === 'owner') return true
  if (!account?.canEdit) return false
  return sectionRule(content, sectionId).access === FIELD_ACCESS.EDITABLE
}

export function updateFieldRule(content, fieldId, changes) {
  const policy = normaliseEditorPolicy(content)
  return { ...content, editorPolicy: { ...policy, fields: { ...policy.fields, [fieldId]: { ...fieldRule(content, fieldId), ...changes } } } }
}

export function updateSectionRule(content, sectionId, changes) {
  const policy = normaliseEditorPolicy(content)
  return { ...content, editorPolicy: { ...policy, sections: { ...policy.sections, [sectionId]: { ...sectionRule(content, sectionId), ...changes } } } }
}

export function getPathValue(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source)
}

export function setPathValue(source, path, value) {
  const keys = String(path || '').split('.').filter(Boolean)
  if (!keys.length) return source
  const next = structuredClone(source || {})
  let target = next
  keys.forEach((key, index) => {
    if (index === keys.length - 1) { target[key] = value; return }
    const child = target[key]
    const nextKey = keys[index + 1]
    const nextIsIndex = /^\d+$/.test(nextKey)
    if (Array.isArray(child)) target[key] = [...child]
    else if (child && typeof child === 'object') target[key] = { ...child }
    else target[key] = nextIsIndex ? [] : {}
    target = target[key]
  })
  return next
}
