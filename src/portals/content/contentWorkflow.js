import { getContentFilePath } from './contentFileRegistry';
import { getPortalPageTitle, getPortalSchemaId, updatePortalData } from '../data/portalStore';

function formatContentSnapshot(content) {
  const entries = Object.entries(content ?? {}).filter(([, value]) => value !== '' && value !== null && value !== undefined);
  if (!entries.length) return 'No content entered yet.';
  return entries.map(([key, value]) => `${key}: ${value}`).join('\n');
}

export function saveWebsiteDraftContent(websiteId, pageId, draftContent, actorName = 'Client', options = {}) {
  return updatePortalData((data) => {
    const pageTitle = getPortalPageTitle(data, websiteId, pageId);
    const schemaId = getPortalSchemaId(data, websiteId);
    const contentFilePath = getContentFilePath(websiteId, pageId);
    const baseFileSha = options.baseFileSha ?? options.fileSha ?? null;
    const draftId = `${websiteId}-${pageId}-draft`;
    const currentPage = data.content?.[websiteId]?.[pageId] ?? { live: {}, draft: {}, backup: null };

    const nextDraft = {
      id: draftId,
      websiteId,
      pageId,
      schemaId,
      contentFilePath,
      baseFileSha: baseFileSha ?? currentPage.baseFileSha ?? currentPage.lastGitFileSha ?? null,
      section: pageTitle,
      status: 'Draft Ready',
      updatedBy: actorName,
      summary: `${pageTitle} draft saved through the website editor.`,
      currentVersion: formatContentSnapshot(currentPage.live),
      draftVersion: formatContentSnapshot(draftContent),
      submittedAt: 'Not submitted yet',
    };

    const existingDrafts = data.drafts ?? [];
    const nextDrafts = existingDrafts.some((draft) => draft.id === draftId)
      ? existingDrafts.map((draft) => (draft.id === draftId ? { ...draft, ...nextDraft } : draft))
      : [nextDraft, ...existingDrafts];

    return {
      ...data,
      content: {
        ...(data.content ?? {}),
        [websiteId]: {
          ...(data.content?.[websiteId] ?? {}),
          [pageId]: {
            ...currentPage,
            draft: draftContent,
            contentFilePath,
            baseFileSha: nextDraft.baseFileSha,
          },
        },
      },
      drafts: nextDrafts,
      activityLogs: [
        {
          id: `activity-${Date.now()}`,
          type: 'content.draft.saved',
          label: `${pageTitle} draft saved`,
          actor: actorName,
          target: websiteId,
          timestamp: 'Just now',
        },
        ...(data.activityLogs ?? []),
      ],
    };
  });
}

export function submitWebsiteDraftForApproval(websiteId, pageId, actorName = 'Client', options = {}) {
  return updatePortalData((data) => {
    const pageTitle = getPortalPageTitle(data, websiteId, pageId);
    const schemaId = getPortalSchemaId(data, websiteId);
    const contentFilePath = getContentFilePath(websiteId, pageId);
    const baseFileSha = options.baseFileSha
      ?? options.fileSha
      ?? data.content?.[websiteId]?.[pageId]?.baseFileSha
      ?? data.content?.[websiteId]?.[pageId]?.lastGitFileSha
      ?? null;

    const draftId = `${websiteId}-${pageId}-draft`;
    const requestId = `request-${websiteId}-${pageId}`;
    const currentPage = data.content?.[websiteId]?.[pageId] ?? { live: {}, draft: {}, backup: null };

    const nextRequest = {
      id: requestId,
      websiteId,
      pageId,
      schemaId,
      contentFilePath,
      baseFileSha,
      draftId,
      title: `${pageTitle} draft review`,
      requestedBy: actorName,
      status: 'Pending Review',
      updatedAt: 'Just now',
      summary: `${pageTitle} content changes are ready for KSJ Digital review.`,
      history: [
        {
          id: `history-${Date.now()}`,
          status: 'Pending Review',
          actor: actorName,
          note: `Draft submitted for approval. Target file: ${contentFilePath}${baseFileSha ? ` · Base SHA: ${baseFileSha}` : ''}`,
          timestamp: 'Just now',
        },
      ],
    };

    const nextDrafts = (data.drafts ?? []).map((draft) => (
      draft.id === draftId
        ? {
            ...draft,
            schemaId,
            contentFilePath,
            baseFileSha,
            status: 'Needs Review',
            submittedAt: 'Just now',
            updatedBy: actorName,
            currentVersion: formatContentSnapshot(currentPage.live),
            draftVersion: formatContentSnapshot(currentPage.draft),
          }
        : draft
    ));

    const existingRequests = data.publishRequests ?? [];
    const nextRequests = existingRequests.some((request) => request.id === requestId)
      ? existingRequests.map((request) => (
          request.id === requestId
            ? { ...request, ...nextRequest, history: [...(request.history ?? []), ...(nextRequest.history ?? [])] }
            : request
        ))
      : [nextRequest, ...existingRequests];

    return {
      ...data,
      drafts: nextDrafts,
      publishRequests: nextRequests,
      activityLogs: [
        {
          id: `activity-${Date.now()}`,
          type: 'publish.pending',
          label: `${pageTitle} draft submitted for review`,
          actor: actorName,
          target: websiteId,
          timestamp: 'Just now',
        },
        ...(data.activityLogs ?? []),
      ],
      notifications: [
        {
          id: `notice-${Date.now()}`,
          type: 'publish',
          level: 'warning',
          message: `${pageTitle} draft is waiting for KSJ Digital review. Target file: ${contentFilePath}`,
        },
        ...(data.notifications ?? []),
      ],
    };
  });
}
