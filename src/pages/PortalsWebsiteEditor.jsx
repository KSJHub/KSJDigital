import { useMemo, useState } from 'react';
import PortalSidebar from '../components/PortalSidebar';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { hasPermission, PORTAL_PERMISSIONS } from '../portals/auth/permissions';
import { getContentFilePath } from '../portals/content/contentFileRegistry';
import {
  getPortalData,
  getPortalWebsiteById,
  getWebsiteContentPage,
  getWebsiteSchemaPages,
  saveWebsiteDraftContent,
  submitWebsiteDraftForApproval,
} from '../portals/data/portalManager';

function getWebsiteIdFromRoute() {
  const [, , , websiteId] = window.location.pathname.split('/');
  return websiteId || 'twotonetaj';
}

function getInitialDraftValues(websiteId, pageId, fields) {
  const pageContent = getWebsiteContentPage(websiteId, pageId);
  return fields.reduce((values, field) => ({
    ...values,
    [field.id]: pageContent.draft?.[field.id] ?? pageContent.live?.[field.id] ?? '',
  }), {});
}

export default function PortalsWebsiteEditor() {
  const session = getStoredSession();
  const user = session?.user;
  const actorName = user?.name ?? 'Client';
  const websiteId = getWebsiteIdFromRoute();
  const canEditContent = hasPermission(user, PORTAL_PERMISSIONS.EDIT_CONTENT);
  const canSaveDrafts = hasPermission(user, PORTAL_PERMISSIONS.SAVE_DRAFTS);
  const canRequestPublish = hasPermission(user, PORTAL_PERMISSIONS.REQUEST_PUBLISH);
  const website = getPortalWebsiteById(websiteId);
  const [portalData, setPortalData] = useState(getPortalData());
  const pages = getWebsiteSchemaPages(websiteId);
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? 'homepage');
  const activePage = useMemo(() => pages.find((page) => page.id === activePageId) ?? pages[0], [pages, activePageId]);
  const activePageContent = portalData.content?.[websiteId]?.[activePage?.id] ?? { live: {}, draft: {} };
  const [draftValues, setDraftValues] = useState(() => getInitialDraftValues(websiteId, activePageId, activePage?.fields ?? []));
  const [editorStatus, setEditorStatus] = useState(canEditContent ? 'Ready' : 'Read Only');
  const contentFilePath = activePage ? getContentFilePath(websiteId, activePage.id) : `content/${websiteId}/page.json`;

  function refreshPortalData(nextData = getPortalData()) {
    setPortalData(nextData);
  }

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  function selectPage(pageId) {
    const nextPage = pages.find((page) => page.id === pageId);
    setActivePageId(pageId);
    setDraftValues(getInitialDraftValues(websiteId, pageId, nextPage?.fields ?? []));
    setEditorStatus(canEditContent ? 'Ready' : 'Read Only');
  }

  function updateDraftValue(fieldId, value) {
    if (!canEditContent) return;
    setDraftValues((current) => ({ ...current, [fieldId]: value }));
  }

  function saveDraft() {
    if (!activePage || !canSaveDrafts) return;
    const savedData = saveWebsiteDraftContent(websiteId, activePage.id, draftValues, actorName);
    refreshPortalData(savedData);
    setEditorStatus('Draft saved');
  }

  function submitForApproval() {
    if (!activePage || !canRequestPublish) return;
    const savedData = saveWebsiteDraftContent(websiteId, activePage.id, draftValues, actorName);
    refreshPortalData(submitWebsiteDraftForApproval(websiteId, activePage.id, actorName));
    if (savedData) setEditorStatus('Submitted for approval');
  }

  const draftCount = Object.values(portalData.content?.[websiteId] ?? {}).filter((page) => Object.keys(page.draft ?? {}).length).length;

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Website content manager">
        <PortalSidebar title="Website" />

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Content Management</p>
              <h2>{website?.name ?? 'Website'} Content</h2>
              <p className="portal-role-line">Signed in as <strong>{actorName}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <article className="portal-site-card">
            <div className="portal-site-preview">
              <strong>{website?.name?.toUpperCase() ?? 'WEBSITE'}</strong>
              <span>{website?.domain}</span>
            </div>
            <div>
              <span className="portal-status">{canEditContent ? 'Draft First' : 'Read Only'}</span>
              <h3>Git-Ready Website Content</h3>
              <p>Layouts and code stay locked in React/CSS. Approved content is prepared for Git-backed JSON files.</p>
              <dl>
                <div><dt>Publishing</dt><dd>{website?.publishMode}</dd></div>
                <div><dt>Draft Pages</dt><dd>{draftCount}</dd></div>
                <div><dt>Content File</dt><dd>{contentFilePath}</dd></div>
              </dl>
            </div>
          </article>

          <section className="portal-editor-panel">
            <div className="portal-editor-header">
              <div>
                <p className="eyebrow">CMS Phase 4.3</p>
                <h2>{canEditContent ? 'Schema-Driven Draft Editor' : 'Content Viewer'}</h2>
                <p>{canEditContent ? 'Edit approved fields safely. Future publishes will write approved content back to Git content files.' : 'View approved website content. Your role does not allow content edits.'}</p>
              </div>
              <a href={website?.url ?? '/'}>View Live Site</a>
            </div>

            <div className="portal-inline-actions">
              {pages.map((page) => (
                <button type="button" key={page.id} onClick={() => selectPage(page.id)}>{page.title}</button>
              ))}
            </div>

            <div className="portal-grid-two">
              <section className="portal-management-card compact">
                <div className="portal-section-title-row"><strong>{activePage?.title ?? 'Page'} Fields</strong><span>{editorStatus}</span></div>
                <p>{activePage?.description ?? 'Select a page to edit.'}</p>

                <div className="portal-admin-form">
                  {(activePage?.fields ?? []).map((field) => (
                    <label key={field.id}>
                      {field.label}
                      {field.type === 'textarea' ? (
                        <textarea value={draftValues[field.id] ?? ''} rows="4" readOnly={!canEditContent} onChange={(event) => updateDraftValue(field.id, event.target.value)} />
                      ) : (
                        <input value={draftValues[field.id] ?? ''} readOnly={!canEditContent} onChange={(event) => updateDraftValue(field.id, event.target.value)} />
                      )}
                    </label>
                  ))}
                </div>

                {(canSaveDrafts || canRequestPublish) ? (
                  <div className="portal-action-row portal-action-row-primary">
                    {canSaveDrafts && <button type="button" onClick={saveDraft}>Save Draft</button>}
                    {canRequestPublish && <button type="button" className="portal-warning-button" onClick={submitForApproval}>Submit For Approval</button>}
                  </div>
                ) : (
                  <p className="portal-inline-notice">Read-only access. You can view website content, but cannot save drafts or submit publish requests.</p>
                )}
                <p className="portal-inline-notice">Submitting does not publish the website yet. It creates a review item for KSJ Digital.</p>
              </section>

              <section className="portal-help-card portal-selection-guide">
                <p className="eyebrow">Live vs Draft</p>
                <h3>{activePage?.title ?? 'Page'} Snapshot</h3>
                <p>Live content remains protected until a publish request is approved and written to the matching content file.</p>

                <div className="portal-detail-group">
                  <strong>Current Live</strong>
                  {(activePage?.fields ?? []).map((field) => <small key={field.id}>{field.label}: {activePageContent.live?.[field.id] || 'Empty'}</small>)}
                </div>

                <div className="portal-detail-group">
                  <strong>Current Draft</strong>
                  {(activePage?.fields ?? []).map((field) => <small key={field.id}>{field.label}: {draftValues[field.id] || 'Empty'}</small>)}
                </div>

                <div className="portal-detail-group">
                  <strong>Git Content Target</strong>
                  <small>{contentFilePath}</small>
                  <small>Manual KSJ content edits and future portal publishes should both update this file path.</small>
                </div>
              </section>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
