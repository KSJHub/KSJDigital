import Header from './components/Header';
import Home from './pages/Home';
import Portals from './pages/Portals';
import PortalsDashboard from './pages/PortalsDashboard';
import Footer from './components/Footer';
import { getStoredSession } from './portals/auth/sessionManager';

export default function App() {
  const path = window.location.pathname;
  const isPortalDashboard = path === '/portals/dashboard';
  const isPortalsRoute = path === '/portals' || path.startsWith('/portals/');

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
