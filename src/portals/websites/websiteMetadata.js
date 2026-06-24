export const DEFAULT_WEBSITE_DEPLOYMENT = {
  provider: 'VPS / Nginx',
  vpsPath: '',
  buildCommand: 'npm run build',
  lastBuild: 'Not built through portal yet',
  lastDeployment: 'Not deployed through portal yet',
  lastDeploymentStatus: 'Not Connected',
  lastCommitSha: '',
};

export const DEFAULT_WEBSITE_BACKUP = {
  enabled: true,
  retentionHours: 48,
  status: 'No active backup',
  expiresAt: '',
  lastCreatedAt: '',
};

export const DEFAULT_WEBSITE_ANALYTICS = {
  enabled: false,
  monthlyViews: 0,
  monthlyVisitors: 0,
  lastChecked: 'Not connected yet',
};

export function normaliseWebsiteUrl(domain) {
  const cleanDomain = String(domain ?? '').trim();
  if (!cleanDomain) return '';
  return cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}/`;
}

export function normaliseWebsiteRecord(website = {}) {
  const domain = String(website.domain ?? '').trim();
  const hostingStatus = website.hostingStatus ?? website.status ?? 'Live';

  return {
    ...website,
    domain,
    url: website.url || normaliseWebsiteUrl(domain),
    status: hostingStatus,
    hostingStatus,
    portalStatus: website.portalStatus ?? 'Active',
    sslStatus: website.sslStatus ?? 'Pending',
    additionalDomains: website.additionalDomains ?? [],
    assignedUserIds: website.assignedUserIds ?? [],
    storageUsedMb: Number(website.storageUsedMb ?? 0),
    storageLimitMb: Number(website.storageLimitMb ?? 2048),
    analytics: {
      ...DEFAULT_WEBSITE_ANALYTICS,
      ...(website.analytics ?? {}),
    },
    backup: {
      ...DEFAULT_WEBSITE_BACKUP,
      ...(website.backup ?? {}),
    },
    deployment: {
      ...DEFAULT_WEBSITE_DEPLOYMENT,
      ...(website.deployment ?? {}),
    },
  };
}

export function normaliseWebsiteList(websites = []) {
  return websites.map((website) => normaliseWebsiteRecord(website));
}
