import { initialPortalData } from './portalData';

const STORAGE_KEY = 'ksj-digital-portals-data';

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function getPortalData() {
  if (!canUseLocalStorage()) return cloneData(initialPortalData);

  const storedData = window.localStorage.getItem(STORAGE_KEY);

  if (!storedData) {
    const initialData = cloneData(initialPortalData);
    savePortalData(initialData);
    return initialData;
  }

  try {
    return JSON.parse(storedData);
  } catch (error) {
    console.warn('Unable to parse KSJ Digital portal data. Restoring defaults.', error);
    const initialData = cloneData(initialPortalData);
    savePortalData(initialData);
    return initialData;
  }
}

export function savePortalData(data) {
  const nextData = {
    ...data,
    meta: {
      ...data.meta,
      updatedAt: new Date().toISOString(),
    },
  };

  if (canUseLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
  }

  return nextData;
}

export function resetPortalData() {
  const initialData = cloneData(initialPortalData);
  return savePortalData(initialData);
}

export function updatePortalData(updater) {
  const currentData = getPortalData();
  const nextData = updater(cloneData(currentData));
  return savePortalData(nextData);
}

export function getPortalUsers() {
  return getPortalData().users ?? [];
}

export function getPortalWebsites() {
  return getPortalData().websites ?? [];
}

export function getPortalWebsiteById(websiteId) {
  return getPortalWebsites().find((website) => website.id === websiteId) ?? null;
}

export function getPortalWebsitesByUser(user) {
  if (!user?.websiteIds) return [];
  return getPortalWebsites().filter((website) => user.websiteIds.includes(website.id));
}

export function getPortalUserById(userId) {
  return getPortalUsers().find((user) => user.id === userId) ?? null;
}

export function getPortalUsersByWebsite(websiteId) {
  return getPortalUsers().filter((user) => user.websiteIds?.includes(websiteId));
}
