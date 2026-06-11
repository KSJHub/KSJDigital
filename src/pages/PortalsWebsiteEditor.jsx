import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { portalContentSnapshot, portalEditableSections } from '../data/portalData';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { getPortalWebsiteById } from '../portals/data/websites';

export default function PortalsWebsiteEditor() {
  const session = getStoredSession();
  const website = getPortalWebsiteById('twotonetaj');

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Website editor">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Website</span>
          <nav>
            <a href="/portals/dashboard">Dashboard</a>
            <a href="/portals/websites/twotonetaj" className="active">Editor</a>
            <a href="/portals/drafts">Drafts</a>
            <a href="/portals/publish-requests">Publish Requests</a>
            <a href="/portals/support">Support</a>
            <a href="/portals/account">Account</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Website Editor</p>
              <h2>{website?.name ?? 'Website'}</h2>
              <p className="portal-role-line">Signed in as <strong>{session?.user?.name ?? 'Client'}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <article className="portal-site-card">
            <div className="portal-site-preview">
              <strong>{website?.name?.toUpperCase() ?? 'WEBSITE'}</strong>
              <span>{website?.domain}</span>
            </div>
            <div>
              <span className="portal-status">{website?.status}</span>
              <h3>Editable Website Content</h3>
              <p>Client changes are saved as drafts first. Nothing is published live until KSJ Digital approves it.</p>
              <dl>
                <div>
                  <dt>Mode</dt>
                  <dd>Draft First</dd>
                </div>
                <div>
                  <dt>Publishing</dt>
                  <dd>{website?.publishMode}</dd>
                </div>
                <div>
                  <dt>Preview</dt>
                  <dd>Coming Next</dd>
                </div>
              </dl>
            </div>
          </article>

          <section className="portal-editor-panel">
            <div className="portal-editor-header">
              <div>
                <p className="eyebrow">Sections</p>
                <h2>Manage Content</h2>
                <p>Select a section to prepare editable fields for the client portal.</p>
              </div>
              <a href={website?.url ?? '/'}>View Live Site</a>
            </div>

            <div className="portal-section-list">
              {portalEditableSections.map((section) => (
                <article key={section.id}>
                  <div>
                    <div className="portal-section-title-row">
                      <strong>{section.title}</strong>
                      <span>{section.status}</span>
                    </div>
                    <p>{section.text}</p>
                    <ul>
                      {section.fields.map((field) => <li key={field}>{field}</li>)}
                    </ul>
                  </div>
                  <button type="button">Edit</button>
                </article>
              ))}
            </div>
          </section>

          <section className="portal-content-snapshot">
            <div>
              <p className="eyebrow">Current Draft Snapshot</p>
              <h2>{portalContentSnapshot.homepage.heroTitle}</h2>
              <p>{portalContentSnapshot.homepage.summary}</p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
