export const SUPPORT_TICKET_STATUSES = ['Open', 'Waiting On Client', 'Waiting On Staff', 'Resolved', 'Closed'];
export const SUPPORT_TICKET_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
export const SUPPORT_STAFF_ROLES = ['owner', 'websiteManager', 'supportAgent'];

export function getSupportWebsiteName(websiteId, websites = []) {
  return websites.find((website) => website.id === websiteId)?.name ?? 'Unknown Website';
}

export function getSupportUserName(userId, users = []) {
  return users.find((user) => user.id === userId)?.name ?? 'Unassigned';
}

export function isOpenSupportTicket(ticket) {
  return ticket.status !== 'Closed' && ticket.status !== 'Resolved';
}

export function getSupportStaffUsers(users = []) {
  return users.filter((portalUser) => SUPPORT_STAFF_ROLES.includes(portalUser.role));
}

export function getSupportTicketStats(tickets = []) {
  return [
    { label: 'Open', value: tickets.filter((ticket) => ticket.status === 'Open').length },
    { label: 'Waiting Client', value: tickets.filter((ticket) => ticket.status === 'Waiting On Client').length },
    { label: 'Waiting Staff', value: tickets.filter((ticket) => ticket.status === 'Waiting On Staff').length },
    { label: 'Closed', value: tickets.filter((ticket) => ticket.status === 'Closed').length },
    { label: 'Active', value: tickets.filter(isOpenSupportTicket).length },
  ];
}

export function createSupportReply({ body, author, isStaffReply }) {
  return {
    id: `message-${Date.now()}`,
    author: author || 'KSJ Digital User',
    type: isStaffReply ? 'staff' : 'client',
    body: String(body ?? '').trim(),
    createdAt: 'Just now',
  };
}

export function createSupportInternalNote({ body, author }) {
  return {
    id: `note-${Date.now()}`,
    author: author || 'KSJ Digital Staff',
    body: String(body ?? '').trim(),
    createdAt: 'Just now',
  };
}

export function updateSupportTicketList(tickets = [], ticketId, updates = {}) {
  return tickets.map((ticket) => (
    ticket.id === ticketId
      ? { ...ticket, ...updates, updatedAt: 'Just now' }
      : ticket
  ));
}
