import { useMemo, useState } from 'react';
import PortalSidebar from '../components/PortalSidebar';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { getPortalData, savePortalData } from '../portals/data/portalManager';

function getWebsiteName(websiteId, websites) {
  return websites.find((website) => website.id === websiteId)?.name ?? 'Unknown Website';
}

function isActiveBackup(backup) {
  return backup.status === 'Active' || backup.restoreStatus === 'Available';
}

export default function PortalsAdminBackups() {
  const session = getStoredSession();
  const initialPortalData = getPortalData();
  const [portalData, setPortalData] = useState(initialPortalData);
  const [activeFilter, setActiveFilter] = useState('Active');
  const [selectedBackupId, setSelectedBackupId] = useState(initialPortalData.backups?.[0]?.id ?? null);

  const backups = portalData.backups ?? [];
  const websites = portalData.websites ?? [];
  const selectedBackup = useMemo(
    () => backups.find((backup) => backup.id === selectedBackupId) ?? backups[0],
    [backups, selectedBackupId],
  );
  const filteredBackups = backups.filter((backup) => activeFilter === 'All' || backup.status === activeFilter || backup.restoreStatus === activeFilter);

  function commitPortalData(nextData) {
    const savedData = savePortalData(nextData);
    setPortalData(savedData);
    return savedData;
  }

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  function markBackupRestored() {
    if (!selectedBackup) return;
    const actor = session?.user?.name ?? 'KSJ Digital Admin';
    const websiteName = getWebsiteName(selectedBackup.websiteId, websites);

    commitPortalData({
      ...portalData,
      backups: backups.map((backup) => backup.id === selectedBackup.id ? {
        ...backup,
        status: 'Restored',
        restoreStatus: 'Restored',
        restoredAt: 'Just now',
        restoredBy: actor,
      } : backup),
      websites: websites.map((website) => website.id === selectedBackup.websiteId ? {
        ...website,
        lastEditor: actor,
        lastPublish: 'Restored from backup just now',
        backup: {
          ...(website.backup ?? {}),
          status: 'Backup restored',
          lastCreatedAt: selectedBackup.createdAt,
          expiresAt: selectedBackup.expiresAt,
        },
      } : website),
      activityLogs: [
        {
          id: `activity-${Date.now()}`,
          type: 'backup.restored',
          label: 'Website backup restored',
          actor,
          target: websiteName,
          timestamp: 'Just now',
        },
        ...(portalData.activityLogs ?? []),
      ],
      notifications: [
        {
          id: `notice-${Date.now()}`,
          type: 'backup',
          level: 'success',
          message: `${websiteName} was restored from a 48-hour backup.`,
        },
        ...(portalData.notifications ?? []),
      ],
    });
  }

  function markBackupExpired() {
    if (!selectedBackup) return;
    commitPortalData({
      ...portalData,
      backups: backups.map((backup) => backup.id === selectedBackup.id ? {
        ...backup,
        status: 'Expired',
        restoreStatus: 'Expired',
        expiredAt: 'Just now',
      } : backup),
    });
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Backup restore center">
        <PortalSidebar title="Management" section="admin" />

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Backup Restore Center</p>
              <h2>48-Hour Website Backups</h2>
              <p className="portal-role-line">Signed in as <strong>{session?.user?.name ?? 'KSJ Digital Admin'}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-admin-stats">
            <article className="portal-help-card"><p className="eyebrow">Total</p><h3>{backups.length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Active</p><h3>{backups.filter(isActiveBackup).length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Restored</p><h3>{backups.filter((backup) => backup.status === 'Restored').length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Expired</p><h3>{backups.filter((backup) => backup.status === 'Expired').length}</h3></article>
          </div>

          <section className="portal-editor-panel">
            <div className="portal-editor-header">
              <div>
                <p className="eyebrow">Client Warning</p>
                <h2>Temporary Restore Protection</h2>
                <p>A restore backup is only stored for 48 hours after publishing. After 48 hours, it is permanently expired and the live copy becomes the only copy.</p>
              </div>
            </div>
          </section>

          <div className="portal-inline-actions">
            {['Active', 'Restored', 'Expired', 'All'].map((filter) => <button type="button" key={filter} onClick={() => setActiveFilter(filter)}>{filter}</button>)}
          </div>

          <div className="portal-grid-two">
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">{activeFilter}</p>
                  <h2>Backup Queue</h2>
                  <p>Review available restore points created before client changes went live.</p>
                </div>
              </div>
              <div className="portal-section-list">
                {(filteredBackups.length ? filteredBackups : backups).map((backup) => (
                  <article key={backup.id}>
                    <div>
                      <div className="portal-section-title-row"><strong>{getWebsiteName(backup.websiteId, websites)}</strong><span>{backup.restoreStatus}</span></div>
                      <p>{backup.reason}</p>
                      <ul>
                        <li>Created: {backup.createdAt}</li>
                        <li>Expires: {backup.expiresAt}</li>
                        <li>Created by: {backup.createdBy}</li>
                      </ul>
                    </div>
                    <button type="button" onClick={() => setSelectedBackupId(backup.id)}>View</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="portal-help-card portal-selection-guide">
              <p className="eyebrow">Restore Details</p>
              <h3>{selectedBackup ? getWebsiteName(selectedBackup.websiteId, websites) : 'No backup selected'}</h3>
              <p>{selectedBackup?.reason ?? 'Select a backup to review restore options.'}</p>

              {selectedBackup && (
                <>
                  <div className="portal-detail-group">
                    <strong>Backup Information</strong>
                    <small>Status: {selectedBackup.status}</small>
                    <small>Restore: {selectedBackup.restoreStatus}</small>
                    <small>Created: {selectedBackup.createdAt}</small>
                    <small>Expires: {selectedBackup.expiresAt}</small>
                    <small>Created by: {selectedBackup.createdBy}</small>
                  </div>

                  <div className="portal-detail-group">
                    <strong>Restore Rules</strong>
                    <small>Only one live website copy is kept on the VPS.</small>
                    <small>Restoring replaces the current live copy with the temporary backup.</small>
                    <small>Backups expire permanently after 48 hours.</small>
                  </div>

                  <div className="portal-action-row portal-action-row-primary">
                    <button type="button" onClick={markBackupRestored}>Restore Backup</button>
                    <button type="button" className="portal-secondary-button" onClick={markBackupExpired}>Mark Expired</button>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
