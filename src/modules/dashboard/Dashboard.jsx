import { websites, ownerStats, clientStats } from '../../services/mockData.js'
import { Stat, WebsiteCard, Preview, ActivityPanel, TicketPanel, StatusPanel, QuickActions, PublishPanel } from '../../components/UI.jsx'
import { Layout } from '../../layouts/Shell.jsx'

export function Dashboard({ client = false }) {
  const visibleWebsites = client ? [websites[0]] : websites
  const stats = client ? clientStats : ownerStats
  const openWebsites = () => { location.href = client ? '/client/website' : '/owner/websites' }

  return <Layout client={client} title={client ? 'My Website' : 'Dashboard'}>
    <div className="stats">{stats.map(item => <Stat key={item[0]} item={item} />)}</div>
    <div className="singleGrid">
      <section className="card websites">
        <div className="panelHead"><h2>{client ? 'Your Website' : 'Client Websites'}</h2><button onClick={openWebsites}>{client ? 'Manage Website' : 'Manage Websites'}</button></div>
        {visibleWebsites.map((site, index) => <WebsiteCard key={site.name} site={site} active={index === 0} />)}
      </section>
      <Preview />
    </div>
    <div className="bottom four"><ActivityPanel /><PublishPanel /><TicketPanel /><StatusPanel /></div>
    <QuickActions client={client} />
  </Layout>
}
