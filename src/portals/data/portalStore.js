import { initialPortalData } from './portalData';

const CACHE_STORAGE_KEY = 'ksj-digital-portals-data-cache';
const LEGACY_STORAGE_KEY = 'ksj-digital-portals-data';
const DEFAULT_PORTAL_API_BASE_URL = 'http://localhost:4174';

let memoryPortalData = null;

export function clonePortalData(data) {
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

export function migratePortalData(data) {
  const nextData = clonePortalData(data ?? initialPortalData);

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

function writeCachedPortalData(data) {
  const nextData = migratePortalData(data);
  memoryPortalData = clonePortalData(nextData);

  if (canUseLocalStorage()) {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(nextData));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  return nextData;
}

function readCachedPortalData() {
  if (memoryPortalData) return clonePortalData(memoryPortalData);
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
  const nextData = updater(clonePortalData(currentData));
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

export function getPortalPageTitle(data, websiteId, pageId) {
  const registry = data.websiteRegistry?.[websiteId];
  const schema = data.contentSchemas?.[registry?.schemaId];
  return schema?.pages?.find((page) => page.id === pageId)?.title ?? pageId;
}

export function getPortalSchemaId(data, websiteId) {
  return data.websiteRegistry?.[websiteId]?.schemaId ?? data.websites?.find((website) => website.id === websiteId)?.schemaId ?? 'custom';
}
