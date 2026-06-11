import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { portalDrafts } from '../portals/data/drafts';
import { getPortalWebsiteById } from '../portals/data/websites';

export default function PortalsDrafts() {
  const session = getStoredSession();

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal drafts">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Portals</span>
          <nav>
            <a href="/portals/dashboard">Dashboard</a>
            <a href="/portals/websites/twotonetaj">Editor</a>
            <a href="/portals/drafts" className="active">Drafts</a>
            <a href="/portals/publish-requests">Publish Requests</a>
            <a href="/portals/support">Support</a>
            <a href="/portals/account">Account</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Drafts</p>
              <h2>Saved Website Drafts</h2>
              <p className="portal-role-line">Signed in as <strong>{session?.user?.name ?? 'Client'}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-section-list">
            {portalDrafts.map((draft) => {
              const website = getPortalWebsiteById(draft.websiteId);
              return (
                <article key={draft.id}>
                  <div>
                    <div className="portal-section-title-row">
                      <strong>{draft.section}</strong>
                      <span>{draft.status}</span>
                    </div>
                    <p>{draft.summary}</p>
                    <ul>
                      <li>{website?.name ?? draft.websiteId}</li>
                      <li>Updated by {draft.updatedBy}</li>
                    </ul>
                  </div>
                  <button type="button">Open</button>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
