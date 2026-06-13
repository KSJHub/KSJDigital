import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { getStoredSession } from '../portals/auth/sessionManager';
import { hasAnyPermission, hasPermission, PORTAL_PERMISSIONS } from '../portals/auth/permissions';

const clientLinks = [
  { label: 'Dashboard', href: '/portals/dashboard', permission: PORTAL_PERMISSIONS.VIEW_DASHBOARD },
  { label: 'My Website', href: '/portals/websites/twotonetaj', permission: PORTAL_PERMISSIONS.VIEW_WEBSITES },
  { label: 'Drafts', href: '/portals/drafts', permission: PORTAL_PERMISSIONS.VIEW_DRAFTS },
  { label: 'Publish Requests', href: '/portals/publish-requests', permission: PORTAL_PERMISSIONS.VIEW_PUBLISH_REQUESTS },
  { label: 'Support', href: '/portals/support', permission: PORTAL_PERMISSIONS.VIEW_SUPPORT },
  { label: 'Account', href: '/portals/account', permission: PORTAL_PERMISSIONS.VIEW_ACCOUNT },
];

const adminLinks = [
  { label: 'Client Management', href: '/portals/admin', permission: PORTAL_PERMISSIONS.MANAGE_USERS },
  { label: 'Websites', href: '/portals/admin/websites', permission: PORTAL_PERMISSIONS.MANAGE_WEBSITES },
  { label: 'Publish Requests', href: '/portals/publish-requests', permission: PORTAL_PERMISSIONS.APPROVE_PUBLISH },
  { label: 'Deployments', href: '/portals/admin/deployments', permission: PORTAL_PERMISSIONS.APPROVE_PUBLISH },
  { label: 'Backups', href: '/portals/admin/backups', permission: PORTAL_PERMISSIONS.MANAGE_BACKUPS },
  { label: 'Client View', href: '/portals/dashboard', permission: PORTAL_PERMISSIONS.VIEW_DASHBOARD },
  { label: 'Settings', href: '/portals/admin/settings', permission: PORTAL_PERMISSIONS.MANAGE_SETTINGS },
];

const adminPermissions = [
  PORTAL_PERMISSIONS.MANAGE_USERS,
  PORTAL_PERMISSIONS.MANAGE_WEBSITES,
  PORTAL_PERMISSIONS.APPROVE_PUBLISH,
  PORTAL_PERMISSIONS.MANAGE_BACKUPS,
  PORTAL_PERMISSIONS.MANAGE_SETTINGS,
];

function linkIsActive(href, activePath) {
  if (href === '/portals/admin') return activePath === href || activePath === '/portals/management' || activePath === '/portals/admin/users';
  return activePath === href || activePath.startsWith(`${href}/`);
}

export default function PortalSidebar({ title = 'Portals', section = 'client' }) {
  const session = getStoredSession();
  const user = session?.user;
  const activePath = window.location.pathname;
  const primaryLinks = section === 'admin' ? adminLinks : clientLinks;
  const canSeeManagement = hasAnyPermission(user, adminPermissions);

  return (
    <aside className="portal-sidebar">
      <img src={KsjDigitalLogo} alt="KSJ Digital" />
      <span>{title}</span>
      <nav>
        {primaryLinks.filter((link) => hasPermission(user, link.permission)).map((link) => (
          <a href={link.href} className={linkIsActive(link.href, activePath) ? 'active' : undefined} key={link.href}>
            {link.label}
          </a>
        ))}
        {section !== 'admin' && canSeeManagement && (
          <a href="/portals/admin" className="portal-owner-link">Management Panel</a>
        )}
      </nav>
    </aside>
  );
}
