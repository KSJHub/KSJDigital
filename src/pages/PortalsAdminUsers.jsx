import { useMemo, useState } from 'react';

import PortalSidebar from '../components/PortalSidebar';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { hashPortalPassword } from '../portals/auth/authService';
import { formatPortalRole, normalisePortalRole, PORTAL_ROLE_DESCRIPTIONS } from '../portals/auth/permissions';
import { getPortalData, savePortalData } from '../portals/data/portalManager';

const statusDescriptions = {
  Active: 'The user can access assigned portal areas.',
  Paused: 'The user access is paused until reactivated.',
};

function getWebsiteCountText(websiteIds) {
  const count = websiteIds?.length ?? 0;
  return `${count} Assigned Website${count === 1 ? '' : 's'}`;
}

function getWebsiteSummary(websiteIds, websites) {
  const names = websiteIds.map((id) => websites.find((website) => website.id === id)?.name).filter(Boolean);
  if (names.length === 0) return 'No Websites Assigned';
  if (names.length <= 2) return names.join(', ');
  return `${names[0]} + ${names.length - 1} more`;
}

function createEditorState(user, websites) {
  return {
    id: user?.id ?? '',
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: normalisePortalRole(user?.role),
    status: user?.status === 'Disabled' ? 'Paused' : user?.status ?? 'Active',
    websiteIds: user?.websiteIds?.length ? user.websiteIds : [websites[0]?.id].filter(Boolean),
    password: '',
    confirmPassword: '',
  };
}

function createBlankUserState(websites) {
  return { id: '', name: '', email: '', role: 'clientAdmin', status: 'Active', websiteIds: [websites[0]?.id].filter(Boolean), password: '', confirmPassword: '' };
}

function createUserId(email) {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `client-${Date.now()}`;
}

function syncWebsiteUserAccess(websites, userId, websiteIds) {
  return websites.map((website) => {
    const assignedUserIds = website.assignedUserIds ?? [];
    const shouldHaveAccess = websiteIds.includes(website.id);
    const alreadyAssigned = assignedUserIds.includes(userId);

    if (shouldHaveAccess && !alreadyAssigned) return { ...website, assignedUserIds: [...assignedUserIds, userId] };
    if (!shouldHaveAccess && alreadyAssigned) return { ...website, assignedUserIds: assignedUserIds.filter((id) => id !== userId) };
    return website;
  });
}

function passwordIsValid(password) {
  return String(password ?? '').length >= 8;
}

export default function PortalsAdminUsers() {
  const session = getStoredSession();
  const initialPortalData = getPortalData();
  const [portalData, setPortalData] = useState(initialPortalData);
  const users = portalData.users ?? [];
  const websites = portalData.websites ?? [];
  const [mode, setMode] = useState('edit');
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? '');
  const [editor, setEditor] = useState(() => createEditorState(users[0], websites));
  const [notice, setNotice] = useState('');

  const selectedUser = useMemo(() => users.find((portalUser) => portalUser.id === selectedUserId) ?? users[0], [selectedUserId, users]);
  const roleInfo = PORTAL_ROLE_DESCRIPTIONS[editor.role] ?? PORTAL_ROLE_DESCRIPTIONS.clientAdmin;
  const statusInfo = statusDescriptions[editor.status] ?? statusDescriptions.Active;

  function commitPortalData(nextData) {
    const savedData = savePortalData(nextData);
    setPortalData(savedData);
    return savedData;
  }

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  function handleSelectUser(nextUserId) {
    const nextUser = users.find((portalUser) => portalUser.id === nextUserId);
    if (!nextUser) return;
    setMode('edit');
    setSelectedUserId(nextUser.id);
    setEditor(createEditorState(nextUser, websites));
    setNotice('');
  }

  function handleCreateMode() {
    setMode('create');
    setSelectedUserId('');
    setEditor(createBlankUserState(websites));
    setNotice('Create a new portal login, assign their role, set their password, and choose every website they can access.');
  }

  function updateEditor(field, value) {
    setEditor((current) => ({ ...current, [field]: value }));
  }

  function toggleWebsiteAccess(websiteId) {
    setEditor((current) => {
      const hasWebsite = current.websiteIds.includes(websiteId);
      const websiteIds = hasWebsite ? current.websiteIds.filter((id) => id !== websiteId) : [...current.websiteIds, websiteId];
      return { ...current, websiteIds };
    });
  }

  async function handleSaveUser() {
    const cleanName = editor.name.trim();
    const cleanEmail = editor.email.trim().toLowerCase();
    const hasNewPassword = Boolean(editor.password || editor.confirmPassword);

    if (!cleanName || !cleanEmail) return setNotice('Name and email are required before saving.');
    if (editor.websiteIds.length === 0) return setNotice('Assign at least one website before saving this user.');
    if (mode === 'create' && !hasNewPassword) return setNotice('A password is required for new portal users.');
    if (hasNewPassword && editor.password !== editor.confirmPassword) return setNotice('Passwords do not match.');
    if (hasNewPassword && !passwordIsValid(editor.password)) return setNotice('Password must be at least 8 characters long.');

    const passwordFields = hasNewPassword
      ? { passwordHash: await hashPortalPassword(editor.password), passwordUpdatedAt: 'Just now' }
      : {};

    if (mode === 'create') {
      if (users.some((portalUser) => portalUser.email.toLowerCase() === cleanEmail)) return setNotice('A user with this email already exists.');
      const newUser = {
        id: createUserId(cleanEmail),
        name: cleanName,
        email: cleanEmail,
        role: editor.role,
        status: editor.status,
        websiteIds: editor.websiteIds,
        lastLogin: 'Never',
        ...passwordFields,
      };
      commitPortalData({ ...portalData, users: [...users, newUser], websites: syncWebsiteUserAccess(websites, newUser.id, newUser.websiteIds) });
      setSelectedUserId(newUser.id);
      setEditor(createEditorState(newUser, websites));
      setMode('edit');
      return setNotice('User saved with password login enabled.');
    }

    const nextUsers = users.map((portalUser) => portalUser.id === editor.id ? {
      ...portalUser,
      name: cleanName,
      email: cleanEmail,
      role: editor.role,
      status: editor.status,
      websiteIds: editor.websiteIds,
      ...passwordFields,
    } : portalUser);
    commitPortalData({ ...portalData, users: nextUsers, websites: syncWebsiteUserAccess(websites, editor.id, editor.websiteIds) });
    setEditor((current) => ({ ...current, password: '', confirmPassword: '' }));
    setNotice(hasNewPassword ? 'User changes saved and password updated.' : 'User changes saved to the central portal store.');
  }

  function handleToggleStatus() {
    const nextStatus = editor.status === 'Active' ? 'Paused' : 'Active';
    updateEditor('status', nextStatus);
    setNotice(`${nextStatus} selected. Save user to persist this change.`);
  }

  function handleRemoveUser() {
    if (mode === 'create') return setNotice('Nothing to remove yet. This user has not been created.');
    if (editor.role === 'owner') return setNotice('Owner accounts are protected.');
    const nextUsers = users.filter((portalUser) => portalUser.id !== editor.id);
    const nextWebsites = websites.map((website) => ({ ...website, assignedUserIds: website.assignedUserIds?.filter((id) => id !== editor.id) ?? [] }));
    const fallbackUser = nextUsers[0];
    commitPortalData({ ...portalData, users: nextUsers, websites: nextWebsites });
    setSelectedUserId(fallbackUser?.id ?? '');
    setEditor(fallbackUser ? createEditorState(fallbackUser, websites) : createBlankUserState(websites));
    setMode('edit');
    setNotice('User removed from the central portal store.');
  }

  function handleResetEditor() {
    if (mode === 'create') {
      setEditor(createBlankUserState(websites));
      return setNotice('Create form reset.');
    }
    if (!selectedUser) return;
    setEditor(createEditorState(selectedUser, websites));
    setNotice('Changes reset for the selected user.');
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Client management">
        <PortalSidebar title="Management" section="admin" />

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Client Management</p>
              <h2>Clients & Portal Access</h2>
              <p className="portal-role-line">Create real email/password logins, assign websites, and manage portal access.</p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-admin-stats">
            <article className="portal-help-card"><p className="eyebrow">Users</p><h3>{users.length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Active</p><h3>{users.filter((item) => item.status === 'Active').length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Paused</p><h3>{users.filter((item) => item.status === 'Paused').length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Password Set</p><h3>{users.filter((item) => item.passwordHash).length}</h3></article>
          </div>

          <div className="portal-grid-two">
            <section className="portal-editor-panel portal-client-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">{mode === 'create' ? 'Create User' : 'Edit User'}</p>
                  <h2>{mode === 'create' ? 'Create Client Login' : selectedUser?.name}</h2>
                  <p>{mode === 'create' ? 'Create a new client/staff login with a real password.' : 'Edit role, email, password, and website access for the selected portal user.'}</p>
                </div>
                <button className="portal-logout-button" type="button" onClick={handleCreateMode}>Create New</button>
              </div>

              <div className="portal-admin-form portal-client-management-form">
                <label>Select User<select value={selectedUserId} onChange={(event) => handleSelectUser(event.target.value)} disabled={mode === 'create'}>{users.map((portalUser) => <option value={portalUser.id} key={portalUser.id}>{portalUser.name}</option>)}</select></label>
                <label>Name<input value={editor.name} placeholder="Client name" onChange={(event) => updateEditor('name', event.target.value)} /></label>
                <label>Email<input value={editor.email} placeholder="client@example.com" onChange={(event) => updateEditor('email', event.target.value)} /></label>
                <label>Role<select value={editor.role} onChange={(event) => updateEditor('role', event.target.value)}>{Object.entries(PORTAL_ROLE_DESCRIPTIONS).map(([roleId, role]) => <option value={roleId} key={roleId}>{role.label}</option>)}</select></label>
                <label>{mode === 'create' ? 'Password' : 'New Password'}<input type="password" value={editor.password} placeholder={mode === 'create' ? 'Set initial password' : 'Leave blank to keep current password'} onChange={(event) => updateEditor('password', event.target.value)} /></label>
                <label>Confirm Password<input type="password" value={editor.confirmPassword} placeholder="Confirm password" onChange={(event) => updateEditor('confirmPassword', event.target.value)} /></label>
                <div className="portal-websites-dropdown portal-full-width-field">
                  <span>Assigned Websites</span>
                  <details>
                    <summary>{getWebsiteSummary(editor.websiteIds, websites)}</summary>
                    <div className="portal-websites-menu">
                      {websites.map((website) => <label key={website.id}><input type="checkbox" checked={editor.websiteIds.includes(website.id)} onChange={() => toggleWebsiteAccess(website.id)} /><span>{website.name}</span></label>)}
                    </div>
                  </details>
                </div>
                <div className="portal-action-row portal-action-row-primary"><button type="button" onClick={handleSaveUser}>{mode === 'create' ? 'Create User' : 'Save User'}</button><button type="button" onClick={handleResetEditor} className="portal-secondary-button">Reset</button></div>
                <div className="portal-action-row portal-action-row-danger"><button type="button" onClick={handleToggleStatus} className="portal-warning-button">{editor.status === 'Active' ? 'Pause User' : 'Activate User'}</button><button type="button" onClick={handleRemoveUser} className="portal-danger-button">Remove User</button></div>
              </div>

              {notice && <p className="portal-inline-notice">{notice}</p>}
            </section>

            <section className="portal-help-card portal-selection-guide">
              <p className="eyebrow">Selection Details</p><h3>{roleInfo.title}</h3><p>{roleInfo.text}</p>
              <div className="portal-detail-group"><strong>Permissions</strong>{roleInfo.permissions.map((permission) => <small key={permission}>✓ {permission}</small>)}</div>
              <div className="portal-detail-group"><strong>Status: {editor.status}</strong><small>{statusInfo}</small></div>
              <div className="portal-detail-group"><strong>{mode === 'create' ? 'New User Preview' : 'Selected User'}</strong><small>Name: {editor.name || 'Not set'}</small><small>Email: {editor.email || 'Not set'}</small><small>Role: {formatPortalRole(editor.role)}</small><small>{getWebsiteCountText(editor.websiteIds)}</small><small>Password: {selectedUser?.passwordHash ? 'Set' : 'Temporary/Not Set'}</small></div>
            </section>
          </div>

          <section className="portal-editor-panel">
            <div className="portal-editor-header"><div><p className="eyebrow">Client Access</p><h2>Manage Logins</h2><p>View, edit, or remove portal users from one management page.</p></div></div>
            <div className="portal-admin-table">
              <div className="portal-admin-table-head"><span>Name</span><span>Email</span><span>Role</span><span>Status</span><span>Access</span><span>Password</span></div>
              {users.map((portalUser) => <div className="portal-admin-table-row" key={portalUser.id}><span>{portalUser.name}</span><span>{portalUser.email}</span><span>{formatPortalRole(portalUser.role)}</span><span>{portalUser.status}</span><span>{getWebsiteSummary(portalUser.websiteIds ?? [], websites)}</span><button type="button" onClick={() => handleSelectUser(portalUser.id)}>{portalUser.passwordHash ? 'Edit' : 'Set Password'}</button></div>)}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
