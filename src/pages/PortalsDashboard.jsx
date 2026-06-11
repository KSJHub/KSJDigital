import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import {
  portalProject,
  portalQuickActions,
  portalRecentActivity,
  portalUser,
} from '../data/portalData';
import { PORTAL_ROLES } from '../portals/auth/permissions';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';

export default function PortalsDashboard() {
  const session = getStoredSession();
  const user = session?.user ?? portalUser;
  const isOwner = user.role === PORTAL_ROLES.OWNER;

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="KSJ Digital Portals dashboard">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Portals</span>
          <nav>
            <a href="/portals/dashboard" className="active">Dashboard</a>
            <a href="/portals/websites/twotonetaj">My Website</a>
            <a href="/portals/drafts">Drafts</a>
            <a href="/portals/publish-requests">Publish Requests</a>
            <a href="/portals/support">Support</a>
            <a href="/portals/account">Account</a>
            {isOwner && <a href="/portals/management" className="portal-owner-link">Management Panel</a>}
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Welcome, {user.name}</p>
              <h2>Client Dashboard</h2>
              <p className="portal-role-line">Role: <strong>{user.role}</strong></p>
            </div>
            <div className="portal-header-actions">
              <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
            </div>
          </header>

          <article className="portal-site-card">
            <div className="portal-site-preview">
              <strong>{portalProject.name.toUpperCase()}</strong>
              <span>{portalProject.domain}</span>
            </div>
            <div>
              <span className="portal-status">{portalProject.status}</span>
              <h3>{portalProject.name}</h3>
              <p>{portalProject.description}</p>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{portalProject.status}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>{portalProject.access}</dd>
                </div>
                <div>
                  <dt>Publish Mode</dt>
                  <dd>{portalProject.publishMode}</dd>
                </div>
              </dl>
            </div>
            <a className="portal-manage-button" href="/portals/websites/twotonetaj">Manage Website</a>
          </article>

          <div className="portal-grid-two">
            <section>
              <h3>Quick Actions</h3>
              <div className="portal-action-grid">
                {portalQuickActions.map((action) => (
                  <button type="button" key={action.title}>
                    <span>{action.icon}</span>
                    <strong>{action.title}</strong>
                    <small>{action.text}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="portal-help-card">
              <h3>Portal Status</h3>
              <p>Drafts and publish requests are prepared for the next development phase.</p>
              <div className="portal-activity-list">
                {portalRecentActivity.map((item) => <small key={item}>{item}</small>)}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
