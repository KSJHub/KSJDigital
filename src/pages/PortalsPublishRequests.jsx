import { useMemo, useState } from 'react';
import PortalSidebar from '../components/PortalSidebar';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { hasPermission, PORTAL_PERMISSIONS } from '../portals/auth/permissions';
import {
  getPortalData,
  getPortalWebsiteById,
  savePortalData,
} from '../portals/data/portalManager';

const workflowStatuses = ['Pending', 'Approved', 'Rejected', 'Published'];

function normaliseStatus(status) {
  if (status === 'Draft') return 'Pending';
  if (status === 'Pending Review') return 'Pending';
  return status ?? 'Pending';
}

function getDraftForRequest(request, drafts) {
  if (!request) return null;
  if (request.draftId) return drafts.find((draft) => draft.id === request.draftId) ?? null;
  return drafts.find((draft) => draft.websiteId === request.websiteId) ?? null;
}

function createActivity(type, label, actor, target) {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    label,
    actor,
    target,
    timestamp: 'Just now',
  };
}

function formatSnapshot(content) {
  const entries = Object.entries(content ?? {}).filter(([, value]) => value !== '' && value !== null && value !== undefined);
  if (!entries.length) return 'No snapshot content available.';
  return entries.map(([key, value]) => `${key}: ${value}`).join('\n');
}

export default function PortalsPublishRequests() {
  const session = getStoredSession();
  const user = session?.user;
  const canApprovePublish = hasPermission(user, PORTAL_PERMISSIONS.APPROVE_PUBLISH);
  const canManageBackups = hasPermission(user, PORTAL_PERMISSIONS.MANAGE_BACKUPS);
  const initialPortalData = getPortalData();
  const [portalData, setPortalData] = useState(initialPortalData);
  const [activeStatus, setActiveStatus] = useState('Pending');
  const [selectedRequestId, setSelectedRequestId] = useState(initialPortalData.publishRequests?.[0]?.id ?? null);
  const [selectedBackupId, setSelectedBackupId] = useState(initialPortalData.backups?.[0]?.id ?? null);
  const [reviewNote, setReviewNote] = useState('');

  const portalPublishRequests = portalData.publishRequests ?? [];
  const portalDrafts = portalData.drafts ?? [];
  const portalBackups = portalData.backups ?? [];
  const filteredRequests = portalPublishRequests.filter((request) => normaliseStatus(request.status) === activeStatus);

  const selectedRequest = useMemo(
    () => portalPublishRequests.find((request) => request.id === selectedRequestId) ?? portalPublishRequests[0],
    [portalPublishRequests, selectedRequestId],
  );
  const selectedWebsite = selectedRequest ? getPortalWebsiteById(selectedRequest.websiteId) : null;
  const selectedDraft = getDraftForRequest(selectedRequest, portalDrafts);
  const selectedBackup = useMemo(
    () => portalBackups.find((backup) => backup.id === selectedBackupId) ?? portalBackups[0],
    [portalBackups, selectedBackupId],
  );
  const selectedBackupWebsite = selectedBackup ? getPortalWebsiteById(selectedBackup.websiteId) : null;

  function commitPortalData(nextData) {
    const savedData = savePortalData(nextData);
    setPortalData(savedData);
    return savedData;
  }

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  function updateRequestStatus(status) {
    if (!selectedRequest || !canApprovePublish) return;

    const actor = user?.name ?? 'KSJ Digital Admin';
    const nextRequest = {
      ...selectedRequest,
      status,
      updatedAt: 'Just now',
      reviewedBy: actor,
      reviewNote: reviewNote.trim() || selectedRequest.reviewNote || '',
      history: [
        ...(selectedRequest.history ?? []),
        {
          id: `history-${Date.now()}`,
          status,
          actor,
          note: reviewNote.trim() || `${status} selected`,
          timestamp: 'Just now',
        },
      ],
    };

    const nextActivity = createActivity('publish.updated', `Publish request ${status.toLowerCase()}`, actor, selectedRequest.title);

    commitPortalData({
      ...portalData,
      publishRequests: portalPublishRequests.map((request) => request.id === selectedRequest.id ? nextRequest : request),
      activityLogs: [nextActivity, ...(portalData.activityLogs ?? [])],
    });
    setActiveStatus(normaliseStatus(status));
    setReviewNote('');
  }

  function publishRequest() {
    if (!selectedRequest || !canApprovePublish) return;

    const actor = user?.name ?? 'KSJ Digital Admin';
    const pageId = selectedRequest.pageId ?? selectedDraft?.pageId;
    const currentPageContent = pageId ? portalData.content?.[selectedRequest.websiteId]?.[pageId] ?? { live: {}, draft: {}, backup: null } : null;
    const nextLiveContent = currentPageContent?.draft ?? {};
    const backupId = `backup-${selectedRequest.websiteId}-${pageId}-${Date.now()}`;
    const nextBackup = {
      id: backupId,
      websiteId: selectedRequest.websiteId,
      pageId,
      status: 'Active',
      createdAt: 'Just now',
      expiresAt: '48 hours from publish',
      createdBy: actor,
      reason: `Safety backup before publishing ${selectedRequest.title}`,
      restoreStatus: 'Available',
      contentSnapshot: currentPageContent?.live ?? {},
    };

    const nextActivity = createActivity('publish.published', 'Publish completed and 48-hour backup created', actor, selectedRequest.title);

    commitPortalData({
      ...portalData,
      content: pageId ? {
        ...(portalData.content ?? {}),
        [selectedRequest.websiteId]: {
          ...(portalData.content?.[selectedRequest.websiteId] ?? {}),
          [pageId]: {
            ...currentPageContent,
            live: nextLiveContent,
            draft: {},
            backup: {
              id: backupId,
              contentSnapshot: currentPageContent?.live ?? {},
              createdAt: 'Just now',
              expiresAt: '48 hours from publish',
              restoreStatus: 'Available',
            },
          },
        },
      } : portalData.content,
      drafts: (portalData.drafts ?? []).map((draft) => draft.id === selectedRequest.draftId ? {
        ...draft,
        status: 'Published',
        currentVersion: draft.draftVersion,
        draftVersion: 'Published to live. No active draft.',
      } : draft),
      publishRequests: portalPublishRequests.map((request) => request.id === selectedRequest.id ? {
        ...request,
        status: 'Published',
        updatedAt: 'Just now',
        publishedBy: actor,
        reviewNote: reviewNote.trim() || request.reviewNote || '',
        history: [
          ...(request.history ?? []),
          { id: `history-${Date.now()}`, status: 'Published', actor, note: 'Published with 48-hour backup created', timestamp: 'Just now' },
        ],
      } : request),
      websites: (portalData.websites ?? []).map((website) => website.id === selectedRequest.websiteId ? {
        ...website,
        lastPublish: 'Just now',
        lastEditor: actor,
        backup: {
          ...(website.backup ?? {}),
          enabled: true,
          retentionHours: 48,
          status: 'Active restore backup available',
          lastCreatedAt: 'Just now',
          expiresAt: '48 hours from publish',
        },
      } : website),
      backups: [
        nextBackup,
        ...(portalData.backups ?? []).filter((backup) => !(backup.websiteId === selectedRequest.websiteId && backup.pageId === pageId)),
      ],
      activityLogs: [nextActivity, ...(portalData.activityLogs ?? [])],
      notifications: [
        {
          id: `notice-${Date.now()}`,
          type: 'backup',
          level: 'success',
          message: `${selectedWebsite?.name ?? selectedRequest.websiteId} has a 48-hour restore backup available.`,
        },
        ...(portalData.notifications ?? []),
      ],
    });
    setSelectedBackupId(backupId);
    setActiveStatus('Published');
    setReviewNote('');
  }

  function restoreBackup() {
    if (!selectedBackup?.websiteId || !selectedBackup?.pageId || !canManageBackups) return;

    const actor = user?.name ?? 'KSJ Digital Admin';
    const websiteContent = portalData.content?.[selectedBackup.websiteId] ?? {};
    const currentPage = websiteContent[selectedBackup.pageId] ?? { live: {}, draft: {}, backup: null };
    const restoredContent = selectedBackup.contentSnapshot ?? {};
    const nextActivity = createActivity('backup.restored', '48-hour restore backup used', actor, `${selectedBackup.websiteId}/${selectedBackup.pageId}`);

    commitPortalData({
      ...portalData,
      content: {
        ...(portalData.content ?? {}),
        [selectedBackup.websiteId]: {
          ...websiteContent,
          [selectedBackup.pageId]: {
            ...currentPage,
            live: restoredContent,
            draft: {},
            backup: {
              ...(currentPage.backup ?? {}),
              restoreStatus: 'Restored',
              restoredAt: 'Just now',
              restoredBy: actor,
            },
          },
        },
      },
      backups: (portalData.backups ?? []).map((backup) => backup.id === selectedBackup.id ? {
        ...backup,
        status: 'Restored',
        restoreStatus: 'Restored',
        restoredAt: 'Just now',
        restoredBy: actor,
      } : backup),
      websites: (portalData.websites ?? []).map((website) => website.id === selectedBackup.websiteId ? {
        ...website,
        lastEditor: actor,
        lastPublish: 'Restored from backup just now',
        backup: {
          ...(website.backup ?? {}),
          status: 'Backup restored',
          lastRestoredAt: 'Just now',
        },
      } : website),
      activityLogs: [nextActivity, ...(portalData.activityLogs ?? [])],
      notifications: [
        {
          id: `notice-${Date.now()}`,
          type: 'backup',
          level: 'success',
          message: `${selectedBackupWebsite?.name ?? selectedBackup.websiteId} was restored from a 48-hour backup.`,
        },
        ...(portalData.notifications ?? []),
      ],
    });
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal publish requests">
        <PortalSidebar />

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Publishing</p>
              <h2>Publish Requests</h2>
              <p className="portal-role-line">Signed in as <strong>{user?.name ?? 'Client'}</strong></p>
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

          <section className="portal-editor-panel">
            <div className="portal-editor-header">
              <div>
                <p className="eyebrow">48 Hour Backup Protection</p>
                <h2>Safe Publishing Workflow</h2>
                <p>{canApprovePublish ? 'Publishing creates one temporary restore backup per page before the live website content is replaced.' : 'Track submitted publish requests. Approval controls are hidden for your role.'}</p>
              </div>
            </div>
          </section>

          <div className="portal-inline-actions">
            {workflowStatuses.map((status) => <button type="button" key={status} onClick={() => setActiveStatus(status)}>{status}</button>)}
          </div>

          <div className="portal-grid-two">
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">{activeStatus}</p>
                  <h2>Request Queue</h2>
                  <p>{canApprovePublish ? 'Review client changes before anything is published live.' : 'View submitted changes and review status.'}</p>
                </div>
              </div>
              <div className="portal-section-list">
                {(filteredRequests.length ? filteredRequests : portalPublishRequests).map((request) => {
                  const website = getPortalWebsiteById(request.websiteId);
                  const linkedDraft = getDraftForRequest(request, portalDrafts);
                  return (
                    <article key={request.id}>
                      <div>
                        <div className="portal-section-title-row"><strong>{request.title}</strong><span>{normaliseStatus(request.status)}</span></div>
                        <p>{request.summary}</p>
                        <ul>
                          <li>{website?.name ?? request.websiteId}</li>
                          <li>Linked Draft: {linkedDraft?.section ?? 'Not linked'}</li>
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
                <>
                  <div className="portal-detail-group">
                    <strong>Workflow</strong>
                    <small>Website: {selectedWebsite?.name ?? selectedRequest.websiteId}</small>
                    <small>Status: {normaliseStatus(selectedRequest.status)}</small>
                    <small>Submitted by: {selectedRequest.requestedBy}</small>
                    <small>Change summary: {selectedRequest.summary}</small>
                    <small>Linked draft: {selectedDraft?.section ?? 'No draft linked yet'}</small>
                  </div>

                  <div className="portal-grid-two">
                    <div className="portal-management-card compact">
                      <div className="portal-section-title-row"><strong>Current Live</strong><span>Before Publish</span></div>
                      <p>{selectedDraft?.currentVersion ?? 'Current live snapshot will be connected with the content engine.'}</p>
                    </div>
                    <div className="portal-management-card compact">
                      <div className="portal-section-title-row"><strong>Requested Changes</strong><span>Draft</span></div>
                      <p>{selectedDraft?.draftVersion ?? selectedRequest.summary}</p>
                    </div>
                  </div>

                  {canApprovePublish && (
                    <div className="portal-admin-form">
                      <label>
                        Review Note
                        <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows="3" placeholder="Add an approval, rejection, or publish note..." />
                      </label>
                    </div>
                  )}

                  <div className="portal-detail-group">
                    <strong>Change History</strong>
                    {(selectedRequest.history ?? []).length ? selectedRequest.history.map((item) => (
                      <small key={item.id}>{item.status} · {item.actor} · {item.note} · {item.timestamp}</small>
                    )) : <small>No workflow history yet.</small>}
                  </div>
                </>
              )}

              {canApprovePublish ? (
                <>
                  <div className="portal-action-row portal-action-row-primary">
                    <button type="button" onClick={() => updateRequestStatus('Approved')}>Approve</button>
                    <button type="button" className="portal-secondary-button" onClick={() => updateRequestStatus('Rejected')}>Reject</button>
                  </div>
                  <div className="portal-action-row portal-action-row-danger">
                    <button type="button" className="portal-warning-button" onClick={publishRequest}>Publish + Create 48h Backup</button>
                  </div>
                </>
              ) : (
                <p className="portal-inline-notice">Read-only access. Approval, rejection, publishing, and backup controls are hidden for your role.</p>
              )}
              <p className="portal-inline-notice">Publishing stays inside the portal simulation layer. It does not touch GitHub, VPS, or live website files yet.</p>
            </section>
          </div>

          {canManageBackups && (
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">Restore Safety</p>
                  <h2>48 Hour Backups</h2>
                  <p>Only one temporary restore backup is kept per website page in this simulation. Restoring replaces the portal live content with the saved backup snapshot.</p>
                </div>
              </div>

              <div className="portal-grid-two">
                <div className="portal-section-list">
                  {portalBackups.length ? portalBackups.map((backup) => {
                    const website = getPortalWebsiteById(backup.websiteId);
                    return (
                      <article key={backup.id}>
                        <div>
                          <div className="portal-section-title-row"><strong>{website?.name ?? backup.websiteId}</strong><span>{backup.restoreStatus ?? backup.status}</span></div>
                          <p>{backup.reason}</p>
                          <ul>
                            <li>Page: {backup.pageId ?? 'Website'}</li>
                            <li>Created: {backup.createdAt}</li>
                            <li>Expires: {backup.expiresAt}</li>
                          </ul>
                        </div>
                        <button type="button" onClick={() => setSelectedBackupId(backup.id)}>Inspect</button>
                      </article>
                    );
                  }) : (
                    <article>
                      <div>
                        <div className="portal-section-title-row"><strong>No active backups</strong><span>Waiting</span></div>
                        <p>Publish an approved request to create the first 48-hour backup.</p>
                      </div>
                    </article>
                  )}
                </div>

                <section className="portal-help-card portal-selection-guide">
                  <p className="eyebrow">Selected Backup</p>
                  <h3>{selectedBackupWebsite?.name ?? 'No backup selected'}</h3>
                  {selectedBackup ? (
                    <>
                      <div className="portal-detail-group">
                        <strong>Backup Details</strong>
                        <small>Website: {selectedBackupWebsite?.name ?? selectedBackup.websiteId}</small>
                        <small>Page: {selectedBackup.pageId ?? 'Website'}</small>
                        <small>Status: {selectedBackup.restoreStatus ?? selectedBackup.status}</small>
                        <small>Created: {selectedBackup.createdAt}</small>
                        <small>Expires: {selectedBackup.expiresAt}</small>
                      </div>
                      <div className="portal-management-card compact">
                        <div className="portal-section-title-row"><strong>Backup Snapshot</strong><span>Previous Live</span></div>
                        <p>{formatSnapshot(selectedBackup.contentSnapshot)}</p>
                      </div>
                      <div className="portal-action-row portal-action-row-danger">
                        <button type="button" className="portal-warning-button" onClick={restoreBackup}>Restore This Backup</button>
                      </div>
                    </>
                  ) : <p>Select a backup to inspect it.</p>}
                </section>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
