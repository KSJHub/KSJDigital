export const PORTAL_ROLES = {
  OWNER: 'owner',
  WEBSITE_MANAGER: 'websiteManager',
  SUPPORT_AGENT: 'supportAgent',
  CLIENT_ADMIN: 'clientAdmin',
  CONTENT_EDITOR: 'contentEditor',
  VIEWER: 'viewer',
  STAFF: 'staff',
  CLIENT: 'client',
};

export const PORTAL_PERMISSIONS = {
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_WEBSITES: 'view_websites',
  EDIT_CONTENT: 'edit_content',
  SAVE_DRAFTS: 'save_drafts',
  VIEW_DRAFTS: 'view_drafts',
  REQUEST_PUBLISH: 'request_publish',
  VIEW_PUBLISH_REQUESTS: 'view_publish_requests',
  APPROVE_PUBLISH: 'approve_publish',
  MANAGE_USERS: 'manage_users',
  MANAGE_WEBSITES: 'manage_websites',
  MANAGE_SETTINGS: 'manage_settings',
  MANAGE_BACKUPS: 'manage_backups',
  VIEW_SUPPORT: 'view_support',
  MANAGE_SUPPORT: 'manage_support',
  VIEW_ACCOUNT: 'view_account',
  MANAGE_BILLING: 'manage_billing',
};

export function normalisePortalRole(role) {
  if (role === PORTAL_ROLES.STAFF) return PORTAL_ROLES.WEBSITE_MANAGER;
  if (role === PORTAL_ROLES.CLIENT) return PORTAL_ROLES.CLIENT_ADMIN;
  if (role === 'Owner') return PORTAL_ROLES.OWNER;
  if (role === 'Website Manager') return PORTAL_ROLES.WEBSITE_MANAGER;
  if (role === 'Support Agent') return PORTAL_ROLES.SUPPORT_AGENT;
  if (role === 'Client Administrator') return PORTAL_ROLES.CLIENT_ADMIN;
  if (role === 'Content Editor') return PORTAL_ROLES.CONTENT_EDITOR;
  if (role === 'Viewer') return PORTAL_ROLES.VIEWER;
  return role ?? PORTAL_ROLES.CLIENT_ADMIN;
}

export const PORTAL_ROLE_LABELS = {
  [PORTAL_ROLES.OWNER]: 'Owner',
  [PORTAL_ROLES.WEBSITE_MANAGER]: 'Website Manager',
  [PORTAL_ROLES.SUPPORT_AGENT]: 'Support Agent',
  [PORTAL_ROLES.CLIENT_ADMIN]: 'Client Administrator',
  [PORTAL_ROLES.CONTENT_EDITOR]: 'Content Editor',
  [PORTAL_ROLES.VIEWER]: 'Viewer',
};

const rolePermissions = {
  [PORTAL_ROLES.OWNER]: Object.values(PORTAL_PERMISSIONS),
  [PORTAL_ROLES.WEBSITE_MANAGER]: [
    PORTAL_PERMISSIONS.VIEW_WEBSITES,
    PORTAL_PERMISSIONS.EDIT_CONTENT,
    PORTAL_PERMISSIONS.SAVE_DRAFTS,
    PORTAL_PERMISSIONS.VIEW_DRAFTS,
    PORTAL_PERMISSIONS.REQUEST_PUBLISH,
    PORTAL_PERMISSIONS.VIEW_PUBLISH_REQUESTS,
    PORTAL_PERMISSIONS.APPROVE_PUBLISH,
    PORTAL_PERMISSIONS.MANAGE_WEBSITES,
    PORTAL_PERMISSIONS.MANAGE_BACKUPS,
    PORTAL_PERMISSIONS.VIEW_SUPPORT,
    PORTAL_PERMISSIONS.MANAGE_SUPPORT,
    PORTAL_PERMISSIONS.VIEW_ACCOUNT,
  ],
  [PORTAL_ROLES.SUPPORT_AGENT]: [
    PORTAL_PERMISSIONS.VIEW_SUPPORT,
    PORTAL_PERMISSIONS.MANAGE_SUPPORT,
    PORTAL_PERMISSIONS.VIEW_ACCOUNT,
  ],
  [PORTAL_ROLES.CLIENT_ADMIN]: [
    PORTAL_PERMISSIONS.VIEW_DASHBOARD,
    PORTAL_PERMISSIONS.VIEW_WEBSITES,
    PORTAL_PERMISSIONS.EDIT_CONTENT,
    PORTAL_PERMISSIONS.SAVE_DRAFTS,
    PORTAL_PERMISSIONS.VIEW_DRAFTS,
    PORTAL_PERMISSIONS.REQUEST_PUBLISH,
    PORTAL_PERMISSIONS.VIEW_PUBLISH_REQUESTS,
    PORTAL_PERMISSIONS.VIEW_SUPPORT,
    PORTAL_PERMISSIONS.VIEW_ACCOUNT,
  ],
  [PORTAL_ROLES.CONTENT_EDITOR]: [
    PORTAL_PERMISSIONS.VIEW_DASHBOARD,
    PORTAL_PERMISSIONS.VIEW_WEBSITES,
    PORTAL_PERMISSIONS.EDIT_CONTENT,
    PORTAL_PERMISSIONS.SAVE_DRAFTS,
    PORTAL_PERMISSIONS.VIEW_DRAFTS,
    PORTAL_PERMISSIONS.VIEW_ACCOUNT,
  ],
  [PORTAL_ROLES.VIEWER]: [
    PORTAL_PERMISSIONS.VIEW_DASHBOARD,
    PORTAL_PERMISSIONS.VIEW_WEBSITES,
    PORTAL_PERMISSIONS.VIEW_ACCOUNT,
  ],
};

export function getPermissionsForRole(role) {
  return rolePermissions[normalisePortalRole(role)] ?? [];
}

export function hasPermission(user, permission) {
  if (!user?.role || !permission) return false;
  return getPermissionsForRole(user.role).includes(permission);
}

export function hasAnyPermission(user, permissions = []) {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function requirePermission(user, permission) {
  return hasPermission(user, permission);
}

export function canAccessProject(user, projectId) {
  if (!user || !projectId) return false;
  const role = normalisePortalRole(user.role);
  if (role === PORTAL_ROLES.OWNER || role === PORTAL_ROLES.WEBSITE_MANAGER) return true;
  return user.websiteIds?.includes(projectId) || user.projectIds?.includes(projectId) || false;
}

export function getDefaultPortalPath(user) {
  if (hasPermission(user, PORTAL_PERMISSIONS.MANAGE_USERS)) return '/portals/admin';
  if (hasPermission(user, PORTAL_PERMISSIONS.MANAGE_WEBSITES)) return '/portals/admin/websites';
  if (hasPermission(user, PORTAL_PERMISSIONS.VIEW_DASHBOARD)) return '/portals/dashboard';
  if (hasPermission(user, PORTAL_PERMISSIONS.VIEW_WEBSITES)) return '/portals/websites/twotonetaj';
  if (hasPermission(user, PORTAL_PERMISSIONS.VIEW_SUPPORT)) return '/portals/support';
  return '/portals/account';
}
