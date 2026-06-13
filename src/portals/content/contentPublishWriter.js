import { createContentFilePayload, getContentFilePath, serialiseContentFile } from './contentFileRegistry';

function getSchemaId(portalData, websiteId, request) {
  return request?.schemaId ?? portalData.websiteRegistry?.[websiteId]?.schemaId ?? 'custom';
}

function getBaseFileSha({ request, draft, currentPageContent, backup }) {
  return request?.baseFileSha
    ?? request?.fileShaBeforeEdit
    ?? draft?.baseFileSha
    ?? draft?.fileShaBeforeEdit
    ?? currentPageContent?.baseFileSha
    ?? currentPageContent?.lastGitFileSha
    ?? backup?.baseFileSha
    ?? backup?.fileShaBeforeRestore
    ?? null;
}

export function createPublishContentWrite({ portalData, request, draft, actorName }) {
  const websiteId = request?.websiteId ?? draft?.websiteId;
  const pageId = request?.pageId ?? draft?.pageId;
  const currentPageContent = websiteId && pageId
    ? portalData.content?.[websiteId]?.[pageId] ?? { live: {}, draft: {}, backup: null }
    : { live: {}, draft: {}, backup: null };
  const content = currentPageContent.draft ?? {};
  const schemaId = getSchemaId(portalData, websiteId, request);
  const contentFilePath = request?.contentFilePath ?? draft?.contentFilePath ?? getContentFilePath(websiteId, pageId);
  const baseFileSha = getBaseFileSha({ request, draft, currentPageContent });
  const payload = createContentFilePayload({ websiteId, pageId, schemaId, content, actorName, status: 'live' });

  return {
    websiteId,
    pageId,
    schemaId,
    contentFilePath,
    baseFileSha,
    content,
    payload,
    serialisedContent: serialiseContentFile(payload),
    commitMessage: `Publish ${websiteId} ${pageId} content`,
    status: 'Prepared',
    note: baseFileSha
      ? 'Prepared for GitHub content-file write with SHA conflict protection.'
      : 'Prepared for GitHub content-file write. No base SHA was captured yet, so backend will write using latest file state.',
  };
}

export function createRestoreContentWrite({ portalData, backup, actorName }) {
  const websiteId = backup?.websiteId;
  const pageId = backup?.pageId;
  const schemaId = portalData.websiteRegistry?.[websiteId]?.schemaId ?? 'custom';
  const contentFilePath = backup?.contentFilePath ?? getContentFilePath(websiteId, pageId);
  const baseFileSha = getBaseFileSha({ backup });
  const payload = createContentFilePayload({ websiteId, pageId, schemaId, content: backup?.contentSnapshot ?? {}, actorName, status: 'live' });

  return {
    websiteId,
    pageId,
    schemaId,
    contentFilePath,
    baseFileSha,
    content: backup?.contentSnapshot ?? {},
    payload,
    serialisedContent: serialiseContentFile(payload),
    commitMessage: `Restore ${websiteId} ${pageId} content backup`,
    status: 'Prepared',
    note: baseFileSha
      ? 'Prepared for GitHub content-file restore write with SHA conflict protection.'
      : 'Prepared for GitHub content-file restore write. No base SHA was captured yet, so backend will write using latest file state.',
  };
}
