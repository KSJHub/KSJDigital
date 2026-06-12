import { useMemo, useState } from 'react';

import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { portalUsers } from '../portals/data/users';
import { portalWebsites } from '../portals/data/websites';

const roleDescriptions = {
  owner: {
    label: 'Owner',
    title: 'Owner Access',
    text: 'Highest KSJ Digital access. Can manage every client, user, website, support request, publish request, permission, and portal setting.',
    permissions: ['All websites', 'All users', 'All requests', 'All settings', 'Full management access'],
  },
  websiteManager: {
    label: 'Website Manager',
    title: 'Website Manager Access',
    text: 'Internal KSJ staff role for helping clients with assigned websites. Can make small content edits, image updates, and draft changes on assigned sites only.',
    permissions: ['Assigned websites only', 'Content edits', 'Image changes', 'Draft support', 'No user management'],
  },
  supportAgent: {
    label: 'Support Agent',
    title: 'Support Agent Access',
    text: 'Support-only staff role. Can read, write, and respond to portal requests, support tickets, and client messages without editing website content.',
    permissions: ['Support inbox', 'Tickets', 'Client messages', 'Request replies', 'No website editing'],
  },
  clientAdmin: {
    label: 'Client Administrator',
    title: 'Client Administrator Access',
    text: 'Highest client role. Can edit allowed website content such as text and images, create drafts, upload media, and submit publish/support requests.',
    permissions: ['Assigned websites', 'Text edits', 'Image edits', 'Drafts', 'Publish requests'],
  },
  contentEditor: {
    label: 'Content Editor',
    title: 'Content Editor Access',
    text: 'Limited client role for simple content work. Can upload images, adjust basic text, manage prices/products when enabled, and save drafts for review.',
    permissions: ['Basic content edits', 'Image uploads', 'Price/product updates', 'Draft only', 'No publishing'],
  },
  viewer: {
    label: 'Viewer',
    title: 'Viewer Access',
    text: 'Read-only role. Can view assigned portal areas, website information, drafts, and requests, but cannot make changes.',
    permissions: ['Read only', 'Assigned websites', 'View drafts', 'View requests', 'No edits'],
  },
};

const statusDescriptions = {
  Active: 'The user can access the portal according to their role and assigned website permissions.',
  Disabled: 'The user is blocked from portal access until their account is re-enabled.',
};

function formatRole(role) {
  return roleDescriptions[role]?.label ?? 'Client Administrator';
}

function getWebsiteCountText(websiteIds) {
  const count = websiteIds?.length ?? 0;
  return `${count} Assigned Website${count === 1 ? '' : 's'}`;
}

function createEditorState(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === 'staff' ? 'websiteManager' : user.role === 'client' ? 'clientAdmin' : user.role,
    status: user.status,
    websiteIds: user.websiteIds?.length ? user.websiteIds : [portalWebsites[0]?.id].filter(Boolean),
  };
}

function createBlankUserState() {
  return {
    id: '',
    name: '',
    email: '',
    role: 'clientAdmin',
    status: 'Active',
    websiteIds: [portalWebsites[0]?.id].filter(Boolean),
  };
}

function createUserId(email) {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `client-${Date.now()}`;
}

export default function PortalsAdminUsers() {
  const session = getStoredSession();
  const user = session?.user ?? portalUsers[0];
  const [users, setUsers] = useState(portalUsers.map((portalUser) => ({
    ...portalUser,
    role: portalUser.role === 'staff' ? 'websiteManager' : portalUser.role === 'client' ? 'clientAdmin' : portalUser.role,
  })));
  const [mode, setMode] = useState('edit');
  const [selectedUserId, setSelectedUserId] = useState(portalUsers[0]?.id ?? '');
  const [editor, setEditor] = useState(() => createEditorState(portalUsers[0]));
  const [notice, setNotice] = useState('');

  const selectedUser = useMemo(
    () => users.find((portalUser) => portalUser.id === selectedUserId) ?? users[0],
    [selectedUserId, users],
  );

  const roleInfo = roleDescriptions[editor.role] ?? roleDescriptions.clientAdmin;
  const statusInfo = statusDescriptions[editor.status] ?? statusDescriptions.Active;

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  function handleSelectUser(nextUserId) {
    const nextUser = users.find((portalUser) => portalUser.id === nextUserId);
    if (!nextUser) return;

    setMode('edit');
    setSelectedUserId(nextUser.id);
    setEditor(createEditorState(nextUser));
    setNotice('');
  }

  function handleCreateMode() {
    setMode('create');
    setSelectedUserId('');
    setEditor(createBlankUserState());
    setNotice('Create a new portal login, assign their role, and choose every website they can access.');
  }

  function updateEditor(field, value) {
    setEditor((current) => ({ ...current, [field]: value }));
  }

  function toggleWebsiteAccess(websiteId) {
    setEditor((current) => {
      const hasWebsite = current.websiteIds.includes(websiteId);
      const nextWebsiteIds = hasWebsite
        ? current.websiteIds.filter((id) => id !== websiteId)
        : [...current.websiteIds, websiteId];

      return {
        ...current,
        websiteIds: nextWebsiteIds,
      };
    });
  }

  function handleSaveUser() {
    const cleanName = editor.name.trim();
    const cleanEmail = editor.email.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      setNotice('Name and email are required before saving.');
      return;
    }

    if (editor.websiteIds.length === 0) {
      setNotice('Assign at least one website before saving this user.');
      return;
    }

    if (mode === 'create') {
      if (users.some((portalUser) => portalUser.email.toLowerCase() === cleanEmail)) {
        setNotice('A user with this email already exists. Select that user from the table to edit them.');
        return;
      }

      const newUser = {
        id: createUserId(cleanEmail),
        name: cleanName,
        email: cleanEmail,
        role: editor.role,
        status: editor.status,
        websiteIds: editor.websiteIds,
        lastLogin: 'Invite pending',
      };

      setUsers((current) => [...current, newUser]);
      setSelectedUserId(newUser.id);
      setEditor(createEditorState(newUser));
      setMode('edit');
      setNotice('User created for this session.');
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
        websiteIds: editor.websiteIds,
      };
    });

    setUsers(updatedUsers);
    setNotice('User changes saved for this session.');
  }

  function handleToggleStatus() {
    const nextStatus = editor.status === 'Active' ? 'Disabled' : 'Active';
    updateEditor('status', nextStatus);
    setNotice(nextStatus === 'Disabled' ? 'User marked as disabled for this session.' : 'User marked as active for this session.');
  }

  function handleDeleteUser() {
    if (mode === 'create') {
      setNotice('Nothing to delete yet. This user has not been created.');
      return;
    }

    if (editor.role === 'owner') {
      setNotice('Owner accounts cannot be deleted from this interface.');
      return;
    }

    const nextUsers = users.filter((portalUser) => portalUser.id !== editor.id);
    const fallbackUser = nextUsers[0] ?? portalUsers[0];

    setUsers(nextUsers);
    setSelectedUserId(fallbackUser.id);
    setEditor(createEditorState(fallbackUser));
    setMode('edit');
    setNotice('User removed for this session.');
  }

  function handleResetEditor() {
    if (mode === 'create') {
      setEditor(createBlankUserState());
      setNotice('Create form reset.');
      return;
    }

    if (!selectedUser) return;
    setEditor(createEditorState(selectedUser));
    setNotice('Changes reset for the selected user.');
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Client management">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Management</span>
          <nav>
            <a href="/portals/admin" className="active">Client Management</a>
            <a href="/portals/admin/websites">Websites</a>
            <a href="/portals/admin/publish-requests">Publish Requests</a>
            <a href="/portals/dashboard">Client View</a>
            <a href="/portals/admin/settings">Settings</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Client Management</p>
              <h2>Clients & Portal Access</h2>
              <p className="portal-role-line">Create logins, edit users, assign multiple websites, disable access, and manage client permissions.</p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-admin-stats">
            <article className="portal-help-card"><p className="eyebrow">Users</p><h3>{users.length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Active</p><h3>{users.filter((item) => item.status === 'Active').length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Disabled</p><h3>{users.filter((item) => item.status === 'Disabled').length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Websites</p><h3>{portalWebsites.length}</h3></article>
          </div>

          <div className="portal-grid-two">
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">{mode === 'create' ? 'Create User' : 'Edit User'}</p>
                  <h2>{mode === 'create' ? 'Create Client Login' : selectedUser?.name}</h2>
                  <p>{mode === 'create' ? 'Create a new client/staff login and assign their website access.' : 'Edit role, email, and website access for the selected portal user.'}</p>
                </div>
                <button className="portal-logout-button" type="button" onClick={handleCreateMode}>Create New</button>
              </div>

              <div className="portal-admin-form">
                <label>
                  Select User
                  <select value={selectedUserId} onChange={(event) => handleSelectUser(event.target.value)} disabled={mode === 'create'}>
                    {users.map((portalUser) => (
                      <option value={portalUser.id} key={portalUser.id}>{portalUser.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Name
                  <input value={editor.name} placeholder="Client name" onChange={(event) => updateEditor('name', event.target.value)} />
                </label>
                <label>
                  Email
                  <input value={editor.email} placeholder="client@example.com" onChange={(event) => updateEditor('email', event.target.value)} />
                </label>
                <label>
                  Role
                  <select value={editor.role} onChange={(event) => updateEditor('role', event.target.value)}>
                    {Object.entries(roleDescriptions).map(([roleId, role]) => (
                      <option value={roleId} key={roleId}>{role.label}</option>
                    ))}
                  </select>
                </label>
                <div className="portal-websites-dropdown">
                  <span>Assigned Websites</span>
                  <details>
                    <summary>{getWebsiteCountText(editor.websiteIds)}</summary>
                    <div className="portal-websites-menu">
                      {portalWebsites.map((website) => (
                        <label key={website.id}>
                          <input
                            type="checkbox"
                            checked={editor.websiteIds.includes(website.id)}
                            onChange={() => toggleWebsiteAccess(website.id)}
                          />
                          <span>{website.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
                <button type="button" onClick={handleSaveUser}>{mode === 'create' ? 'Create User' : 'Save User'}</button>
                <button type="button" onClick={handleToggleStatus} className="portal-secondary-button">
                  {editor.status === 'Active' ? 'Disable User' : 'Enable User'}
                </button>
                <button type="button" onClick={handleResetEditor} className="portal-secondary-button">Reset</button>
                <button type="button" onClick={handleDeleteUser} className="portal-danger-button">Delete User</button>
              </div>

              {notice && <p className="portal-inline-notice">{notice}</p>}
            </section>

            <section className="portal-help-card portal-selection-guide">
              <p className="eyebrow">Selection Details</p>
              <h3>{roleInfo.title}</h3>
              <p>{roleInfo.text}</p>

              <div className="portal-detail-group">
                <strong>Permissions</strong>
                {roleInfo.permissions.map((permission) => <small key={permission}>✓ {permission}</small>)}
              </div>

              <div className="portal-detail-group">
                <strong>Status: {editor.status}</strong>
                <small>{statusInfo}</small>
              </div>

              <div className="portal-detail-group">
                <strong>{mode === 'create' ? 'New User Preview' : 'Selected User'}</strong>
                <small>Name: {editor.name || 'Not set'}</small>
                <small>Email: {editor.email || 'Not set'}</small>
                <small>Role: {formatRole(editor.role)}</small>
                <small>{getWebsiteCountText(editor.websiteIds)}</small>
              </div>
            </section>
          </div>

          <section className="portal-editor-panel">
            <div className="portal-editor-header">
              <div>
                <p className="eyebrow">Client Access</p>
                <h2>Manage Logins</h2>
                <p>View, edit, disable, or delete portal users from one management page.</p>
              </div>
            </div>

            <div className="portal-admin-table">
              <div className="portal-admin-table-head">
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Status</span>
                <span>Access</span>
                <span>Actions</span>
              </div>
              {users.map((portalUser) => (
                <div className="portal-admin-table-row" key={portalUser.id}>
                  <span>{portalUser.name}</span>
                  <span>{portalUser.email}</span>
                  <span>{formatRole(portalUser.role)}</span>
                  <span>{portalUser.status}</span>
                  <span>{getWebsiteCountText(portalUser.websiteIds)}</span>
                  <span>
                    <button type="button" onClick={() => handleSelectUser(portalUser.id)}>Manage</button>
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
