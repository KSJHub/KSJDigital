import { useMemo, useState } from 'react';
import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { getPortalData, savePortalData } from '../portals/data/portalManager';

const ticketStatuses = ['Open', 'Waiting On Client', 'Waiting On Staff', 'Resolved', 'Closed'];
const ticketPriorities = ['Low', 'Normal', 'High', 'Urgent'];

function getWebsiteName(websiteId, websites) {
  return websites.find((website) => website.id === websiteId)?.name ?? 'Unknown Website';
}

function getUserName(userId, users) {
  return users.find((user) => user.id === userId)?.name ?? 'Unassigned';
}

function isOpenTicket(ticket) {
  return ticket.status !== 'Closed' && ticket.status !== 'Resolved';
}

export default function PortalsSupport() {
  const session = getStoredSession();
  const initialPortalData = getPortalData();
  const [portalData, setPortalData] = useState(initialPortalData);
  const [activeStatus, setActiveStatus] = useState('Open');
  const [selectedTicketId, setSelectedTicketId] = useState(initialPortalData.supportTickets?.[0]?.id ?? null);
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');

  const tickets = portalData.supportTickets ?? [];
  const websites = portalData.websites ?? [];
  const users = portalData.users ?? [];
  const staffUsers = users.filter((user) => ['owner', 'websiteManager', 'supportAgent'].includes(user.role));

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0],
    [tickets, selectedTicketId],
  );

  const filteredTickets = tickets.filter((ticket) => ticket.status === activeStatus);

  const ticketStats = [
    { label: 'Open', value: tickets.filter((ticket) => ticket.status === 'Open').length },
    { label: 'Waiting Client', value: tickets.filter((ticket) => ticket.status === 'Waiting On Client').length },
    { label: 'Waiting Staff', value: tickets.filter((ticket) => ticket.status === 'Waiting On Staff').length },
    { label: 'Closed', value: tickets.filter((ticket) => ticket.status === 'Closed').length },
    { label: 'Active', value: tickets.filter(isOpenTicket).length },
  ];

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
    commitPortalData({
      ...portalData,
      supportTickets: tickets.map((ticket) => (
        ticket.id === ticketId ? { ...ticket, ...updates, updatedAt: 'Just now' } : ticket
      )),
    });
  }

  function handleStatusChange(status) {
    if (!selectedTicket) return;
    updateTicket(selectedTicket.id, { status });
  }

  function handlePriorityChange(priority) {
    if (!selectedTicket) return;
    updateTicket(selectedTicket.id, { priority });
  }

  function handleAssignmentChange(assignedTo) {
    if (!selectedTicket) return;
    updateTicket(selectedTicket.id, { assignedTo });
  }

  function handleReply() {
    if (!selectedTicket || !replyText.trim()) return;
    const nextMessage = {
      id: `message-${Date.now()}`,
      author: session?.user?.name ?? 'KSJ Digital User',
      type: session?.user?.role === 'owner' ? 'staff' : 'client',
      body: replyText.trim(),
      createdAt: 'Just now',
    };

    updateTicket(selectedTicket.id, {
      messages: [...(selectedTicket.messages ?? []), nextMessage],
      status: session?.user?.role === 'owner' ? 'Waiting On Client' : 'Waiting On Staff',
    });
    setReplyText('');
  }

  function handleInternalNote() {
    if (!selectedTicket || !noteText.trim()) return;
    const nextNote = {
      id: `note-${Date.now()}`,
      author: session?.user?.name ?? 'KSJ Digital Staff',
      body: noteText.trim(),
      createdAt: 'Just now',
    };

    updateTicket(selectedTicket.id, {
      internalNotes: [...(selectedTicket.internalNotes ?? []), nextNote],
    });
    setNoteText('');
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal support">
        <aside className="portal-sidebar">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <span>Portals</span>
          <nav>
            <a href="/portals/dashboard">Dashboard</a>
            <a href="/portals/websites/twotonetaj">My Website</a>
            <a href="/portals/drafts">Drafts</a>
            <a href="/portals/publish-requests">Publish Requests</a>
            <a href="/portals/support" className="active">Support</a>
            <a href="/portals/account">Account</a>
          </nav>
        </aside>

        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div>
              <p className="eyebrow">Support</p>
              <h2>KSJ Digital Support</h2>
              <p className="portal-role-line">Signed in as <strong>{session?.user?.name ?? 'Client'}</strong></p>
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
            {ticketStatuses.map((status) => <button type="button" key={status} onClick={() => setActiveStatus(status)}>{status}</button>)}
          </div>

          <div className="portal-grid-two">
            <section className="portal-editor-panel">
              <div className="portal-editor-header">
                <div>
                  <p className="eyebrow">{activeStatus}</p>
                  <h2>Ticket Queue</h2>
                  <p>Track client support requests, website issues, and internal follow-ups.</p>
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
                        <li>{getWebsiteName(ticket.websiteId, websites)}</li>
                        <li>Priority: {ticket.priority}</li>
                        <li>Assigned: {getUserName(ticket.assignedTo, users)}</li>
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
                    <small>Website: {getWebsiteName(selectedTicket.websiteId, websites)}</small>
                    <small>Status: {selectedTicket.status}</small>
                    <small>Priority: {selectedTicket.priority}</small>
                    <small>Assigned: {getUserName(selectedTicket.assignedTo, users)}</small>
                    <small>Updated: {selectedTicket.updatedAt}</small>
                  </div>

                  <div className="portal-admin-form">
                    <label>
                      Status
                      <select value={selectedTicket.status} onChange={(event) => handleStatusChange(event.target.value)}>
                        {ticketStatuses.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                    <label>
                      Priority
                      <select value={selectedTicket.priority} onChange={(event) => handlePriorityChange(event.target.value)}>
                        {ticketPriorities.map((priority) => <option key={priority}>{priority}</option>)}
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
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
