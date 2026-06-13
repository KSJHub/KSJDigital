import Header from './components/Header';
import Home from './pages/Home';
import Portals from './pages/Portals';
import PortalsAccount from './pages/PortalsAccount';
import PortalsAdmin from './pages/PortalsAdmin';
import PortalsAdminBackups from './pages/PortalsAdminBackups';
import PortalsAdminSettings from './pages/PortalsAdminSettings';
import PortalsAdminUsers from './pages/PortalsAdminUsers';
import PortalsAdminWebsites from './pages/PortalsAdminWebsites';
import PortalsDashboard from './pages/PortalsDashboard';
import PortalsDrafts from './pages/PortalsDrafts';
import PortalsPublishRequests from './pages/PortalsPublishRequests';
import PortalsSupport from './pages/PortalsSupport';
import PortalsWebsiteEditor from './pages/PortalsWebsiteEditor';
import Footer from './components/Footer';
import { PORTAL_ROLES } from './portals/auth/permissions';
import { validatePortalSession } from './portals/auth/authService';

function PortalStylePatch({ children }) {
  return (
    <>
      <style>{`
        .portal-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 18px 0; }
        .portal-form-grid label, .portal-full-field { display: grid; gap: 8px; color: var(--silver); font-size: 13px; font-weight: 900; }
        .portal-form-grid input, .portal-form-grid select, .portal-form-grid textarea, .portal-full-field textarea, .portal-dashboard-main select { min-height: 48px; padding: 0 14px; border: 1px solid rgba(139, 178, 255, 0.18); border-radius: 14px; color: var(--text); background: rgba(0, 0, 0, 0.22); font: inherit; font-weight: 800; }
        .portal-form-grid textarea, .portal-full-field textarea { min-height: 110px; padding: 14px; resize: vertical; }
        .portal-dashboard-main select option { color: #ffffff; background: #06101f; }
        .portal-dashboard-main select:focus, .portal-form-grid input:focus, .portal-form-grid textarea:focus { outline: none; border-color: rgba(139, 178, 255, 0.42); box-shadow: 0 0 0 1px rgba(47, 124, 255, 0.2), 0 16px 34px rgba(47, 124, 255, 0.12); }
        .portal-management-card > ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0; margin: 18px 0; list-style: none; }
        .portal-management-card > ul li { padding: 14px 16px; border: 1px solid rgba(139, 178, 255, 0.14); border-radius: 14px; color: var(--silver); background: rgba(255, 255, 255, 0.035); font-weight: 800; }
        .portal-management-card > .portal-inline-actions { gap: 10px; margin: 18px 0; }
        .portal-management-card > .portal-inline-actions button, .portal-section-list .portal-inline-actions button, .portal-form-grid + .portal-grid-two + .portal-inline-actions button { min-height: 42px; padding: 0 14px; border: 1px solid rgba(139, 178, 255, 0.18); border-radius: 14px; color: var(--silver); background: rgba(255, 255, 255, 0.05); font-weight: 900; cursor: pointer; }
        .portal-management-card > .portal-inline-actions button:hover, .portal-section-list .portal-inline-actions button:hover { border-color: rgba(139, 178, 255, 0.36); background: rgba(47, 124, 255, 0.12); color: #fff; }
        .portal-remember-option { display: flex !important; align-items: center; gap: 8px; color: var(--silver); font-size: 12px; font-weight: 800; }
        .portal-remember-option input { width: auto !important; min-height: auto !important; accent-color: var(--blue-soft); }
        @media (max-width: 760px) { .portal-form-grid, .portal-management-card > ul { grid-template-columns: 1fr; } }
      `}</style>
      {children}
    </>
  );
}

export default function App() {
  const path = window.location.pathname;
  const isPortalAdmin = path === '/portals/admin' || path.startsWith('/portals/admin/') || path === '/portals/management';
  const isPortalDashboard = path === '/portals/dashboard';
  const isPortalDrafts = path === '/portals/drafts';
  const isPortalPublishRequests = path === '/portals/publish-requests';
  const isPortalWebsiteEditor = path === '/portals/websites/twotonetaj';
  const isPortalsRoute = path === '/portals' || path.startsWith('/portals/');

  if (isPortalAdmin) {
    const session = validatePortalSession();

    if (!session || session.user?.role !== PORTAL_ROLES.OWNER) {
      window.location.href = '/portals';
      return null;
    }

    if (path === '/portals/admin') return <PortalStylePatch><PortalsAdmin /></PortalStylePatch>;
    if (path === '/portals/admin/users' || path === '/portals/management') return <PortalStylePatch><PortalsAdminUsers /></PortalStylePatch>;
    if (path === '/portals/admin/websites') return <PortalStylePatch><PortalsAdminWebsites /></PortalStylePatch>;
    if (path === '/portals/admin/backups') return <PortalStylePatch><PortalsAdminBackups /></PortalStylePatch>;
    if (path === '/portals/admin/settings') return <PortalStylePatch><PortalsAdminSettings /></PortalStylePatch>;

    return <PortalStylePatch><PortalsAdmin /></PortalStylePatch>;
  }

  if (isPortalDashboard || isPortalDrafts || isPortalPublishRequests || isPortalWebsiteEditor || path === '/portals/support' || path === '/portals/account') {
    const session = validatePortalSession();

    if (!session) {
      window.location.href = '/portals';
      return null;
    }

    if (isPortalDrafts) return <PortalStylePatch><PortalsDrafts /></PortalStylePatch>;
    if (isPortalPublishRequests) return <PortalStylePatch><PortalsPublishRequests /></PortalStylePatch>;
    if (path === '/portals/support') return <PortalStylePatch><PortalsSupport /></PortalStylePatch>;
    if (path === '/portals/account') return <PortalStylePatch><PortalsAccount /></PortalStylePatch>;
    if (isPortalWebsiteEditor) return <PortalStylePatch><PortalsWebsiteEditor /></PortalStylePatch>;
    return <PortalStylePatch><PortalsDashboard /></PortalStylePatch>;
  }

  if (isPortalsRoute) {
    return <PortalStylePatch><Portals /></PortalStylePatch>;
  }

  return (
    <>
      <Header />
      <Home />
      <Footer />
    </>
  );
}
