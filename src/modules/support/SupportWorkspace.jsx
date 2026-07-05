import { TicketPanel, StatusPanel } from '../../components/Panels.jsx'
import { Layout } from '../../layouts/Shell.jsx'

export function SupportWorkspace({ client = false }) {
  return <Layout client={client} title="Support"><div className="supportGrid"><TicketPanel /><section className="card conversation"><h2>Ticket Conversation</h2><p><b>Client:</b> Can we update the homepage banner before launch?</p><p><b>KSJ:</b> Yes, upload the replacement image and we will prepare the draft.</p><textarea placeholder="Write reply..."></textarea><button>Send Reply</button></section><StatusPanel /></div></Layout>
}
