import { Layout } from '../../layouts/Shell.jsx'

const tickets = [
  ['Homepage banner update', 'Open', 'High', 'Today'],
  ['Question about media upload', 'Waiting Reply', 'Medium', 'Yesterday'],
  ['Merch page coming soon text', 'Resolved', 'Low', '3 days ago'],
  ['Social link change', 'Open', 'Medium', '4 days ago'],
]

const helpCards = [
  ['Website Changes', 'Ask KSJ Digital to help with page edits or design updates.'],
  ['Media Support', 'Get help with images, banners, icons and uploads.'],
  ['Publishing', 'Request support when drafts are ready to go live.'],
]

export function SupportWorkspace({ client = false }) {
  return <Layout client={client} title="Support"><section className="supportHero card"><div><span>{client ? 'Client Support' : 'Support Desk'}</span><h2>{client ? 'How can KSJ Digital help?' : 'Support Inbox'}</h2><p>{client ? 'Open a ticket, ask for help, or track website requests from your portal.' : 'Manage client conversations, priorities and support history.'}</p></div><button>New Ticket</button></section><div className="supportStats"><article className="card"><span>Open Tickets</span><strong>2</strong><small>Needs attention</small></article><article className="card"><span>Waiting Reply</span><strong>1</strong><small>Client response needed</small></article><article className="card"><span>Resolved</span><strong>8</strong><small>This month</small></article><article className="card"><span>Avg Response</span><strong>2h</strong><small>Current average</small></article></div><section className="supportDesk"><aside className="card ticketInbox"><div className="panelHead"><h2>Tickets</h2><button>Filter</button></div>{tickets.map(ticket => <article key={ticket[0]}><div><b>{ticket[0]}</b><small>{ticket[3]}</small></div><span>{ticket[1]}</span><em>{ticket[2]}</em></article>)}</aside><section className="card conversation supportConversation"><div className="panelHead"><h2>Homepage banner update</h2><button>High Priority</button></div><div className="message clientMessage"><b>{client ? 'You' : 'Client'}</b><p>Can we update the homepage banner before launch?</p></div><div className="message ksjMessage"><b>KSJ Digital</b><p>Yes. Upload the replacement image and we will prepare the draft for review.</p></div><textarea placeholder="Write reply..."></textarea><div className="replyActions"><button>Attach File</button><button>Send Reply</button></div></section><aside className="card helpPanel"><h2>Help Centre</h2>{helpCards.map(card => <article key={card[0]}><b>{card[0]}</b><p>{card[1]}</p></article>)}</aside></section></Layout>
}
