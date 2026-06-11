import { useMemo, useState } from 'react';

import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { portalUsers } from '../portals/data/users';
import { portalWebsites } from '../portals/data/websites';

const roleDescriptions = {
  owner: {
    title: 'Owner Access',
    text: 'Full KSJ Digital management access. Can view the client dashboard, access the Management Panel, manage users, assign websites, and review publishing workflows.',
  },
  staff: {
    title: 'Staff Access',
    text: 'Internal support access for KSJ Digital team members. Intended for helping manage client content, support requests, and website tasks without full owner control.',
  },
  client: {
    title: 'Client Access',
    text: 'Client-only access. Can view assigned websites, edit allowed content, save drafts, request publishing, and contact support. Cannot access Management Panel tools.',
  },
};

const statusDescriptions = {
  Active: 'User can sign in and access the areas allowed by their role and assigned website.',
  Disabled: 'User should be blocked from portal access until the account is re-enabled.',
};

function getWebsiteNames(websiteIds) {
  return websiteIds
    .map((id) => portalWebsites.find((website) => website.id === id)?.name)
    .filter(Boolean)
    .join(', ');
}

function createEditorState(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    websiteId: user.websiteIds[0] ?? portalWebsites[0]?.id ?? '',
  };
}

export default function PortalsAdminUsers() {
  const session = getStoredSession();
  const user = session?.user ?? portalUsers[0];
  const [users, setUsers] = useState(portalUsers);
  const [selectedUserId, setSelectedUserId] = useState(portalUsers[0]?.id ?? '');
  const [notice, setNotice] = useState('');

  const selectedUser = useMemo(
    () => users.find((portalUser) => portalUser.id === selectedUserId) ?? users[0],
    [selectedUserId, users],
  );

  const [editor, setEditor] = useState(() => createEditorState(portalUsers[0]));

  const selectedWebsite = useMemo(
    () => portalWebsites.find((website) => website.id === editor.websiteId) ?? portalWebsites[0],
    [editor.websiteId],
  );

  const roleInfo = roleDescriptions[editor.role] ?? roleDescriptions.client;
  const statusInfo = statusDescriptions[editor.status] ?? statusDescriptions.Active;

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  function handleSelectUser(nextUserId) {
    const nextUser = users.find((portalUser) => portalUser.id === nextUserId);
    if (!nextUser) return;

    setSelectedUserId(nextUser.id);
    setEditor(createEditorState(nextUser));
    setNotice('');
  }

  function updateEditor(field, value) {
    setEditor((current) => ({ ...current, [field]: value }));
  }

  function handleSaveUser() {
    const cleanName = editor.name.trim();
    const cleanEmail = editor.email.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      setNotice('Name and email are required before saving changes.');
      return;
    }

    const updatedUsers = users.map((portalUser) => {
      if (portalUser.id !== editor.id) return portalUser;

      return {
        ...portalUser,
        name: cleanName,
        email: cleanEmail,
        role: editor.role,
        status: editor.status,
        websiteIds: editor.websiteId ? [editor.websiteId] : [],
      };
    });

    setUsers(updatedUsers);
    setNotice('User updated in this admin session. Backend persistence is the next build step.');
  }

  function handleToggleStatus() {
    const nextStatus = editor.status === 'Active' ? 'Disabled' : 'Active';
    updateEditor('status', nextStatus);
  }

  function handleResetEditor() {
    if (!selectedUser) return;
    setEditor(createEditorState(selectedUser));
    setNotice('Changes reset for the selected user.');
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal users management">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Admin</span>
          <nav>
            <a href="/portals/admin">Admin Home</a>
            <a href="/portals/admin/users" className="active">Users</a>
            <a href="/portals/admin/websites">Websites</a>
            <a href="/portals/admin/publish-requests">Publish Requests</a>
            <a href="/portals/dashboard">Client View</a>
            <a href="/portals/admin/settings">Settings</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">User Management</p>
              <h2>Portal Users</h2>
              <p className="portal-role-line">Signed in as <strong>{user.name}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-grid-two">
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">Edit User</p>
                  <h2>{selectedUser?.name ?? 'Select User'}</h2>
                  <p>Edit role, status, email, and website access for the selected portal user.</p>
                </div>
              </div>

              <div className="portal-admin-form">
                <label>
                  Select User
                  <select value={selectedUserId} onChange={(event) => handleSelectUser(event.target.value)}>
                    {users.map((portalUser) => (
                      <option value={portalUser.id} key={portalUser.id}>{portalUser.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={editor.status} onChange={(event) => updateEditor('status', event.target.value)}>
                    <option value="Active">Active</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </label>
                <label>
                  Name
                  <input value={editor.name} onChange={(event) => updateEditor('name', event.target.value)} />
                </label>
                <label>
                  Email
                  <input value={editor.email} onChange={(event) => updateEditor('email', event.target.value)} />
                </label>
                <label>
                  Role
                  <select value={editor.role} onChange={(event) => updateEditor('role', event.target.value)}>
                    <option value="owner">Owner</option>
                    <option value="staff">Staff</option>
                    <option value="client">Client</option>
                  </select>
                </label>
                <label>
                  Assigned Website
                  <select value={editor.websiteId} onChange={(event) => updateEditor('websiteId', event.target.value)}>
                    {portalWebsites.map((website) => (
                      <option value={website.id} key={website.id}>{website.name}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={handleSaveUser}>Save User</button>
                <button type="button" onClick={handleToggleStatus} className="portal-secondary-button">
                  {editor.status === 'Active' ? 'Disable User' : 'Enable User'}
                </button>
                <button type="button" onClick={handleResetEditor} className="portal-secondary-button">Reset Changes</button>
              </div>

              {notice && <p className="portal-inline-notice">{notice}</p>}
            </section>

            <section className="portal-help-card portal-selection-guide">
              <p className="eyebrow">Selection Details</p>
              <h3>{roleInfo.title}</h3>
              <p>{roleInfo.text}</p>

              <div className="portal-detail-group">
                <strong>Status: {editor.status}</strong>
                <small>{statusInfo}</small>
              </div>

              <div className="portal-detail-group">
                <strong>Website: {selectedWebsite?.name}</strong>
                <small>{selectedWebsite?.description}</small>
                <small>Domain: {selectedWebsite?.domain}</small>
                <small>Publishing: {selectedWebsite?.publishMode}</small>
              </div>

              <div className="portal-detail-group">
                <strong>Selected User</strong>
                <small>Name: {editor.name}</small>
                <small>Email: {editor.email}</small>
                <small>Assigned Access: {getWebsiteNames(editor.websiteId ? [editor.websiteId] : [])}</small>
              </div>
            </section>
          </div>

          <section className="portal-editor-panel">
            <div className="portal-editor-header">
              <div>
                <p className="eyebrow">Users</p>
                <h2>Manage Client Logins</h2>
                <p>Select a user from the table below or use the editor above.</p>
              </div>
            </div>

            <div className="portal-admin-table">
              <div className="portal-admin-table-head">
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Status</span>
                <span>Websites</span>
                <span>Actions</span>
              </div>
              {users.map((portalUser) => (
                <div className="portal-admin-table-row" key={portalUser.id}>
                  <span>{portalUser.name}</span>
                  <span>{portalUser.email}</span>
                  <span>{portalUser.role}</span>
                  <span>{portalUser.status}</span>
                  <span>{getWebsiteNames(portalUser.websiteIds)}</span>
                  <span>
                    <button type="button" onClick={() => handleSelectUser(portalUser.id)}>Edit</button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
