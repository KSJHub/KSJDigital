import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'

function queueStats(tickets) {
  const open = tickets.filter(ticket => ticket.status !== 'Resolved')
  const high = open.filter(ticket => ticket.priority === 'High')
  const waiting = open.filter(ticket => ticket.status === 'Waiting Reply')
  const resolved = tickets.filter(ticket => ticket.status === 'Resolved')

  return [
    ['Open Tickets', String(open.length), 'Across all clients'],
    ['High Priority', String(high.length), 'Needs attention'],
    ['Waiting Reply', String(waiting.length), 'Client waiting'],
    ['Resolved', String(resolved.length), 'Resolved tickets'],
  ]
}

export function OwnerSupportPage() {
  const [tickets, setTickets] = useState([])
  const [status, setStatus] = useState('Loading')

  useEffect(() => {
    api
      .getTickets()
      .then(records => {
        setTickets(records)
        setStatus('Server synced')
      })
      .catch(error => {
        setTickets([])
        setStatus(error.message || 'Support API unavailable')
      })
  }, [])

  async function updateTicket(ticket, changes) {
    try {
      const records = await api.updateTicket(ticket.id, changes)
      setTickets(records)
      setStatus('Ticket updated')
    } catch (error) {
      setStatus(error.message || 'Update failed')
    }
  }

  return (
    <Layout title="Support">
      <section className="moduleHero card">
        <div>
          <span>Owner Support Desk</span>
          <h2>Client Support Management</h2>
          <p>
            This is the KSJ Digital owner inbox for every client request. Clients only see their own
            support portal.
          </p>
        </div>
        <button>{status}</button>
      </section>
      <div className="stats">
        {queueStats(tickets).map(item => (
          <article className="card stat" key={item[0]}>
            <div>
              <span>{item[0]}</span>
              <strong>{item[1]}</strong>
              <small>{item[2]}</small>
            </div>
            <i />
          </article>
        ))}
      </div>
      <section className="supportOwnerGrid">
        <section className="card ticketInbox ownerInbox">
          <div className="panelHead">
            <h2>All Client Tickets</h2>
            <button>{tickets.length} Loaded</button>
          </div>
          {tickets.map(ticket => (
            <article key={ticket.id}>
              <div>
                <b>{ticket.subject}</b>
                <small>{ticket.clientName || ticket.websiteId} · Owner visible only</small>
              </div>
              <span>{ticket.status}</span>
              <em>{ticket.priority}</em>
              <button onClick={() => updateTicket(ticket, { status: 'Waiting Reply' })}>Reply</button>
            </article>
          ))}
          {!tickets.length && <p className="emptyState">No support tickets loaded yet.</p>}
        </section>
        <aside className="card managerPanel">
          <h2>Owner Actions</h2>
          <div className="managerActions">
            <button disabled={!tickets.length}>Assign Ticket</button>
            <button disabled={!tickets.length}>Reply as KSJ Digital</button>
            <button disabled={!tickets.length}>Mark Resolved</button>
            <button disabled={!tickets.length}>Escalate</button>
          </div>
        </aside>
      </section>
    </Layout>
  )
}
