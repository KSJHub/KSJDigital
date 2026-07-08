import { Layout } from '../layouts/Shell.jsx'
import { getTickets } from '../services/platform.js'

const queueStats = [
  ['Open Tickets', '3', 'Across all clients'],
  ['High Priority', '1', 'Needs attention'],
  ['Waiting Reply', '2', 'Client waiting'],
  ['Resolved', '8', 'This month'],
]

export function OwnerSupportPage() {
  const tickets = getTickets()
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
        <button>New Internal Note</button>
      </section>
      <div className="stats">
        {queueStats.map(item => (
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
            <button>Filter</button>
          </div>
          {tickets.map(ticket => (
            <article key={ticket[1]}>
              <div>
                <b>{ticket[1]}</b>
                <small>{ticket[0]} · Owner visible only</small>
              </div>
              <span>Open</span>
              <em>{ticket[2]}</em>
              <button>Reply</button>
            </article>
          ))}
        </section>
        <aside className="card managerPanel">
          <h2>Owner Actions</h2>
          <div className="managerActions">
            <button>Assign Ticket</button>
            <button>Reply as KSJ Digital</button>
            <button>Mark Resolved</button>
            <button>Escalate</button>
          </div>
        </aside>
      </section>
    </Layout>
  )
}
