import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { getPortalUsersByWebsite } from '../portals/data/users';
import { portalWebsites } from '../portals/data/websites';

export default function PortalsAdminWebsites() {
  const session = getStoredSession();
  const user = session?.user;

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal websites management">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Management</span>
          <nav>
            <a href="/portals/admin">Client Management</a>
            <a href="/portals/admin/websites" className="active">Websites</a>
            <a href="/portals/admin/publish-requests">Publish Requests</a>
            <a href="/portals/dashboard">Client View</a>
            <a href="/portals/admin/settings">Settings</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Website Management</p>
              <h2>Client Websites</h2>
              <p className="portal-role-line">Signed in as <strong>{user?.name ?? 'KSJ Digital Admin'}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-section-list">
            {portalWebsites.map((website) => {
              const assignedUsers = getPortalUsersByWebsite(website.id);

              return (
                <article key={website.id}>
                  <div>
                    <div className="portal-section-title-row">
                      <strong>{website.name}</strong>
                      <span>{website.status}</span>
                    </div>
                    <p>{website.domain}</p>
                    <ul>
                      <li>{website.type}</li>
                      <li>{website.access}</li>
                      <li>{website.publishMode}</li>
                      <li>{assignedUsers.length} Assigned User(s)</li>
                    </ul>
                  </div>
                  <button type="button">Manage</button>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
