import Header from './components/Header';
import Home from './pages/Home';
import Portals from './pages/Portals';
import PortalsAdmin from './pages/PortalsAdmin';
import PortalsDashboard from './pages/PortalsDashboard';
import Footer from './components/Footer';
import { PORTAL_ROLES } from './portals/auth/permissions';
import { getStoredSession } from './portals/auth/sessionManager';

export default function App() {
  const path = window.location.pathname;
  const isPortalAdmin = path === '/portals/admin' || path.startsWith('/portals/admin/');
  const isPortalDashboard = path === '/portals/dashboard';
  const isPortalsRoute = path === '/portals' || path.startsWith('/portals/');

  if (isPortalAdmin) {
    const session = getStoredSession();

    if (!session || session.user?.role !== PORTAL_ROLES.OWNER) {
      window.location.href = '/portals';
      return null;
    }

    return <PortalsAdmin />;
  }

  if (isPortalDashboard) {
    const session = getStoredSession();

    if (!session) {
      window.location.href = '/portals';
      return null;
    }

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
