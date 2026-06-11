import Header from './components/Header';
import Home from './pages/Home';
import Portals from './pages/Portals';
import PortalsAdmin from './pages/PortalsAdmin';
import PortalsAdminUsers from './pages/PortalsAdminUsers';
import PortalsAdminWebsites from './pages/PortalsAdminWebsites';
import PortalsDashboard from './pages/PortalsDashboard';
import PortalsWebsiteEditor from './pages/PortalsWebsiteEditor';
import Footer from './components/Footer';
import { PORTAL_ROLES } from './portals/auth/permissions';
import { getStoredSession } from './portals/auth/sessionManager';

export default function App() {
  const path = window.location.pathname;
  const isPortalAdmin = path === '/portals/admin' || path.startsWith('/portals/admin/');
  const isPortalDashboard = path === '/portals/dashboard';
  const isPortalWebsiteEditor = path === '/portals/websites/twotonetaj';
  const isPortalsRoute = path === '/portals' || path.startsWith('/portals/');

  if (isPortalAdmin) {
    const session = getStoredSession();

    if (!session || session.user?.role !== PORTAL_ROLES.OWNER) {
      window.location.href = '/portals';
      return null;
    }

    if (path === '/portals/admin/users') return <PortalsAdminUsers />;
    if (path === '/portals/admin/websites') return <PortalsAdminWebsites />;

    return <PortalsAdmin />;
  }

  if (isPortalDashboard || isPortalWebsiteEditor) {
    const session = getStoredSession();

    if (!session) {
      window.location.href = '/portals';
      return null;
    }

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
