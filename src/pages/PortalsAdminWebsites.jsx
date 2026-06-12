import { useMemo, useState } from 'react';
import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { getPortalData, savePortalData } from '../portals/data/portalManager';

const emptyWebsiteForm = {
  name: '',
  type: 'Managed Website',
  domain: '',
  hostingStatus: 'Live',
  portalStatus: 'Active',
  access: 'Website Management',
  publishMode: 'Approval Required',
  plan: 'Managed Website',
  ownerUserId: '',
  description: '',
  assignedUserIds: [],
};

function createWebsiteId(name) {
  const safeName = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return safeName || `website-${Date.now()}`;
}

function getHostingStatus(website) {
  return website.hostingStatus ?? website.status ?? 'Live';
}

function getPortalStatus(website) {
  return website.portalStatus ?? 'Active';
}

function formatStorage(website) {
  const used = website.storageUsedMb ?? 0;
  const limit = website.storageLimitMb ?? 0;
  if (!limit) return `${used} MB used`;
  return `${used} MB / ${limit} MB`;
}

function getStoragePercent(website) {
  const used = website.storageUsedMb ?? 0;
  const limit = website.storageLimitMb ?? 0;
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function getOwnerName(website, users) {
  return users.find((portalUser) => portalUser.id === website.ownerUserId)?.name ?? 'Unassigned';
}

export default function PortalsAdminWebsites() {
  const session = getStoredSession();
  const user = session?.user;
  const initialPortalData = getPortalData();

  const [portalData, setPortalData] = useState(initialPortalData);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState(initialPortalData.websites[0]?.id ?? null);
  const [mode, setMode] = useState('view');
  const [form, setForm] = useState(emptyWebsiteForm);

  const websites = portalData.websites ?? [];
  const portalUsers = portalData.users ?? [];

  const selectedWebsite = useMemo(
    () => websites.find((website) => website.id === selectedWebsiteId) ?? null,
    [selectedWebsiteId, websites],
  );

  const selectedAssignedUsers = selectedWebsite
    ? portalUsers.filter((portalUser) => selectedWebsite.assignedUserIds?.includes(portalUser.id))
    : [];

  function commitPortalData(nextData) {
    const savedData = savePortalData(nextData);
    setPortalData(savedData);
    return savedData;
  }

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  function startCreate() {
    setMode('create');
    setSelectedWebsiteId(null);
    setForm({ ...emptyWebsiteForm, ownerUserId: portalUsers[0]?.id ?? '' });
  }

  function startEdit(website) {
    setMode('edit');
    setSelectedWebsiteId(website.id);
    setForm({
      name: website.name ?? '',
      type: website.type ?? 'Managed Website',
      domain: website.domain ?? '',
      hostingStatus: getHostingStatus(website),
      portalStatus: getPortalStatus(website),
      access: website.access ?? 'Website Management',
      publishMode: website.publishMode ?? 'Approval Required',
      plan: website.plan ?? 'Managed Website',
      ownerUserId: website.ownerUserId ?? website.assignedUserIds?.[0] ?? '',
      description: website.description ?? '',
      assignedUserIds: website.assignedUserIds ?? [],
    });
  }

  function cancelForm() {
    setMode('view');
    setForm(emptyWebsiteForm);
    setSelectedWebsiteId(websites[0]?.id ?? null);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleAssignedUser(userId) {
    setForm((current) => {
      const currentIds = current.assignedUserIds ?? [];
      const assignedUserIds = currentIds.includes(userId) ? currentIds.filter((id) => id !== userId) : [...currentIds, userId];
      return { ...current, assignedUserIds };
    });
  }

  function syncUserWebsiteAccess(users, websiteId, assignedUserIds) {
    return users.map((portalUser) => {
      const websiteIds = portalUser.websiteIds ?? [];
      const shouldHaveAccess = assignedUserIds.includes(portalUser.id);
      const alreadyHasAccess = websiteIds.includes(websiteId);
      if (shouldHaveAccess && !alreadyHasAccess) return { ...portalUser, websiteIds: [...websiteIds, websiteId] };
      if (!shouldHaveAccess && alreadyHasAccess) return { ...portalUser, websiteIds: websiteIds.filter((id) => id !== websiteId) };
      return portalUser;
    });
  }

  function saveWebsite(event) {
    event.preventDefault();
    const cleanedName = form.name.trim();
    const cleanedDomain = form.domain.trim();
    if (!cleanedName || !cleanedDomain) return;

    const assignedUserIds = Array.from(new Set([...(form.assignedUserIds ?? []), form.ownerUserId].filter(Boolean)));

    if (mode === 'create') {
      const baseId = createWebsiteId(cleanedName);
      const id = websites.some((website) => website.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
      const newWebsite = {
        id,
        ...form,
        assignedUserIds,
        name: cleanedName,
        domain: cleanedDomain,
        status: form.hostingStatus,
        url: cleanedDomain.startsWith('http') ? cleanedDomain : `https://${cleanedDomain}/`,
        storageUsedMb: 0,
        storageLimitMb: 2048,
        analytics: { monthlyViews: 0, monthlyVisitors: 0, lastChecked: 'Not connected yet' },
        backup: { status: 'No active backup', expiresAt: '', lastCreatedAt: '' },
        lastPublish: 'Not published through portal yet',
        lastEditor: user?.name ?? 'KSJ Digital Admin',
      };

      commitPortalData({
        ...portalData,
        websites: [...websites, newWebsite],
        users: syncUserWebsiteAccess(portalUsers, id, assignedUserIds),
      });
      setSelectedWebsiteId(id);
      setMode('view');
      setForm(emptyWebsiteForm);
      return;
    }

    const nextWebsites = websites.map((website) => {
      if (website.id !== selectedWebsiteId) return website;
      return {
        ...website,
        ...form,
        assignedUserIds,
        name: cleanedName,
        domain: cleanedDomain,
        status: form.hostingStatus,
        url: cleanedDomain.startsWith('http') ? cleanedDomain : `https://${cleanedDomain}/`,
      };
    });

    commitPortalData({ ...portalData, websites: nextWebsites, users: syncUserWebsiteAccess(portalUsers, selectedWebsiteId, assignedUserIds) });
    setMode('view');
    setForm(emptyWebsiteForm);
  }

  function setWebsiteHostingStatus(websiteId, hostingStatus) {
    commitPortalData({
      ...portalData,
      websites: websites.map((website) => (website.id === websiteId ? { ...website, hostingStatus, status: hostingStatus } : website)),
    });
  }

  function setWebsitePortalStatus(websiteId, portalStatus) {
    commitPortalData({
      ...portalData,
      websites: websites.map((website) => (website.id === websiteId ? { ...website, portalStatus } : website)),
    });
  }

  function removeWebsite(websiteId) {
    const website = websites.find((item) => item.id === websiteId);
    const confirmed = window.confirm(`Remove ${website?.name ?? 'this website'} from the portal list? This updates the central portal JSON demo store.`);
    if (!confirmed) return;

    const remainingWebsites = websites.filter((item) => item.id !== websiteId);
    const nextUsers = portalUsers.map((portalUser) => ({ ...portalUser, websiteIds: portalUser.websiteIds?.filter((id) => id !== websiteId) ?? [] }));
    commitPortalData({ ...portalData, websites: remainingWebsites, users: nextUsers });
    setSelectedWebsiteId(remainingWebsites[0]?.id ?? null);
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal websites management">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Management</span>
          <nav>
            <a href="/portals/admin">Client Management</a>
            <a href="/portals/admin/websites" className="active">Websites</a>
            <a href="/portals/admin/publish-requests">Publish Requests</a>
            <a href="/portals/dashboard">Client View</a>
            <a href="/portals/admin/settings">Settings</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Website Management</p>
              <h2>Client Websites</h2>
              <p className="portal-role-line">Signed in as <strong>{user?.name ?? 'KSJ Digital Admin'}</strong></p>
            </div>
            <div className="portal-header-actions">
              <button className="portal-logout-button" type="button" onClick={startCreate}>Create Website</button>
              <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
            </div>
          </header>

          {(mode === 'create' || mode === 'edit') && (
            <form className="portal-management-card" onSubmit={saveWebsite}>
              <div className="portal-section-title-row"><strong>{mode === 'create' ? 'Create Website' : `Edit ${selectedWebsite?.name ?? 'Website'}`}</strong><span>{mode === 'create' ? 'New Website' : 'Editing'}</span></div>

              <div className="portal-form-grid">
                <label>Website Name<input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="TwoToneTaj" required /></label>
                <label>Domain<input value={form.domain} onChange={(event) => updateForm('domain', event.target.value)} placeholder="example.ksjdigital.co.uk" required /></label>
                <label>Website Type<input value={form.type} onChange={(event) => updateForm('type', event.target.value)} placeholder="Creator Website" /></label>
                <label>Plan<input value={form.plan} onChange={(event) => updateForm('plan', event.target.value)} placeholder="Managed Website" /></label>
                <label>Owner<select value={form.ownerUserId} onChange={(event) => updateForm('ownerUserId', event.target.value)}>{portalUsers.map((portalUser) => <option key={portalUser.id} value={portalUser.id}>{portalUser.name}</option>)}</select></label>
                <label>Hosting Status<select value={form.hostingStatus} onChange={(event) => updateForm('hostingStatus', event.target.value)}><option>Live</option><option>Maintenance</option><option>Offline</option></select></label>
                <label>Portal Access<select value={form.portalStatus} onChange={(event) => updateForm('portalStatus', event.target.value)}><option>Active</option><option>Suspended</option><option>Archived</option></select></label>
                <label>Publish Mode<select value={form.publishMode} onChange={(event) => updateForm('publishMode', event.target.value)}><option>Approval Required</option><option>Owner Controlled</option><option>Direct Publish</option></select></label>
              </div>

              <label className="portal-full-field">Description<textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} rows="3" placeholder="Short internal website description" /></label>

              <div className="portal-management-card compact">
                <div className="portal-section-title-row"><strong>Website Access</strong><span>{form.assignedUserIds.length} Assigned</span></div>
                <div className="portal-checkbox-list">
                  {portalUsers.map((portalUser) => <label key={portalUser.id}><input type="checkbox" checked={form.assignedUserIds.includes(portalUser.id)} onChange={() => toggleAssignedUser(portalUser.id)} /><span>{portalUser.name} - {portalUser.role}</span></label>)}
                </div>
              </div>

              <div className="portal-inline-actions"><button type="submit">{mode === 'create' ? 'Create Website' : 'Save Changes'}</button><button type="button" onClick={cancelForm}>Cancel</button></div>
            </form>
          )}

          <div className="portal-section-list">
            {websites.map((website) => {
              const liveAssignedUsers = portalUsers.filter((portalUser) => website.assignedUserIds?.includes(portalUser.id));
              const hostingStatus = getHostingStatus(website);
              const portalStatus = getPortalStatus(website);

              return (
                <article key={website.id}>
                  <div>
                    <div className="portal-section-title-row"><strong>{website.name}</strong><span>{hostingStatus}</span></div>
                    <p>{website.domain}</p>
                    <ul>
                      <li>Owner: {getOwnerName(website, portalUsers)}</li>
                      <li>Portal Access: {portalStatus}</li>
                      <li>Storage: {formatStorage(website)}</li>
                      <li>{liveAssignedUsers.length} Assigned User(s)</li>
                    </ul>
                  </div>
                  <div className="portal-inline-actions">
                    <button type="button" onClick={() => setSelectedWebsiteId(website.id)}>View</button>
                    <button type="button" onClick={() => startEdit(website)}>Edit</button>
                    <button type="button" onClick={() => setWebsiteHostingStatus(website.id, 'Live')}>Go Live</button>
                    <button type="button" onClick={() => setWebsiteHostingStatus(website.id, 'Maintenance')}>Maintenance</button>
                    <button type="button" onClick={() => setWebsiteHostingStatus(website.id, 'Offline')}>Take Offline</button>
                    <button type="button" onClick={() => setWebsitePortalStatus(website.id, portalStatus === 'Active' ? 'Suspended' : 'Active')}>{portalStatus === 'Active' ? 'Suspend Portal' : 'Activate Portal'}</button>
                    <button type="button" onClick={() => removeWebsite(website.id)}>Remove</button>
                  </div>
                </article>
              );
            })}
          </div>

          {selectedWebsite && (
            <aside className="portal-management-card">
              <div className="portal-section-title-row"><strong>{selectedWebsite.name} Details</strong><span>{getHostingStatus(selectedWebsite)}</span></div>
              <p>{selectedWebsite.description}</p>
              <div className="portal-admin-stats">
                <article className="portal-help-card"><p className="eyebrow">Owner</p><h3>{getOwnerName(selectedWebsite, portalUsers)}</h3></article>
                <article className="portal-help-card"><p className="eyebrow">Storage</p><h3>{getStoragePercent(selectedWebsite)}%</h3></article>
                <article className="portal-help-card"><p className="eyebrow">Views</p><h3>{selectedWebsite.analytics?.monthlyViews ?? 0}</h3></article>
                <article className="portal-help-card"><p className="eyebrow">Backup</p><h3>{selectedWebsite.backup?.status ?? 'No active backup'}</h3></article>
              </div>
              <ul>
                <li><strong>Domain:</strong> {selectedWebsite.domain}</li>
                <li><strong>Hosting Status:</strong> {getHostingStatus(selectedWebsite)}</li>
                <li><strong>Portal Access:</strong> {getPortalStatus(selectedWebsite)}</li>
                <li><strong>Publish Mode:</strong> {selectedWebsite.publishMode}</li>
                <li><strong>Storage Usage:</strong> {formatStorage(selectedWebsite)}</li>
                <li><strong>Analytics:</strong> {selectedWebsite.analytics?.monthlyVisitors ?? 0} visitors this month · Last checked: {selectedWebsite.analytics?.lastChecked ?? 'Not connected yet'}</li>
                <li><strong>48 Hour Backup:</strong> {selectedWebsite.backup?.status ?? 'No active backup'}{selectedWebsite.backup?.expiresAt ? ` · Expires ${selectedWebsite.backup.expiresAt}` : ''}</li>
                <li><strong>Last Publish:</strong> {selectedWebsite.lastPublish ?? 'Not published through portal yet'}</li>
                <li><strong>Last Editor:</strong> {selectedWebsite.lastEditor ?? 'Unknown'}</li>
                <li><strong>Assigned Users:</strong> {selectedAssignedUsers.length ? selectedAssignedUsers.map((assignedUser) => assignedUser.name).join(', ') : 'None'}</li>
              </ul>
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}
