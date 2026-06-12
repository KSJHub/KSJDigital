import { useMemo, useState } from 'react';
import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { getPortalPublishRequests, getPortalWebsiteById } from '../portals/data/portalManager';

const workflowStatuses = ['Pending', 'Approved', 'Rejected', 'Published'];

function normaliseStatus(status) {
  if (status === 'Draft') return 'Pending';
  if (status === 'Pending Review') return 'Pending';
  return status ?? 'Pending';
}

export default function PortalsPublishRequests() {
  const session = getStoredSession();
  const portalPublishRequests = getPortalPublishRequests();
  const [activeStatus, setActiveStatus] = useState('Pending');
  const [selectedRequestId, setSelectedRequestId] = useState(portalPublishRequests[0]?.id ?? null);

  const filteredRequests = portalPublishRequests.filter((request) => normaliseStatus(request.status) === activeStatus);
  const selectedRequest = useMemo(
    () => portalPublishRequests.find((request) => request.id === selectedRequestId) ?? portalPublishRequests[0],
    [portalPublishRequests, selectedRequestId],
  );
  const selectedWebsite = selectedRequest ? getPortalWebsiteById(selectedRequest.websiteId) : null;

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal publish requests">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Portals</span>
          <nav>
            <a href="/portals/dashboard">Dashboard</a>
            <a href="/portals/websites/twotonetaj">My Website</a>
            <a href="/portals/drafts">Drafts</a>
            <a href="/portals/publish-requests" className="active">Publish Requests</a>
            <a href="/portals/support">Support</a>
            <a href="/portals/account">Account</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Publishing</p>
              <h2>Publish Requests</h2>
              <p className="portal-role-line">Signed in as <strong>{session?.user?.name ?? 'Client'}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-admin-stats">
            {workflowStatuses.map((status) => (
              <article className="portal-help-card" key={status}>
                <p className="eyebrow">{status}</p>
                <h3>{portalPublishRequests.filter((request) => normaliseStatus(request.status) === status).length}</h3>
              </article>
            ))}
          </div>

          <div className="portal-inline-actions">
            {workflowStatuses.map((status) => <button type="button" key={status} onClick={() => setActiveStatus(status)}>{status}</button>)}
          </div>

          <div className="portal-grid-two">
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">{activeStatus}</p>
                  <h2>Request Queue</h2>
                  <p>Review client changes before anything is published live.</p>
                </div>
              </div>
              <div className="portal-section-list">
                {(filteredRequests.length ? filteredRequests : portalPublishRequests).map((request) => {
                  const website = getPortalWebsiteById(request.websiteId);
                  return (
                    <article key={request.id}>
                      <div>
                        <div className="portal-section-title-row"><strong>{request.title}</strong><span>{normaliseStatus(request.status)}</span></div>
                        <p>{request.summary}</p>
                        <ul>
                          <li>{website?.name ?? request.websiteId}</li>
                          <li>Requested by {request.requestedBy}</li>
                          <li>{request.updatedAt}</li>
                        </ul>
                      </div>
                      <button type="button" onClick={() => setSelectedRequestId(request.id)}>View</button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="portal-help-card portal-selection-guide">
              <p className="eyebrow">Request Details</p>
              <h3>{selectedRequest?.title ?? 'No request selected'}</h3>
              <p>{selectedRequest?.summary ?? 'Select a request to review it.'}</p>
              {selectedRequest && (
                <div className="portal-detail-group">
                  <strong>Workflow</strong>
                  <small>Website: {selectedWebsite?.name ?? selectedRequest.websiteId}</small>
                  <small>Status: {normaliseStatus(selectedRequest.status)}</small>
                  <small>Submitted by: {selectedRequest.requestedBy}</small>
                  <small>Change summary: {selectedRequest.summary}</small>
                  <small>Draft link: Coming next</small>
                </div>
              )}
              <div className="portal-action-row portal-action-row-primary">
                <button type="button">Approve</button>
                <button type="button" className="portal-secondary-button">Reject</button>
              </div>
              <div className="portal-action-row portal-action-row-danger">
                <button type="button" className="portal-warning-button">Publish</button>
              </div>
              <p className="portal-inline-notice">Publishing will create a 48-hour restore backup before the live copy is replaced.</p>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
