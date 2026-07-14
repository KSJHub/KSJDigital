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

export function fieldRule(content, fieldId) {
  const policy = normaliseEditorPolicy(content)
  return {
    access: FIELD_ACCESS.EDITABLE,
    approvalRequired: true,
    movable: true,
    deletable: true,
    reason: '',
    ...(policy.fields[fieldId] || {}),
  }
}

export function canEditField(account, content, fieldId) {
  if (account?.role === 'owner') return true
  if (!account?.canEdit) return false
  return fieldRule(content, fieldId).access === FIELD_ACCESS.EDITABLE
}

export function updateFieldRule(content, fieldId, changes) {
  const policy = normaliseEditorPolicy(content)
  return {
    ...content,
    editorPolicy: {
      ...policy,
      fields: {
        ...policy.fields,
        [fieldId]: {
          ...fieldRule(content, fieldId),
          ...changes,
        },
      },
    },
  }
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
    if (index === keys.length - 1) {
      target[key] = value
      return
    }

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
