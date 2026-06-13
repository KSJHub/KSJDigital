import PortalSidebar from '../components/PortalSidebar';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { getPortalData } from '../portals/data/portalManager';

function getActiveBackups(websites, backups) {
  const websiteBackups = websites.filter((website) => website.backup?.status && website.backup.status !== 'No active backup').length;
  const storedBackups = backups.filter((backup) => backup.status === 'Active').length;
  return Math.max(websiteBackups, storedBackups);
}

export default function PortalsAdmin() {
  const session = getStoredSession();
  const portalData = getPortalData();
  const portalUsers = portalData.users ?? [];
  const portalWebsites = portalData.websites ?? [];
  const publishRequests = portalData.publishRequests ?? [];
  const supportTickets = portalData.supportTickets ?? [];
  const backups = portalData.backups ?? [];
  const activityLogs = portalData.activityLogs ?? [];
  const notifications = portalData.notifications ?? [];
  const user = session?.user ?? portalUsers[0];

  const adminStats = [
    { label: 'Clients', value: String(portalUsers.filter((item) => item.role !== 'owner').length) },
    { label: 'Websites', value: String(portalWebsites.length) },
    { label: 'Pending Publishes', value: String(publishRequests.filter((item) => ['Draft', 'Pending', 'Pending Review'].includes(item.status)).length) },
    { label: 'Open Tickets', value: String(supportTickets.filter((item) => item.status !== 'Closed').length) },
    { label: 'Active Backups', value: String(getActiveBackups(portalWebsites, backups)) },
  ];

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="KSJ Digital Portals admin dashboard">
        <PortalSidebar title="Management" section="admin" />

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">KSJ Digital Admin</p>
              <h2>Admin Dashboard</h2>
              <p className="portal-role-line">Signed in as <strong>{user?.name ?? 'KSJ Digital Admin'}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-admin-stats">
            {adminStats.map((stat) => (
              <article className="portal-help-card" key={stat.label}>
                <p className="eyebrow">{stat.label}</p>
                <h3>{stat.value}</h3>
              </article>
            ))}
          </div>

          {notifications.length > 0 && (
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">Notifications</p>
                  <h2>Needs Attention</h2>
                  <p>Important portal alerts across publishing, support, backups, and hosting.</p>
                </div>
              </div>
              <div className="portal-section-list">
                {notifications.map((notification) => (
                  <article key={notification.id}>
                    <div>
                      <div className="portal-section-title-row"><strong>{notification.type}</strong><span>{notification.level}</span></div>
                      <p>{notification.message}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="portal-grid-two">
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">Quick Actions</p>
                  <h2>Manage Portal</h2>
                  <p>Jump straight into the core portal workflows.</p>
                </div>
              </div>
              <div className="portal-inline-actions">
                <a href="/portals/admin/users">Create Client</a>
                <a href="/portals/admin/websites">Create Website</a>
                <a href="/portals/publish-requests">Review Publishes</a>
                <a href="/portals/support">View Tickets</a>
              </div>
            </section>

            <section className="portal-help-card">
              <p className="eyebrow">Recent Activity</p>
              <h3>Portal Timeline</h3>
              <div className="portal-activity-list">
                {(activityLogs.length ? activityLogs : []).map((activity) => <small key={activity.id}>{activity.label} · {activity.target} · {activity.timestamp}</small>)}
              </div>
            </section>
          </div>

          <section className="portal-editor-panel">
            <div className="portal-editor-header">
              <div>
                <p className="eyebrow">Websites</p>
                <h2>Managed Sites Overview</h2>
                <p>Status summary for every website connected to KSJ Digital Portals.</p>
              </div>
            </div>
            <div className="portal-section-list">
              {portalWebsites.map((website) => (
                <article key={website.id}>
                  <div>
                    <div className="portal-section-title-row"><strong>{website.name}</strong><span>{website.hostingStatus ?? website.status}</span></div>
                    <p>{website.domain}</p>
                    <ul>
                      <li>Portal: {website.portalStatus ?? 'Active'}</li>
                      <li>Publish: {website.publishMode}</li>
                      <li>Backup: {website.backup?.enabled ? `${website.backup?.retentionHours ?? 48}h enabled` : 'Disabled'}</li>
                    </ul>
                  </div>
                  <a href="/portals/admin/websites">Manage</a>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
