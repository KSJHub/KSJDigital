import { api } from './api.js'

export function getForms(websiteId) {
  return api.getForms(websiteId)
}

export function saveForms(websiteId, forms) {
  return api.saveForms(websiteId, forms)
}

export function createForm(websiteId, name = 'New Form') {
  return api.createForm(websiteId, { name })
}

export function updateForm(websiteId, formId, changes) {
  return api.updateForm(websiteId, formId, changes)
}

export function deleteForm(websiteId, formId) {
  return api.deleteForm(websiteId, formId)
}

export function addField(websiteId, formId, type = 'Text') {
  return api.addField(websiteId, formId, { type })
}

export function updateField(websiteId, formId, fieldId, changes) {
  return api.updateField(websiteId, formId, fieldId, changes)
}

export function deleteField(websiteId, formId, fieldId) {
  return api.deleteField(websiteId, formId, fieldId)
}

export function moveField(websiteId, formId, fieldId, direction) {
  return api.moveField(websiteId, formId, fieldId, direction)
}

export function submitTestForm(websiteId, formId) {
  return api.submitTestForm(websiteId, formId)
}
