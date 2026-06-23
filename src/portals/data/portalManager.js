import { initialPortalData } from './portalData';
import { getContentFilePath } from '../content/contentFileRegistry';

const CACHE_STORAGE_KEY = 'ksj-digital-portals-data-cache';
const LEGACY_STORAGE_KEY = 'ksj-digital-portals-data';
const DEFAULT_PORTAL_API_BASE_URL = 'http://localhost:4174';

let memoryPortalData = null;

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function getPortalApiBaseUrl() {
  return import.meta.env?.VITE_PORTAL_API_BASE_URL || DEFAULT_PORTAL_API_BASE_URL;
}

function getPortalDataUrl() {
  return `${getPortalApiBaseUrl()}/api/portal/data`;
}

function migratePortalData(data) {
  const nextData = cloneData(data ?? initialPortalData);

  nextData.meta = {
    ...(nextData.meta ?? {}),
    storageMode: 'server-json',
    sourceOfTruth: 'server/data/portalData.json',
  };

  nextData.users ??= [];
  nextData.websites ??= [];
  nextData.drafts ??= [];
  nextData.publishRequests ??= [];
  nextData.supportTickets ??= [];
  nextData.deploymentQueue ??= [];
  nextData.deploymentHistory ??= [];
  nextData.backups ??= [];
  nextData.activityLogs ??= [];
  nextData.notifications ??= [];
  nextData.settings ??= {};

  return nextData;
}

function formatContentSnapshot(content) {
  const entries = Object.entries(content ?? {}).filter(([, value]) => value !== '' && value !== null && value !== undefined);
  if (!entries.length) return 'No content entered yet.';
  return entries.map(([key, value]) => `${key}: ${value}`).join('\n');
}

function getPageTitle(data, websiteId, pageId) {
  const registry = data.websiteRegistry?.[websiteId];
  const schema = data.contentSchemas?.[registry?.schemaId];
  return schema?.pages?.find((page) => page.id === pageId)?.title ?? pageId;
}

function getSchemaId(data, websiteId) {
  return data.websiteRegistry?.[websiteId]?.schemaId ?? data.websites?.find((website) => website.id === websiteId)?.schemaId ?? 'custom';
}

function writeCachedPortalData(data) {
  const nextData = migratePortalData(data);
  memoryPortalData = cloneData(nextData);

  if (canUseLocalStorage()) {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(nextData));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  return nextData;
}

function readCachedPortalData() {
  if (memoryPortalData) return cloneData(memoryPortalData);
  if (!canUseLocalStorage()) return migratePortalData(initialPortalData);

  const cachedData = window.localStorage.getItem(CACHE_STORAGE_KEY);
  if (!cachedData) return migratePortalData(initialPortalData);

  try {
    return migratePortalData(JSON.parse(cachedData));
  } catch (error) {
    console.warn('Unable to parse cached KSJ Digital portal data. Restoring defaults.', error);
    return migratePortalData(initialPortalData);
  }
}

function requestPortalData(method, data = null) {
  if (typeof window === 'undefined' || typeof window.XMLHttpRequest === 'undefined') return null;

  try {
    const request = new window.XMLHttpRequest();
    request.open(method, getPortalDataUrl(), false);
    request.setRequestHeader('Content-Type', 'application/json');
    request.send(data ? JSON.stringify({ data }) : null);

    if (request.status < 200 || request.status >= 300) return null;

    const payload = JSON.parse(request.responseText || '{}');
    if (payload.ok === false) return null;

    return payload.data ?? payload;
  } catch (error) {
    console.warn('Central portal data API unavailable. Using cached portal data.', error);
    return null;
  }
}

export function getPortalData() {
  const serverData = requestPortalData('GET');
  if (serverData) return writeCachedPortalData(serverData);

  return writeCachedPortalData(readCachedPortalData());
}

export function savePortalData(data) {
  const nextData = {
    ...migratePortalData(data),
    meta: {
      ...(data.meta ?? {}),
      storageMode: 'server-json',
      sourceOfTruth: 'server/data/portalData.json',
      updatedAt: new Date().toISOString(),
    },
  };

  const savedServerData = requestPortalData('PUT', nextData);
  return writeCachedPortalData(savedServerData ?? nextData);
}

export function resetPortalData() {
  return savePortalData(migratePortalData(initialPortalData));
}

export function updatePortalData(updater) {
  const currentData = getPortalData();
  const nextData = updater(cloneData(currentData));
  return savePortalData(nextData);
}

export function getPortalUsers() { return getPortalData().users ?? []; }
export function getPortalWebsites() { return getPortalData().websites ?? []; }
export function getPortalDrafts() { return getPortalData().drafts ?? []; }
export function getPortalPublishRequests() { return getPortalData().publishRequests ?? []; }
export function getPortalSupportTickets() { return getPortalData().supportTickets ?? []; }
export function getPortalDeploymentQueue() { return getPortalData().deploymentQueue ?? []; }
export function getPortalDeploymentHistory() { return getPortalData().deploymentHistory ?? []; }
export function getPortalWebsiteById(websiteId) { return getPortalWebsites().find((website) => website.id === websiteId) ?? null; }
export function getPortalWebsitesByUser(user) { if (!user?.websiteIds) return []; return getPortalWebsites().filter((website) => user.websiteIds.includes(website.id)); }
export function getPortalUserById(userId) { return getPortalUsers().find((user) => user.id === userId) ?? null; }
export function getPortalUsersByWebsite(websiteId) { return getPortalUsers().filter((user) => user.websiteIds?.includes(websiteId)); }
export function getDraftsByWebsite(websiteId) { return getPortalDrafts().filter((draft) => draft.websiteId === websiteId); }
export function getPublishRequestsByWebsite(websiteId) { return getPortalPublishRequests().filter((request) => request.websiteId === websiteId); }
export function getDeploymentsByWebsite(websiteId) { return getPortalDeploymentHistory().filter((deployment) => deployment.websiteId === websiteId); }
export function getWebsiteRegistry() { return getPortalData().websiteRegistry ?? {}; }
export function getContentSchemas() { return getPortalData().contentSchemas ?? {}; }
export function getWebsiteContent(websiteId) { return getPortalData().content?.[websiteId] ?? {}; }

export function getWebsiteSchemaPages(websiteId) {
  const data = getPortalData();
  const registry = data.websiteRegistry?.[websiteId];
  const schema = data.contentSchemas?.[registry?.schemaId];
  return schema?.pages ?? [];
}

export function getWebsiteContentPage(websiteId, pageId) {
  return getPortalData().content?.[websiteId]?.[pageId] ?? { live: {}, draft: {}, backup: null };
}

export function saveWebsiteDraftContent(websiteId, pageId, draftContent, actorName = 'Client', options = {}) {
  return updatePortalData((data) => {
    const pageTitle = getPageTitle(data, websiteId, pageId);
    const schemaId = getSchemaId(data, websiteId);
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
    const pageTitle = getPageTitle(data, websiteId, pageId);
    const schemaId = getSchemaId(data, websiteId);
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
