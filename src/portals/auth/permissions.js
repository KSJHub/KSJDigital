export const PORTAL_ROLES = {
  OWNER: 'owner',
  STAFF: 'staff',
  CLIENT: 'client',
};

export const PORTAL_PERMISSIONS = {
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_WEBSITES: 'view_websites',
  EDIT_CONTENT: 'edit_content',
  SAVE_DRAFTS: 'save_drafts',
  REQUEST_PUBLISH: 'request_publish',
  APPROVE_PUBLISH: 'approve_publish',
  MANAGE_USERS: 'manage_users',
  MANAGE_BILLING: 'manage_billing',
};

const rolePermissions = {
  [PORTAL_ROLES.OWNER]: Object.values(PORTAL_PERMISSIONS),
  [PORTAL_ROLES.STAFF]: [
    PORTAL_PERMISSIONS.VIEW_DASHBOARD,
    PORTAL_PERMISSIONS.VIEW_WEBSITES,
    PORTAL_PERMISSIONS.EDIT_CONTENT,
    PORTAL_PERMISSIONS.SAVE_DRAFTS,
    PORTAL_PERMISSIONS.REQUEST_PUBLISH,
    PORTAL_PERMISSIONS.APPROVE_PUBLISH,
  ],
  [PORTAL_ROLES.CLIENT]: [
    PORTAL_PERMISSIONS.VIEW_DASHBOARD,
    PORTAL_PERMISSIONS.VIEW_WEBSITES,
    PORTAL_PERMISSIONS.EDIT_CONTENT,
    PORTAL_PERMISSIONS.SAVE_DRAFTS,
    PORTAL_PERMISSIONS.REQUEST_PUBLISH,
  ],
};

export function getPermissionsForRole(role) {
  return rolePermissions[role] ?? [];
}

export function hasPermission(user, permission) {
  if (!user?.role || !permission) return false;
  return getPermissionsForRole(user.role).includes(permission);
}

export function canAccessProject(user, projectId) {
  if (!user || !projectId) return false;
  if (user.role === PORTAL_ROLES.OWNER || user.role === PORTAL_ROLES.STAFF) return true;
  return user.projectIds?.includes(projectId) ?? false;
}
