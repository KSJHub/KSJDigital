import { useMemo, useState } from 'react';
import PortalSidebar from '../components/PortalSidebar';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { hasPermission, PORTAL_PERMISSIONS } from '../portals/auth/permissions';
import { getPortalData, savePortalData } from '../portals/data/portalManager';
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  createSupportInternalNote,
  createSupportReply,
  getSupportStaffUsers,
  getSupportTicketStats,
  getSupportUserName,
  getSupportWebsiteName,
  updateSupportTicketList,
} from '../portals/support/supportTickets';

export default function PortalsSupport() {
  const session = getStoredSession();
  const user = session?.user;
  const canManageSupport = hasPermission(user, PORTAL_PERMISSIONS.MANAGE_SUPPORT);
  const initialPortalData = getPortalData();
  const [portalData, setPortalData] = useState(initialPortalData);
  const [activeStatus, setActiveStatus] = useState('Open');
  const [selectedTicketId, setSelectedTicketId] = useState(initialPortalData.supportTickets?.[0]?.id ?? null);
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');

  const tickets = portalData.supportTickets ?? [];
  const websites = portalData.websites ?? [];
  const users = portalData.users ?? [];
  const staffUsers = getSupportStaffUsers(users);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0],
    [tickets, selectedTicketId],
  );

  const filteredTickets = tickets.filter((ticket) => ticket.status === activeStatus);
  const ticketStats = getSupportTicketStats(tickets);

  function commitPortalData(nextData) {
    const savedData = savePortalData(nextData);
    setPortalData(savedData);
    return savedData;
  }

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  function updateTicket(ticketId, updates) {
    if (!canManageSupport) return;
    commitPortalData({
      ...portalData,
      supportTickets: updateSupportTicketList(tickets, ticketId, updates),
    });
  }

  function handleStatusChange(status) {
    if (!selectedTicket || !canManageSupport) return;
    updateTicket(selectedTicket.id, { status });
  }

  function handlePriorityChange(priority) {
    if (!selectedTicket || !canManageSupport) return;
    updateTicket(selectedTicket.id, { priority });
  }

  function handleAssignmentChange(assignedTo) {
    if (!selectedTicket || !canManageSupport) return;
    updateTicket(selectedTicket.id, { assignedTo });
  }

  function handleReply() {
    if (!selectedTicket || !replyText.trim()) return;
    const isStaffReply = canManageSupport;
    const nextMessage = createSupportReply({
      body: replyText,
      author: user?.name ?? 'KSJ Digital User',
      isStaffReply,
    });

    commitPortalData({
      ...portalData,
      supportTickets: updateSupportTicketList(tickets, selectedTicket.id, {
        messages: [...(selectedTicket.messages ?? []), nextMessage],
        status: isStaffReply ? 'Waiting On Client' : 'Waiting On Staff',
      }),
    });
    setReplyText('');
  }

  function handleInternalNote() {
    if (!selectedTicket || !noteText.trim() || !canManageSupport) return;
    const nextNote = createSupportInternalNote({
      body: noteText,
      author: user?.name ?? 'KSJ Digital Staff',
    });

    updateTicket(selectedTicket.id, {
      internalNotes: [...(selectedTicket.internalNotes ?? []), nextNote],
    });
    setNoteText('');
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal support">
        <PortalSidebar />

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Support</p>
              <h2>KSJ Digital Support</h2>
              <p className="portal-role-line">Signed in as <strong>{user?.name ?? 'Client'}</strong></p>
            </div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>

          <div className="portal-admin-stats">
            {ticketStats.map((stat) => (
              <article className="portal-help-card" key={stat.label}>
                <p className="eyebrow">{stat.label}</p>
                <h3>{stat.value}</h3>
              </article>
            ))}
          </div>

          <div className="portal-inline-actions">
            {SUPPORT_TICKET_STATUSES.map((status) => <button type="button" key={status} onClick={() => setActiveStatus(status)}>{status}</button>)}
          </div>

          <div className="portal-grid-two">
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">{activeStatus}</p>
                  <h2>{canManageSupport ? 'Ticket Queue' : 'My Support Tickets'}</h2>
                  <p>{canManageSupport ? 'Track client support requests, website issues, and internal follow-ups.' : 'View your support requests and reply to KSJ Digital.'}</p>
                </div>
              </div>

              <div className="portal-section-list">
                {(filteredTickets.length ? filteredTickets : tickets).map((ticket) => (
                  <article key={ticket.id}>
                    <div>
                      <div className="portal-section-title-row"><strong>{ticket.subject}</strong><span>{ticket.status}</span></div>
                      <p>{ticket.summary}</p>
                      <ul>
                        <li>{ticket.id}</li>
                        <li>{getSupportWebsiteName(ticket.websiteId, websites)}</li>
                        <li>Priority: {ticket.priority}</li>
                        <li>Assigned: {getSupportUserName(ticket.assignedTo, users)}</li>
                      </ul>
                    </div>
                    <button type="button" onClick={() => setSelectedTicketId(ticket.id)}>View</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="portal-help-card portal-selection-guide">
              <p className="eyebrow">Ticket Details</p>
              <h3>{selectedTicket?.subject ?? 'No ticket selected'}</h3>
              <p>{selectedTicket?.summary ?? 'Select a ticket to view the conversation.'}</p>

              {selectedTicket && (
                <>
                  <div className="portal-detail-group">
                    <strong>Ticket Info</strong>
                    <small>Website: {getSupportWebsiteName(selectedTicket.websiteId, websites)}</small>
                    <small>Status: {selectedTicket.status}</small>
                    <small>Priority: {selectedTicket.priority}</small>
                    <small>Assigned: {getSupportUserName(selectedTicket.assignedTo, users)}</small>
                    <small>Updated: {selectedTicket.updatedAt}</small>
                  </div>

                  {canManageSupport && (
                    <div className="portal-admin-form">
                      <label>
                        Status
                        <select value={selectedTicket.status} onChange={(event) => handleStatusChange(event.target.value)}>
                          {SUPPORT_TICKET_STATUSES.map((status) => <option key={status}>{status}</option>)}
                        </select>
                      </label>
                      <label>
                        Priority
                        <select value={selectedTicket.priority} onChange={(event) => handlePriorityChange(event.target.value)}>
                          {SUPPORT_TICKET_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
                        </select>
                      </label>
                      <label>
                        Assigned Staff
                        <select value={selectedTicket.assignedTo ?? ''} onChange={(event) => handleAssignmentChange(event.target.value)}>
                          <option value="">Unassigned</option>
                          {staffUsers.map((staff) => <option value={staff.id} key={staff.id}>{staff.name}</option>)}
                        </select>
                      </label>
                    </div>
                  )}

                  <div className="portal-detail-group">
                    <strong>Conversation</strong>
                    {(selectedTicket.messages ?? []).map((message) => (
                      <small key={message.id}>{message.author}: {message.body}</small>
                    ))}
                  </div>

                  <div className="portal-admin-form">
                    <label>
                      Reply
                      <textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} rows="3" placeholder="Write a reply..." />
                    </label>
                    <button type="button" onClick={handleReply}>Reply</button>
                  </div>

                  {canManageSupport && (
                    <>
                      <div className="portal-detail-group">
                        <strong>Internal Notes</strong>
                        {(selectedTicket.internalNotes ?? []).length ? selectedTicket.internalNotes.map((note) => (
                          <small key={note.id}>{note.author}: {note.body}</small>
                        )) : <small>No internal notes yet.</small>}
                      </div>

                      <div className="portal-admin-form">
                        <label>
                          Add Internal Note
                          <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} rows="3" placeholder="Staff-only note..." />
                        </label>
                        <button type="button" onClick={handleInternalNote}>Add Note</button>
                      </div>

                      <div className="portal-action-row portal-action-row-danger">
                        <button type="button" className="portal-warning-button" onClick={() => handleStatusChange('Closed')}>Close Ticket</button>
                        <button type="button" className="portal-secondary-button" onClick={() => handleStatusChange('Open')}>Reopen</button>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
