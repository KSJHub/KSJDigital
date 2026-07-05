import { websites, ownerStats, clientStats } from '../../services/mockData.js'
import { Stat } from '../../components/Stat.jsx'
import { WebsiteCard } from '../../components/WebsiteCard.jsx'
import { Preview, AnalyticsPanel, ActivityPanel, TicketPanel, StatusPanel, QuickActions } from '../../components/Panels.jsx'
import { Layout } from '../../layouts/Shell.jsx'

export function Dashboard({ client = false }) {
  const visibleWebsites = client ? [websites[0]] : websites
  return <Layout client={client}><div className="stats">{(client ? clientStats : ownerStats).map(item => <Stat key={item[0]} item={item} />)}</div><div className="singleGrid"><section className="card websites"><div className="panelHead"><h2>{client ? 'My Website' : 'Your Websites'}</h2><button>{client ? 'Edit Website' : 'Create New Website'}</button></div>{visibleWebsites.map((site, index) => <WebsiteCard key={site.name} site={site} active={index === 0} />)}</section><Preview /></div><div className="bottom four"><AnalyticsPanel /><ActivityPanel /><TicketPanel /><StatusPanel /></div><QuickActions client={client} /></Layout>
}
