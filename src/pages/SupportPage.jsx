import { Layout } from '../layouts/Shell.jsx'

const defaultTickets = [
  ['TwoToneTaj', 'Homepage banner change', 'High'],
  ['KSJ Diamond Gaming', 'Launch page wording', 'Medium'],
  ['Goliath', 'Discord widget issue', 'Low'],
]

export function SupportPage({ client = false }) {
  const tickets = client
    ? defaultTickets.filter(ticket => ticket[0] === 'TwoToneTaj')
    : defaultTickets

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
        <button>New Ticket</button>
      </section>

      <section className="card ticketInbox">
        <div className="panelHead">
          <h2>Tickets</h2>
          <button>Filter</button>
        </div>
        {tickets.map(ticket => (
          <article key={ticket[1]}>
            <div>
              <b>{ticket[1]}</b>
              <small>{ticket[0]}</small>
            </div>
            <span>Open</span>
            <em>{ticket[2]}</em>
          </article>
        ))}
      </section>
    </Layout>
  )
}
