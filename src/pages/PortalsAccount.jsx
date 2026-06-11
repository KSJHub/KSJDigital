import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';

export default function PortalsAccount() {
  const session = getStoredSession();
  const user = session?.user;

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal account">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Portals</span>
          <nav>
            <a href="/portals/dashboard">Dashboard</a>
            <a href="/portals/websites/twotonetaj">My Website</a>
            <a href="/portals/drafts">Drafts</a>
            <a href="/portals/publish-requests">Publish Requests</a>
            <a href="/portals/support">Support</a>
            <a href="/portals/account" className="active">Account</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Account</p>
              <h2>Account Settings</h2>
              <p className="portal-role-line">Signed in as <strong>{user?.name ?? 'Client'}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-grid-two">
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">Profile</p>
                  <h2>Your Portal Account</h2>
                  <p>Review your portal details and access level.</p>
                </div>
              </div>
              <div className="portal-admin-form">
                <label>
                  Name
                  <input type="text" value={user?.name ?? ''} readOnly />
                </label>
                <label>
                  Role
                  <input type="text" value={user?.role ?? ''} readOnly />
                </label>
                <label>
                  Access
                  <input type="text" value="Managed website portal" readOnly />
                </label>
                <button type="button">Request Account Update</button>
              </div>
            </section>

            <section className="portal-help-card">
              <h3>Security</h3>
              <p>Password reset, invite links, and two-factor authentication will be connected when backend authentication is added.</p>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
