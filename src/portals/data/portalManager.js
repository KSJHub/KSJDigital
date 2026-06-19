import { initialPortalData } from './portalData';
import { getContentFilePath } from '../content/contentFileRegistry';

const STORAGE_KEY = 'ksj-digital-portals-data';
const PORTAL_CONTACT_EMAILS = {
  owner: 'enquiries@ksjdigital.co.uk',
  client: 'support@ksjdigital.co.uk',
  support: 'support@ksjdigital.co.uk',
  billing: 'billing@ksjdigital.co.uk',
  enquiries: 'enquiries@ksjdigital.co.uk',
};

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
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

function migratePortalContactEmails(data) {
  const nextData = { ...data };

  nextData.users = (nextData.users ?? []).map((user) => {
    if (user.id === 'ksj-admin' || user.role === 'owner') {
      return { ...user, email: PORTAL_CONTACT_EMAILS.owner };
    }

    if (user.id === 'twotonetaj-client' || user.email === 'media@ksjdigital.co.uk') {
      return { ...user, email: PORTAL_CONTACT_EMAILS.client };
    }

    return user;
  });

  nextData.content = {
    ...(nextData.content ?? {}),
    ksjdigital: {
      ...(nextData.content?.ksjdigital ?? {}),
      contact: {
        ...(nextData.content?.ksjdigital?.contact ?? {}),
        live: {
          ...(nextData.content?.ksjdigital?.contact?.live ?? {}),
          email: PORTAL_CONTACT_EMAILS.enquiries,
          supportEmail: PORTAL_CONTACT_EMAILS.support,
        },
      },
    },
    twotonetaj: {
      ...(nextData.content?.twotonetaj ?? {}),
      contact: {
        ...(nextData.content?.twotonetaj?.contact ?? {}),
        live: {
          ...(nextData.content?.twotonetaj?.contact?.live ?? {}),
          publicEmail: PORTAL_CONTACT_EMAILS.enquiries,
        },
      },
    },
  };

  nextData.settings = {
    ...(nextData.settings ?? {}),
    contactEmails: {
      enquiries: PORTAL_CONTACT_EMAILS.enquiries,
      support: PORTAL_CONTACT_EMAILS.support,
      billing: PORTAL_CONTACT_EMAILS.billing,
    },
  };

  return nextData;
}

function mergePortalDefaults(storedData) {
  const initialData = cloneData(initialPortalData);
  let mergedData = {
    ...initialData,
    ...storedData,
    meta: { ...initialData.meta, ...(storedData.meta ?? {}) },
    websiteRegistry: { ...initialData.websiteRegistry, ...(storedData.websiteRegistry ?? {}) },
    contentSchemas: { ...initialData.contentSchemas, ...(storedData.contentSchemas ?? {}) },
    content: { ...initialData.content, ...(storedData.content ?? {}) },
    settings: { ...initialData.settings, ...(storedData.settings ?? {}) },
  };

  Object.entries(initialData.content ?? {}).forEach(([websiteId, pages]) => {
    mergedData.content[websiteId] = { ...pages, ...(storedData.content?.[websiteId] ?? {}) };
    Object.entries(pages).forEach(([pageId, contentState]) => {
      mergedData.content[websiteId][pageId] = { ...contentState, ...(storedData.content?.[websiteId]?.[pageId] ?? {}) };
    });
  });

  mergedData.websites = (mergedData.websites ?? []).map((website) => {
    const defaultWebsite = initialData.websites?.find((item) => item.id === website.id) ?? {};
    return {
      ...website,
      deployment: { ...(defaultWebsite.deployment ?? {}), ...(website.deployment ?? {}) },
      backup: { ...(defaultWebsite.backup ?? {}), ...(website.backup ?? {}) },
    };
  });

  mergedData = migratePortalContactEmails(mergedData);
  mergedData.deploymentQueue = mergedData.deploymentQueue ?? [];
  mergedData.deploymentHistory = mergedData.deploymentHistory ?? [];

  return mergedData;
}

export function getPortalData() {
  if (!canUseLocalStorage()) return cloneData(initialPortalData);
  const storedData = window.localStorage.getItem(STORAGE_KEY);
  if (!storedData) {
    const initialData = migratePortalContactEmails(cloneData(initialPortalData));
    savePortalData(initialData);
    return initialData;
  }
  try {
    const parsedData = JSON.parse(storedData);
    const mergedData = mergePortalDefaults(parsedData);
    savePortalData(mergedData);
    return mergedData;
  } catch (error) {
    console.warn('Unable to parse KSJ Digital portal data. Restoring defaults.', error);
    const initialData = migratePortalContactEmails(cloneData(initialPortalData));
    savePortalData(initialData);
    return initialData;
  }
}

export function savePortalData(data) {
  const nextData = { ...data, meta: { ...data.meta, updatedAt: new Date().toISOString() } };
  if (canUseLocalStorage()) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
  return nextData;
}

export function resetPortalData() { const initialData = migratePortalContactEmails(cloneData(initialPortalData)); return savePortalData(initialData); }
export function updatePortalData(updater) { const currentData = getPortalData(); const nextData = updater(cloneData(currentData)); return savePortalData(nextData); }
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

export function getWebsiteContentPage(websiteId, pageId) { return getPortalData().content?.[websiteId]?.[pageId] ?? { live: {}, draft: {}, backup: null }; }

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
    const nextDrafts = existingDrafts.some((draft) => draft.id === draftId) ? existingDrafts.map((draft) => (draft.id === draftId ? { ...draft, ...nextDraft } : draft)) : [nextDraft, ...existingDrafts];
    return {
      ...data,
      content: { ...(data.content ?? {}), [websiteId]: { ...(data.content?.[websiteId] ?? {}), [pageId]: { ...currentPage, draft: draftContent, contentFilePath, baseFileSha: nextDraft.baseFileSha } } },
      drafts: nextDrafts,
      activityLogs: [{ id: `activity-${Date.now()}`, type: 'content.draft.saved', label: `${pageTitle} draft saved`, actor: actorName, target: websiteId, timestamp: 'Just now' }, ...(data.activityLogs ?? [])],
    };
  });
}

export function submitWebsiteDraftForApproval(websiteId, pageId, actorName = 'Client', options = {}) {
  return updatePortalData((data) => {
    const pageTitle = getPageTitle(data, websiteId, pageId);
    const schemaId = getSchemaId(data, websiteId);
    const contentFilePath = getContentFilePath(websiteId, pageId);
    const baseFileSha = options.baseFileSha ?? options.fileSha ?? data.content?.[websiteId]?.[pageId]?.baseFileSha ?? data.content?.[websiteId]?.[pageId]?.lastGitFileSha ?? null;
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
      history: [{ id: `history-${Date.now()}`, status: 'Pending Review', actor: actorName, note: `Draft submitted for approval. Target file: ${contentFilePath}${baseFileSha ? ` · Base SHA: ${baseFileSha}` : ''}`, timestamp: 'Just now' }],
    };
    const nextDrafts = (data.drafts ?? []).map((draft) => (draft.id === draftId ? { ...draft, schemaId, contentFilePath, baseFileSha, status: 'Needs Review', submittedAt: 'Just now', updatedBy: actorName, currentVersion: formatContentSnapshot(currentPage.live), draftVersion: formatContentSnapshot(currentPage.draft) } : draft));
    const existingRequests = data.publishRequests ?? [];
    const nextRequests = existingRequests.some((request) => request.id === requestId) ? existingRequests.map((request) => (request.id === requestId ? { ...request, ...nextRequest, history: [...(request.history ?? []), ...(nextRequest.history ?? [])] } : request)) : [nextRequest, ...existingRequests];
    return {
      ...data,
      drafts: nextDrafts,
      publishRequests: nextRequests,
      activityLogs: [{ id: `activity-${Date.now()}`, type: 'publish.pending', label: `${pageTitle} draft submitted for review`, actor: actorName, target: websiteId, timestamp: 'Just now' }, ...(data.activityLogs ?? [])],
      notifications: [{ id: `notice-${Date.now()}`, type: 'publish', level: 'warning', message: `${pageTitle} draft is waiting for KSJ Digital review. Target file: ${contentFilePath}` }, ...(data.notifications ?? [])],
    };
  });
}
