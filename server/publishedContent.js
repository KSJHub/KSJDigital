import {
  getPublishedContentRecord,
  publishContentSnapshot,
  publishDraftContent,
} from './services/contentService.js'

export async function getPublishedContent(websiteId) {
  return getPublishedContentRecord(websiteId)
}

export { publishContentSnapshot, publishDraftContent }
