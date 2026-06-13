import { useState } from 'react';
import PortalSidebar from '../components/PortalSidebar';
import { clearSession, getSessionExpiryLabel, getStoredSession } from '../portals/auth/sessionManager';
import { changePortalPassword } from '../portals/auth/authService';

const roleLabels = {
  owner: 'Owner',
  staff: 'Website Manager',
  websiteManager: 'Website Manager',
  supportAgent: 'Support Agent',
  client: 'Client Administrator',
  clientAdmin: 'Client Administrator',
  contentEditor: 'Content Editor',
  viewer: 'Viewer',
};

export default function PortalsAccount() {
  const session = getStoredSession();
  const user = session?.user;
  const roleLabel = roleLabels[user?.role] ?? 'Client';
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    if (!user?.id) return setPasswordNotice('No active user session found. Please log in again.');

    const result = await changePortalPassword(user.id, currentPassword, nextPassword, confirmPassword);
    setPasswordNotice(result.message);

    if (result.ok) {
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
    }
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal account">
        <PortalSidebar />

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Account</p>
              <h2>Account Settings</h2>
              <p className="portal-role-line">Signed in as <strong>{user?.name ?? 'Client'}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          {user?.mustChangePassword && (
            <p className="portal-inline-notice">Your account is using a temporary password. Please change it before continuing regular portal work.</p>
          )}

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
                  <input type="text" value={roleLabel} readOnly />
                </label>
                <label>
                  Session Expires
                  <input type="text" value={getSessionExpiryLabel(session)} readOnly />
                </label>
                <label>
                  Account Status
                  <input type="text" value={user?.status ?? 'Active'} readOnly />
                </label>
              </div>
            </section>

            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">Security</p>
                  <h2>Change Password</h2>
                  <p>Update your portal password. Use at least 8 characters.</p>
                </div>
              </div>
              <form className="portal-admin-form" onSubmit={handleChangePassword}>
                <label>
                  Current Password
                  <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
                </label>
                <label>
                  New Password
                  <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} autoComplete="new-password" />
                </label>
                <label>
                  Confirm New Password
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
                </label>
                <div className="portal-action-row portal-action-row-primary">
                  <button type="submit">Update Password</button>
                </div>
              </form>
              {passwordNotice && <p className="portal-inline-notice">{passwordNotice}</p>}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
