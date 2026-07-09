import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { api } from '../services/api.js'

export function SupportPage({ client = false }) {
  const account = getAccountFromPath()
  const [tickets, setTickets] = useState([])
  const [status, setStatus] = useState('Loading')

  useEffect(() => {
    api
      .getTickets()
      .then(records => {
        const visible = client
          ? records.filter(ticket => account?.websiteIds?.includes(ticket.websiteId))
          : records
        setTickets(visible)
        setStatus('Server synced')
      })
      .catch(error => {
        setTickets([])
        setStatus(error.message || 'Support API unavailable')
      })
  }, [account, client])

  async function createTicket() {
    try {
      const ticket = await api.createTicket({
        websiteId: account?.websiteId || 'unassigned',
        clientName: account?.name || 'Client',
        subject: 'New support request',
        priority: 'Medium',
        message: 'Support request created from the client portal.',
      })
      setTickets(current => [ticket, ...current])
      setStatus('Ticket created')
    } catch (error) {
      setStatus(error.message || 'Create failed')
    }
  }

  return (
    <Layout client={client} title="Support">
      <section className="supportHero card">
        <div>
          <span>Support</span>
          <h2>{client ? 'Need help with your website?' : 'Support Queue'}</h2>
          <p>
            {client
              ? 'Open a request and track replies from your portal.'
              : 'Review client requests and keep support work organised.'}
          </p>
        </div>
        <button onClick={createTicket}>{client ? 'New Ticket' : status}</button>
      </section>

      <section className="card ticketInbox">
        <div className="panelHead">
          <h2>Tickets</h2>
          <button>{tickets.length} Loaded</button>
        </div>
        {tickets.map(ticket => (
          <article key={ticket.id}>
            <div>
              <b>{ticket.subject}</b>
              <small>{ticket.clientName || ticket.websiteId}</small>
            </div>
            <span>{ticket.status}</span>
            <em>{ticket.priority}</em>
          </article>
        ))}
        {!tickets.length && <p className="emptyState">No support tickets loaded yet.</p>}
      </section>
    </Layout>
  )
}
