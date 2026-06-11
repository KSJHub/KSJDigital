import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { portalUsers } from '../portals/data/users';
import { portalWebsites } from '../portals/data/websites';

function getWebsiteNames(websiteIds) {
  return websiteIds
    .map((id) => portalWebsites.find((website) => website.id === id)?.name)
    .filter(Boolean)
    .join(', ');
}

export default function PortalsAdminUsers() {
  const session = getStoredSession();
  const user = session?.user ?? portalUsers[0];

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal users management">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Admin</span>
          <nav>
            <a href="/portals/admin">Admin Home</a>
            <a href="/portals/admin/users" className="active">Users</a>
            <a href="/portals/admin/websites">Websites</a>
            <a href="/portals/admin/publish-requests">Publish Requests</a>
            <a href="/portals/dashboard">Client View</a>
            <a href="/portals/admin/settings">Settings</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">User Management</p>
              <h2>Portal Users</h2>
              <p className="portal-role-line">Signed in as <strong>{user.name}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <section className="portal-editor-panel">
            <div className="portal-editor-header">
              <div>
                <p className="eyebrow">Users</p>
                <h2>Manage Client Logins</h2>
                <p>Create, review, and assign access for KSJ Digital clients.</p>
              </div>
              <button className="portal-logout-button" type="button">Create User</button>
            </div>

            <div className="portal-admin-table">
              <div className="portal-admin-table-head">
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Status</span>
                <span>Websites</span>
                <span>Actions</span>
              </div>
              {portalUsers.map((portalUser) => (
                <div className="portal-admin-table-row" key={portalUser.id}>
                  <span>{portalUser.name}</span>
                  <span>{portalUser.email}</span>
                  <span>{portalUser.role}</span>
                  <span>{portalUser.status}</span>
                  <span>{getWebsiteNames(portalUser.websiteIds)}</span>
                  <span>Edit · Disable</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
