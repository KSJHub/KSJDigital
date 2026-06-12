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
import { getStoredSession } from './portals/auth/sessionManager';

export default function App() {
  const path = window.location.pathname;
  const isPortalAdmin = path === '/portals/admin' || path.startsWith('/portals/admin/') || path === '/portals/management';
  const isPortalDashboard = path === '/portals/dashboard';
  const isPortalDrafts = path === '/portals/drafts';
  const isPortalPublishRequests = path === '/portals/publish-requests';
  const isPortalWebsiteEditor = path === '/portals/websites/twotonetaj';
  const isPortalsRoute = path === '/portals' || path.startsWith('/portals/');

  if (isPortalAdmin) {
    const session = getStoredSession();

    if (!session || session.user?.role !== PORTAL_ROLES.OWNER) {
      window.location.href = '/portals';
      return null;
    }

    if (path === '/portals/admin') return <PortalsAdmin />;
    if (path === '/portals/admin/users' || path === '/portals/management') return <PortalsAdminUsers />;
    if (path === '/portals/admin/websites') return <PortalsAdminWebsites />;
    if (path === '/portals/admin/backups') return <PortalsAdminBackups />;
    if (path === '/portals/admin/settings') return <PortalsAdminSettings />;

    return <PortalsAdmin />;
  }

  if (isPortalDashboard || isPortalDrafts || isPortalPublishRequests || isPortalWebsiteEditor || path === '/portals/support' || path === '/portals/account') {
    const session = getStoredSession();

    if (!session) {
      window.location.href = '/portals';
      return null;
    }

    if (isPortalDrafts) return <PortalsDrafts />;
    if (isPortalPublishRequests) return <PortalsPublishRequests />;
    if (path === '/portals/support') return <PortalsSupport />;
    if (path === '/portals/account') return <PortalsAccount />;
    if (isPortalWebsiteEditor) return <PortalsWebsiteEditor />;
    return <PortalsDashboard />;
  }

  if (isPortalsRoute) {
    return <Portals />;
  }

  return (
    <>
      <Header />
      <Home />
      <Footer />
    </>
  );
}
