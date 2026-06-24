import { normaliseWebsiteRecord, normaliseWebsiteUrl } from './websiteMetadata';

export const EMPTY_WEBSITE_FORM = {
  name: '',
  type: 'Managed Website',
  domain: '',
  additionalDomainsText: '',
  hostingStatus: 'Live',
  portalStatus: 'Active',
  sslStatus: 'Pending',
  access: 'Website Management',
  publishMode: 'Approval Required',
  plan: 'Managed Website',
  ownerUserId: '',
  storageLimitMb: 2048,
  analyticsEnabled: false,
  backupEnabled: true,
  backupRetentionHours: 48,
  vpsPath: '',
  buildCommand: 'npm run build',
  description: '',
  assignedUserIds: [],
};

export const WEBSITE_MANAGEMENT_TABS = ['Overview', 'Domains', 'Publishing', 'Backups', 'Hosting', 'Analytics'];

export function createWebsiteId(name) {
  const safeName = String(name ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return safeName || `website-${Date.now()}`;
}

export function getWebsiteHostingStatus(website) {
  return website?.hostingStatus ?? website?.status ?? 'Live';
}

export function getWebsitePortalStatus(website) {
  return website?.portalStatus ?? 'Active';
}

export function getAdditionalDomainsText(website) {
  return (website?.additionalDomains ?? []).join('\n');
}

export function parseAdditionalDomains(value) {
  return String(value ?? '')
    .split('\n')
    .map((domain) => domain.trim())
    .filter(Boolean);
}

export function formatWebsiteStorage(website) {
  const used = website?.storageUsedMb ?? 0;
  const limit = website?.storageLimitMb ?? 0;
  if (!limit) return `${used} MB used`;
  return `${used} MB / ${limit} MB`;
}

export function getWebsiteStoragePercent(website) {
  const used = website?.storageUsedMb ?? 0;
  const limit = website?.storageLimitMb ?? 0;
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function getWebsiteOwnerName(website, users = []) {
  return users.find((portalUser) => portalUser.id === website?.ownerUserId)?.name ?? 'Unassigned';
}

export function createWebsiteFormFromRecord(website = {}) {
  const normalisedWebsite = normaliseWebsiteRecord(website);

  return {
    name: normalisedWebsite.name ?? '',
    type: normalisedWebsite.type ?? 'Managed Website',
    domain: normalisedWebsite.domain ?? '',
    additionalDomainsText: getAdditionalDomainsText(normalisedWebsite),
    hostingStatus: getWebsiteHostingStatus(normalisedWebsite),
    portalStatus: getWebsitePortalStatus(normalisedWebsite),
    sslStatus: normalisedWebsite.sslStatus ?? 'Pending',
    access: normalisedWebsite.access ?? 'Website Management',
    publishMode: normalisedWebsite.publishMode ?? 'Approval Required',
    plan: normalisedWebsite.plan ?? 'Managed Website',
    ownerUserId: normalisedWebsite.ownerUserId ?? normalisedWebsite.assignedUserIds?.[0] ?? '',
    storageLimitMb: normalisedWebsite.storageLimitMb ?? 2048,
    analyticsEnabled: Boolean(normalisedWebsite.analytics?.enabled),
    backupEnabled: normalisedWebsite.backup?.enabled !== false,
    backupRetentionHours: normalisedWebsite.backup?.retentionHours ?? 48,
    vpsPath: normalisedWebsite.deployment?.vpsPath ?? '',
    buildCommand: normalisedWebsite.deployment?.buildCommand ?? 'npm run build',
    description: normalisedWebsite.description ?? '',
    assignedUserIds: normalisedWebsite.assignedUserIds ?? [],
  };
}

export function createWebsitePayload(form, currentWebsite, editorName) {
  const normalisedCurrentWebsite = currentWebsite ? normaliseWebsiteRecord(currentWebsite) : null;
  const cleanDomain = String(form.domain ?? '').trim();

  return normaliseWebsiteRecord({
    ...normalisedCurrentWebsite,
    ...form,
    domain: cleanDomain,
    url: normaliseWebsiteUrl(cleanDomain),
    additionalDomains: parseAdditionalDomains(form.additionalDomainsText),
    status: form.hostingStatus,
    hostingStatus: form.hostingStatus,
    portalStatus: form.portalStatus,
    storageLimitMb: Number(form.storageLimitMb) || 0,
    analytics: {
      ...(normalisedCurrentWebsite?.analytics ?? {}),
      enabled: Boolean(form.analyticsEnabled),
      monthlyViews: normalisedCurrentWebsite?.analytics?.monthlyViews ?? 0,
      monthlyVisitors: normalisedCurrentWebsite?.analytics?.monthlyVisitors ?? 0,
      lastChecked: normalisedCurrentWebsite?.analytics?.lastChecked ?? 'Not connected yet',
    },
    backup: {
      ...(normalisedCurrentWebsite?.backup ?? {}),
      enabled: Boolean(form.backupEnabled),
      retentionHours: Number(form.backupRetentionHours) || 48,
      status: normalisedCurrentWebsite?.backup?.status ?? 'No active backup',
      expiresAt: normalisedCurrentWebsite?.backup?.expiresAt ?? '',
      lastCreatedAt: normalisedCurrentWebsite?.backup?.lastCreatedAt ?? '',
    },
    deployment: {
      ...(normalisedCurrentWebsite?.deployment ?? {}),
      provider: normalisedCurrentWebsite?.deployment?.provider ?? 'VPS / Nginx',
      vpsPath: form.vpsPath,
      buildCommand: form.buildCommand,
      lastBuild: normalisedCurrentWebsite?.deployment?.lastBuild ?? 'Not built through portal yet',
      lastDeployment: normalisedCurrentWebsite?.deployment?.lastDeployment ?? 'Not deployed through portal yet',
      lastDeploymentStatus: normalisedCurrentWebsite?.deployment?.lastDeploymentStatus ?? 'Not Connected',
      lastCommitSha: normalisedCurrentWebsite?.deployment?.lastCommitSha ?? '',
    },
    updatedAt: new Date().toISOString(),
    lastEditor: editorName,
  });
}

export function syncUserWebsiteAccess(users = [], websiteId, assignedUserIds = []) {
  return users.map((portalUser) => {
    const websiteIds = portalUser.websiteIds ?? [];
    const shouldHaveAccess = assignedUserIds.includes(portalUser.id);
    const alreadyHasAccess = websiteIds.includes(websiteId);

    if (shouldHaveAccess && !alreadyHasAccess) return { ...portalUser, websiteIds: [...websiteIds, websiteId] };
    if (!shouldHaveAccess && alreadyHasAccess) return { ...portalUser, websiteIds: websiteIds.filter((id) => id !== websiteId) };
    return portalUser;
  });
}

export function removeWebsiteAccessFromUsers(users = [], websiteId) {
  return users.map((portalUser) => ({
    ...portalUser,
    websiteIds: portalUser.websiteIds?.filter((id) => id !== websiteId) ?? [],
  }));
}
